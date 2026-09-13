export type {
  ApiExport,
  ApiSurface,
  BreakingChange,
  BreakingReport,
  CallSite,
  ChangeSeverity,
  ExportKind,
} from './types';
export { SEVERITY_ORDER } from './types';

export { extractApiSurface } from './extract';
export { classifyChange, diffSurfaces } from './diff';
export { findConsumerCallSites } from './consumers';
export { findPackageRoot, materializePackageAtRef } from './baseline';
export { parseGithubRemote, postPrComment } from './github';

import * as path from 'path';
import { extractApiSurface } from './extract';
import { diffSurfaces } from './diff';
import { findConsumerCallSites } from './consumers';
import { findPackageRoot, materializePackageAtRef } from './baseline';
import type { ApiSurface, BreakingReport } from './types';
import { SEVERITY_ORDER } from './types';

export interface AnalyzeOptions {
  packageName: string;
  baseRef?: string;
  /** Explicit before/after roots (tests / CLI). */
  beforeRoot?: string;
  afterRoot?: string;
}

/**
 * VS Code–free breaking-change analysis.
 */
export class BreakingChangeService {
  constructor(private readonly workspaceRoot: string) {}

  async analyze(options: AnalyzeOptions): Promise<BreakingReport> {
    const notes: string[] = [
      'v1 supports TypeScript/JavaScript packages only — other languages are skipped with a note.',
    ];
    const baseRef = options.baseRef ?? 'HEAD~1';

    let before: ApiSurface;
    let after: ApiSurface;
    let cleanup: (() => void) | undefined;

    try {
      if (options.beforeRoot && options.afterRoot) {
        before = extractApiSurface(options.beforeRoot);
        after = extractApiSurface(options.afterRoot);
      } else {
        const found = findPackageRoot(this.workspaceRoot, options.packageName);
        const afterRoot = found;
        if (!afterRoot) {
          throw new Error(`Package "${options.packageName}" not found in workspace`);
        }
        after = extractApiSurface(afterRoot);
        const rel = path.relative(this.workspaceRoot, afterRoot).replace(/\\/g, '/') || '.';
        const baseline = await materializePackageAtRef(this.workspaceRoot, rel, baseRef);
        cleanup = baseline.cleanup;
        notes.push(...baseline.notes);
        before = extractApiSurface(baseline.dir);
      }

      const changes = diffSurfaces(before, after).filter((c) => c.severity !== 'compatible');
      const callSites = findConsumerCallSites(
        this.workspaceRoot,
        after.packageName,
        changes.map((c) => c.exportName)
      );
      for (const change of changes) {
        change.callSites = callSites.get(change.exportName) ?? [];
      }
      changes.sort(
        (a, b) =>
          SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
          b.callSites.length - a.callSites.length ||
          a.exportName.localeCompare(b.exportName)
      );

      return {
        packageName: after.packageName,
        baseRef,
        comparedAt: new Date().toISOString(),
        changes,
        notes,
      };
    } finally {
      cleanup?.();
    }
  }

  formatReport(report: BreakingReport): string {
    const lines = [
      `Breaking-change check for ${report.packageName} (vs ${report.baseRef}) at ${report.comparedAt}`,
      `Findings: ${report.changes.length}`,
      '',
    ];
    if (!report.changes.length) {
      lines.push('No breaking API changes detected.');
    }
    for (const c of report.changes) {
      lines.push(`[${c.severity}] ${c.exportName} — ${c.detail}`);
      if (!c.callSites.length) {
        lines.push('  (no in-repo call sites found — still flagged; absence today ≠ absence tomorrow)');
      } else {
        for (const site of c.callSites.slice(0, 8)) {
          lines.push(`  - ${site.file}:${site.line}  ${site.snippet.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
        if (c.callSites.length > 8) {
          lines.push(`  …and ${c.callSites.length - 8} more`);
        }
      }
    }
    if (report.notes.length) {
      lines.push('', 'Notes:', ...report.notes.map((n) => `- ${n}`));
    }
    return lines.join('\n');
  }

  formatMarkdown(report: BreakingReport): string {
    const lines = [
      `## Breaking-change check: \`${report.packageName}\``,
      '',
      `Compared against \`${report.baseRef}\` at ${report.comparedAt}`,
      '',
      `| Export | Severity | Call sites | Detail |`,
      `|---|---|---|---|`,
    ];
    for (const c of report.changes) {
      lines.push(
        `| \`${c.exportName}\` | ${c.severity} | ${c.callSites.length} | ${c.detail.replace(/\|/g, '\\|')} |`
      );
    }
    if (!report.changes.length) {
      lines.push('| — | — | 0 | No breaking changes |');
    }
    return lines.join('\n');
  }
}
