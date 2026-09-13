import * as path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BreakingChangeService,
  extractApiSurface,
  diffSurfaces,
  findConsumerCallSites,
  classifyChange,
} from '../service';

const fixtures = path.join(__dirname, 'fixtures', 'monorepo');
const beforeRoot = path.join(fixtures, 'packages', 'shared-before');
const afterRoot = path.join(fixtures, 'packages', 'shared-after');

describe('extractApiSurface', () => {
  it('extracts exported functions from a package entry', () => {
    const surface = extractApiSurface(beforeRoot);
    assert.equal(surface.packageName, '@acme/shared');
    const names = surface.exports.map((e) => e.exportName).sort();
    assert.deepEqual(names, ['Helper', 'add', 'greet']);
    assert.ok(surface.exports.find((e) => e.exportName === 'greet')?.kind === 'function');
  });
});

describe('diffSurfaces', () => {
  it('flags greet as signature-changed and leaves add compatible', () => {
    const before = extractApiSurface(beforeRoot);
    const after = extractApiSurface(afterRoot);
    const changes = diffSurfaces(before, after);
    assert.ok(changes.some((c) => c.exportName === 'greet' && c.severity === 'signature-changed'));
    assert.ok(!changes.some((c) => c.exportName === 'add'));
    assert.ok(changes.some((c) => c.exportName === 'Helper'));
  });

  it('treats new optional params as compatible widening', () => {
    const result = classifyChange(
      {
        exportName: 'f',
        kind: 'function',
        signature: '(a: string) => void',
        paramCount: 1,
        optionalParamCount: 0,
      },
      {
        exportName: 'f',
        kind: 'function',
        signature: '(a: string, b?: number) => void',
        paramCount: 2,
        optionalParamCount: 1,
      }
    );
    assert.equal(result.severity, 'compatible');
  });
});

describe('findConsumerCallSites', () => {
  it('finds greet call in web app but not forced for add-only api', () => {
    const sites = findConsumerCallSites(fixtures, '@acme/shared', ['greet', 'add']);
    assert.ok((sites.get('greet') ?? []).some((s) => s.file.includes('apps/web')));
    assert.ok((sites.get('add') ?? []).length >= 1);
  });
});

describe('BreakingChangeService.analyze with explicit roots', () => {
  it('separates broken greet call sites from compatible add usage', async () => {
    const service = new BreakingChangeService(fixtures);
    const report = await service.analyze({
      packageName: '@acme/shared',
      beforeRoot,
      afterRoot,
    });
    const greet = report.changes.find((c) => c.exportName === 'greet');
    assert.ok(greet);
    assert.equal(greet!.severity, 'signature-changed');
    assert.ok(greet!.callSites.some((s) => s.file.includes('web')));
    assert.ok(!report.changes.some((c) => c.exportName === 'add'));
    const text = service.formatReport(report);
    assert.match(text, /greet/);
  });
});
