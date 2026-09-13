import * as vscode from 'vscode';
import type { BreakingChangeService, BreakingReport } from './service';
import type { DashboardProvider } from './dashboardProvider';

interface ToolInput {
  packageName: string;
}

/**
 * Report-only — never posts PR comments.
 */
export function registerCheckBreakingChangesTool(
  context: vscode.ExtensionContext,
  getService: () => BreakingChangeService | undefined,
  setReport: (report: BreakingReport) => void,
  dashboard: DashboardProvider
) {
  context.subscriptions.push(
    vscode.lm.registerTool('check_breaking_changes', {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ToolInput>,
        _token: vscode.CancellationToken
      ) {
        const service = getService();
        if (!service) {
          return textResult('No workspace folder is open.');
        }
        const packageName = options.input?.packageName;
        if (!packageName) {
          return textResult('packageName is required.');
        }
        try {
          const report = await service.analyze({ packageName });
          setReport(report);
          dashboard.showReport(report);
          dashboard.setSummary(`${report.changes.length} breaking change(s)`);
          return textResult(service.formatReport(report));
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err));
        }
      },
    })
  );
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
