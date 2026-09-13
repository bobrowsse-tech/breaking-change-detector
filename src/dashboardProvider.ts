import * as vscode from 'vscode';
import type { BreakingReport } from './service';

const BUTTONS: { label: string; command: string }[] = [
  { label: 'Diff Against Base', command: 'breakingChange.diffAgainstBase' },
  { label: 'View Impacted Call Sites', command: 'breakingChange.viewImpacted' },
  { label: 'Post PR Check', command: 'breakingChange.postPrCheck' },
];

export class DashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private summary = 'No diff run yet.';
  private report?: BreakingReport;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'runCommand') {
        void vscode.commands.executeCommand(message.command, message.payload);
      } else if (message.type === 'jump') {
        void vscode.commands.executeCommand('breakingChange.jumpToSite', {
          file: message.file,
          line: message.line,
        });
      }
    });
    if (this.report) {
      this.showReport(this.report);
    }
  }

  setSummary(text: string) {
    this.summary = text;
    this.post({ type: 'summary', text });
  }

  showReport(report: BreakingReport) {
    this.report = report;
    this.post({
      type: 'report',
      report: {
        packageName: report.packageName,
        baseRef: report.baseRef,
        notes: report.notes,
        changes: report.changes.map((c) => ({
          exportName: c.exportName,
          severity: c.severity,
          detail: c.detail,
          callSites: c.callSites,
        })),
      },
    });
  }

  private post(message: unknown) {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(): string {
    const buttonsHtml = BUTTONS.map(
      (b) => `<button data-command="${b.command}">${b.label}</button>`
    ).join('\n');
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: var(--vscode-font-size); }
    button {
      display: block; width: 100%; margin-bottom: 6px; padding: 6px 10px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; text-align: left;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #summary { margin: 8px 0 12px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    .change { border-bottom: 1px solid var(--vscode-widget-border, transparent); padding: 6px 0; }
    .sev { text-transform: uppercase; font-size: 0.7em; }
    .sev.removed { color: var(--vscode-testing-iconFailed); }
    .sev.signature-changed { color: var(--vscode-editorWarning-foreground); }
    .sev.type-narrowed { color: var(--vscode-charts-orange, var(--vscode-editorWarning-foreground)); }
    .site { font-size: 0.75em; color: var(--vscode-descriptionForeground); cursor: pointer; padding: 2px 0 2px 8px; }
    .site:hover { color: var(--vscode-textLink-foreground); }
    .hint { font-size: 0.75em; color: var(--vscode-descriptionForeground); margin-top: 8px; }
  </style>
</head>
<body>
  <div id="summary">${escapeHtml(this.summary)}</div>
  ${buttonsHtml}
  <div id="list"></div>
  <p class="hint">v1 is TypeScript/JavaScript only. Post PR Check requires an explicit confirm and a SecretStorage token. LM tool is report-only.</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const listEl = document.getElementById('list');
    const summaryEl = document.getElementById('summary');
    document.querySelectorAll('button[data-command]').forEach((btn) => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'runCommand', command: btn.dataset.command }));
    });
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'summary') summaryEl.textContent = msg.text;
      if (msg.type === 'report') {
        listEl.innerHTML = '<div class="hint">' + esc(msg.report.packageName) + ' vs ' + esc(msg.report.baseRef) + '</div>';
        for (const c of msg.report.changes) {
          const div = document.createElement('div');
          div.className = 'change';
          div.innerHTML = '<div><span class="sev ' + esc(c.severity) + '">' + esc(c.severity) + '</span> <strong>' + esc(c.exportName) + '</strong></div>' +
            '<div class="hint">' + esc(c.detail) + '</div>';
          for (const s of c.callSites) {
            const site = document.createElement('div');
            site.className = 'site';
            site.textContent = s.file + ':' + s.line + '  ' + s.snippet;
            site.addEventListener('click', () => vscode.postMessage({ type: 'jump', file: s.file, line: s.line }));
            div.appendChild(site);
          }
          if (!c.callSites.length) {
            const none = document.createElement('div');
            none.className = 'hint';
            none.textContent = 'No in-repo call sites (still flagged).';
            div.appendChild(none);
          }
          listEl.appendChild(div);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
