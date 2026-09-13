import type { ApiExport, ApiSurface, BreakingChange, ChangeSeverity } from './types';

function normalizeSig(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Heuristic: a change is a widening (compatible) if required params only decrease
 * or optional params increase without removing required ones and signature text
 * suggests optional additions. String-equal signatures are compatible.
 */
export function classifyChange(before: ApiExport, after: ApiExport): {
  severity: ChangeSeverity;
  detail: string;
} {
  if (normalizeSig(before.signature) === normalizeSig(after.signature)) {
    return { severity: 'compatible', detail: 'Signature unchanged' };
  }

  if (before.kind === 'function' && after.kind === 'function') {
    const bReq = (before.paramCount ?? 0) - (before.optionalParamCount ?? 0);
    const aReq = (after.paramCount ?? 0) - (after.optionalParamCount ?? 0);
    if (aReq < bReq) {
      return {
        severity: 'signature-changed',
        detail: `Required parameters decreased (${bReq} → ${aReq}) — callers may break`,
      };
    }
    if (aReq > bReq) {
      return {
        severity: 'signature-changed',
        detail: `Required parameters increased (${bReq} → ${aReq})`,
      };
    }
    if ((after.optionalParamCount ?? 0) > (before.optionalParamCount ?? 0)) {
      return {
        severity: 'compatible',
        detail: 'New optional parameter(s) — treated as widening',
      };
    }
    // Same arity but different types — likely narrowing or rename
    if (
      before.signature.includes('|') &&
      !after.signature.includes('|') &&
      after.signature.length < before.signature.length
    ) {
      return {
        severity: 'type-narrowed',
        detail: `Type appears narrowed: ${before.signature} → ${after.signature}`,
      };
    }
    return {
      severity: 'signature-changed',
      detail: `Signature changed: ${before.signature} → ${after.signature}`,
    };
  }

  if (before.kind === 'type' || after.kind === 'type') {
    return {
      severity: 'type-narrowed',
      detail: `Type export changed: ${before.signature} → ${after.signature}`,
    };
  }

  return {
    severity: 'signature-changed',
    detail: `Export changed: ${before.signature} → ${after.signature}`,
  };
}

/**
 * Diff two API surfaces by export name.
 */
export function diffSurfaces(before: ApiSurface, after: ApiSurface): BreakingChange[] {
  const beforeMap = new Map(before.exports.map((e) => [e.exportName, e]));
  const afterMap = new Map(after.exports.map((e) => [e.exportName, e]));
  const changes: BreakingChange[] = [];

  for (const [name, b] of beforeMap) {
    const a = afterMap.get(name);
    if (!a) {
      changes.push({
        exportName: name,
        severity: 'removed',
        before: b,
        detail: `Export "${name}" was removed`,
        callSites: [],
      });
      continue;
    }
    const { severity, detail } = classifyChange(b, a);
    if (severity !== 'compatible') {
      changes.push({
        exportName: name,
        severity,
        before: b,
        after: a,
        detail,
        callSites: [],
      });
    }
  }

  return changes;
}
