import * as path from 'path';
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { CallSite } from './types';

/**
 * Find call sites / identifier usages of package exports across the workspace.
 * Scopes to files that import the package name.
 */
export function findConsumerCallSites(
  workspaceRoot: string,
  packageName: string,
  exportNames: string[]
): Map<string, CallSite[]> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: 2 },
  });
  project.addSourceFilesAtPaths([
    path.join(workspaceRoot, '**/*.ts'),
    path.join(workspaceRoot, '**/*.tsx'),
    path.join(workspaceRoot, '**/*.js'),
    path.join(workspaceRoot, '**/*.jsx'),
  ]);

  const nameSet = new Set(exportNames);
  const byExport = new Map<string, CallSite[]>();
  for (const n of exportNames) {
    byExport.set(n, []);
  }

  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(workspaceRoot, sf.getFilePath()).replace(/\\/g, '/');
    if (rel.includes('node_modules/') || rel.includes('/dist/') || rel.startsWith('dist/')) {
      continue;
    }

    // Determine imported bindings from the target package
    const localNames = new Map<string, string>(); // local -> exportName
    for (const imp of sf.getImportDeclarations()) {
      const mod = imp.getModuleSpecifierValue();
      if (mod !== packageName && !mod.startsWith(packageName + '/')) {
        continue;
      }
      for (const spec of imp.getNamedImports()) {
        const exported = spec.getName();
        const local = spec.getAliasNode()?.getText() ?? exported;
        if (nameSet.has(exported)) {
          localNames.set(local, exported);
        }
      }
      const def = imp.getDefaultImport();
      if (def && nameSet.has('default')) {
        localNames.set(def.getText(), 'default');
      }
      const ns = imp.getNamespaceImport();
      if (ns) {
        // namespace.exportName usages handled below
        for (const exp of nameSet) {
          localNames.set(`${ns.getText()}.${exp}`, exp);
        }
      }
    }
    if (!localNames.size) {
      continue;
    }

    sf.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        const text = expr.getText();
        const exportName = localNames.get(text);
        if (exportName) {
          byExport.get(exportName)!.push({
            file: rel,
            line: node.getStartLineNumber(),
            snippet: node.getText().slice(0, 120),
          });
        }
        return;
      }
      if (Node.isIdentifier(node) && !Node.isPropertyAccessExpression(node.getParent())) {
        // skip — too noisy; prefer call / property access
      }
      if (Node.isPropertyAccessExpression(node)) {
        const text = node.getText();
        const exportName = localNames.get(text);
        if (exportName && !Node.isCallExpression(node.getParent())) {
          byExport.get(exportName)!.push({
            file: rel,
            line: node.getStartLineNumber(),
            snippet: node.getText().slice(0, 120),
          });
        }
      }
    });
  }

  return byExport;
}

void SyntaxKind;
