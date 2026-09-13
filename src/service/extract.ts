import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type { ApiExport, ApiSurface, ExportKind } from './types';

function resolveEntry(packageRoot: string): string | undefined {
  const pkgPath = path.join(packageRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return undefined;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    name?: string;
    main?: string;
    types?: string;
    typings?: string;
    exports?: unknown;
  };
  const candidates = [
    pkg.types,
    pkg.typings,
    typeof pkg.exports === 'string' ? pkg.exports : undefined,
    pkg.main,
    'src/index.ts',
    'index.ts',
    'src/index.js',
    'index.js',
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : path.join(packageRoot, c);
    if (fs.existsSync(abs)) {
      return abs;
    }
    // try .ts if .js listed
    if (abs.endsWith('.js') && fs.existsSync(abs.replace(/\.js$/, '.ts'))) {
      return abs.replace(/\.js$/, '.ts');
    }
  }
  return undefined;
}

function kindOf(node: ts.Node): ExportKind {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return 'function';
  }
  if (ts.isClassDeclaration(node)) {
    return 'class';
  }
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    return 'type';
  }
  if (ts.isVariableDeclaration(node) || ts.isVariableStatement(node)) {
    return 'variable';
  }
  return 'other';
}

function countParams(node: ts.SignatureDeclaration): { paramCount: number; optionalParamCount: number } {
  const params = node.parameters ?? [];
  return {
    paramCount: params.length,
    optionalParamCount: params.filter((p) => p.questionToken || p.initializer).length,
  };
}

/**
 * Extract public API surface of a TypeScript package via the Compiler API.
 */
export function extractApiSurface(packageRoot: string): ApiSurface {
  const pkgPath = path.join(packageRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json in ${packageRoot}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
  const packageName = pkg.name ?? path.basename(packageRoot);
  const entry = resolveEntry(packageRoot);
  if (!entry) {
    throw new Error(`Could not resolve entry point for ${packageName} (TypeScript/JS only in v1)`);
  }

  const configPath = ts.findConfigFile(packageRoot, ts.sys.fileExists, 'tsconfig.json');
  const config = configPath
    ? ts.parseJsonConfigFileContent(
        ts.readConfigFile(configPath, ts.sys.readFile).config,
        ts.sys,
        path.dirname(configPath)
      )
    : {
        options: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          strict: true,
          esModuleInterop: true,
        },
        fileNames: [entry],
      };

  const program = ts.createProgram({
    rootNames: config.fileNames.includes(entry) ? config.fileNames : [entry, ...config.fileNames],
    options: { ...config.options, noEmit: true },
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entry);
  if (!sourceFile) {
    throw new Error(`Failed to load entry ${entry}`);
  }

  const exportsMap = new Map<string, ApiExport>();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    // Fall back to walking export statements
    walkExports(sourceFile, checker, exportsMap);
  } else {
    for (const sym of checker.getExportsOfModule(moduleSymbol)) {
      addSymbol(sym, checker, exportsMap);
    }
  }

  return {
    packageName,
    packageRoot,
    exports: [...exportsMap.values()].sort((a, b) => a.exportName.localeCompare(b.exportName)),
  };
}

function addSymbol(
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  exportsMap: Map<string, ApiExport>
): void {
  const name = sym.getName();
  if (name === 'default' || name.startsWith('__')) {
    return;
  }
  const decls = sym.getDeclarations() ?? [];
  const decl = decls[0];
  let kind: ExportKind = 'other';
  let paramCount: number | undefined;
  let optionalParamCount: number | undefined;
  if (decl) {
    kind = kindOf(decl);
    if (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl) || ts.isFunctionExpression(decl)) {
      const counts = countParams(decl);
      paramCount = counts.paramCount;
      optionalParamCount = counts.optionalParamCount;
      kind = 'function';
    } else {
      const type = checker.getTypeOfSymbolAtLocation(sym, decl);
      const sigs = type.getCallSignatures();
      if (sigs.length) {
        kind = 'function';
        const params = sigs[0].getParameters();
        paramCount = params.length;
        optionalParamCount = params.filter((p) => {
          const d = p.valueDeclaration;
          return d && ts.isParameter(d) && (!!d.questionToken || !!d.initializer);
        }).length;
      }
    }
  }
  const type = decl
    ? ts.isTypeAliasDeclaration(decl) || ts.isInterfaceDeclaration(decl)
      ? checker.getDeclaredTypeOfSymbol(sym)
      : checker.getTypeOfSymbolAtLocation(sym, decl)
    : checker.getDeclaredTypeOfSymbol(sym);
  let signature = checker.typeToString(
    type,
    decl,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  );
  if (decl && (ts.isTypeAliasDeclaration(decl) || ts.isInterfaceDeclaration(decl))) {
    signature = decl.getText().replace(/^export\s+/, '').slice(0, 500);
  }

  exportsMap.set(name, {
    exportName: name,
    kind,
    signature,
    paramCount,
    optionalParamCount,
  });
}

function walkExports(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  exportsMap: Map<string, ApiExport>
): void {
  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const sym = checker.getSymbolAtLocation(el.name);
        if (sym) {
          addSymbol(sym, checker, exportsMap);
        }
      }
    }
    if (
      (ts.isFunctionDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isVariableStatement(stmt)) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const sym = checker.getSymbolAtLocation(decl.name);
            if (sym) {
              addSymbol(sym, checker, exportsMap);
            }
          }
        }
      } else if (stmt.name) {
        const sym = checker.getSymbolAtLocation(stmt.name);
        if (sym) {
          addSymbol(sym, checker, exportsMap);
        }
      }
    }
  }
}
