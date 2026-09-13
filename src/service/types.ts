export type ExportKind = 'function' | 'type' | 'class' | 'variable' | 'other';

export type ChangeSeverity = 'removed' | 'signature-changed' | 'type-narrowed' | 'compatible';

export interface ApiExport {
  exportName: string;
  kind: ExportKind;
  signature: string;
  /** Parameter count for crude widen/narrow detection on functions. */
  paramCount?: number;
  optionalParamCount?: number;
}

export interface ApiSurface {
  packageName: string;
  packageRoot: string;
  exports: ApiExport[];
}

export interface CallSite {
  file: string;
  line: number;
  snippet: string;
}

export interface BreakingChange {
  exportName: string;
  severity: ChangeSeverity;
  before?: ApiExport;
  after?: ApiExport;
  detail: string;
  callSites: CallSite[];
}

export interface BreakingReport {
  packageName: string;
  baseRef: string;
  comparedAt: string;
  changes: BreakingChange[];
  notes: string[];
}

export const SEVERITY_ORDER: Record<ChangeSeverity, number> = {
  removed: 3,
  'signature-changed': 2,
  'type-narrowed': 1,
  compatible: 0,
};
