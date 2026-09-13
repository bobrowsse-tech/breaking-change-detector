#!/usr/bin/env node
/**
 * CLI: npx breaking-change-check <packageName> [--base <ref>]
 * Runs the same analysis as the extension for CI.
 */
import * as path from 'path';
import { BreakingChangeService } from './service';

async function main() {
  const args = process.argv.slice(2);
  const packageName = args.find((a) => !a.startsWith('-'));
  if (!packageName) {
    console.error('Usage: breaking-change-check <packageName> [--base <ref>]');
    process.exit(2);
  }
  const baseIdx = args.indexOf('--base');
  const baseRef = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const root = process.cwd();
  const service = new BreakingChangeService(root);
  try {
    const report = await service.analyze({ packageName, baseRef });
    console.log(service.formatReport(report));
    const blocking = report.changes.filter(
      (c) => c.severity === 'removed' || c.severity === 'signature-changed'
    );
    process.exit(blocking.length ? 1 : 0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

void main();
