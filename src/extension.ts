import * as vscode from 'vscode';
import { simpleGit } from 'simple-git';
import { DashboardProvider } from './dashboardProvider';
import { registerCheckBreakingChangesTool } from './lmTool';
import {
  BreakingChangeService,
  parseGithubRemote,
  postPrComment,
  type BreakingReport,
} from './service';

const LAST_REPORT_KEY = 'breakingChange.lastReport';
const GH_TOKEN_KEY = 'breakingChange.githubToken';

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function createService(): BreakingChangeService | undefined {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Breaking Change Detector needs an open workspace folder.');
    return undefined;
  }
  return new BreakingChangeService(root);
}

async function pickPackageName(service: BreakingChangeService): Promise<string | undefined> {
  // Prefer asking; user can type scoped names like @acme/core
  return vscode.window.showInputBox({
    title: 'Package to check (package.json name)',
    placeHolder: '@acme/shared',
    ignoreFocusOut: true,
  });
}

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('breaking-change-detectorView', dashboard)
  );

  const setReport = (report: BreakingReport) => {
    void context.workspaceState.update(LAST_REPORT_KEY, report);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('breakingChange.diffAgainstBase', async (payload?: {
      packageName?: string;
      baseRef?: string;
    }) => {
      const service = createService();
      if (!service) {
        return undefined;
      }
      const packageName = payload?.packageName ?? (await pickPackageName(service));
      if (!packageName) {
        return undefined;
      }
      const baseRef =
        payload?.baseRef ??
        (await vscode.window.showInputBox({
          title: 'Base ref (tag, branch, or commit)',
          value: 'HEAD~1',
          ignoreFocusOut: true,
        })) ??
        'HEAD~1';

      dashboard.setSummary(`Diffing ${packageName} against ${baseRef}…`);
      try {
        const report = await service.analyze({ packageName, baseRef });
        setReport(report);
        dashboard.showReport(report);
        dashboard.setSummary(
          `${report.changes.length} breaking change(s) in ${packageName}`
        );
        return report;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dashboard.setSummary(`Diff failed: ${msg}`);
        vscode.window.showErrorMessage(msg);
        return undefined;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('breakingChange.viewImpacted', async () => {
      let report = context.workspaceState.get<BreakingReport>(LAST_REPORT_KEY);
      if (!report) {
        report = await vscode.commands.executeCommand<BreakingReport | undefined>(
          'breakingChange.diffAgainstBase'
        );
      }
      if (!report) {
        return;
      }
      dashboard.showReport(report);
      await vscode.commands.executeCommand('breaking-change-detectorView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('breakingChange.postPrCheck', async () => {
      const service = createService();
      const root = workspaceRoot();
      const report = context.workspaceState.get<BreakingReport>(LAST_REPORT_KEY);
      if (!service || !root || !report) {
        vscode.window.showWarningMessage('Run Diff Against Base first.');
        return;
      }

      let token = await context.secrets.get(GH_TOKEN_KEY);
      if (!token) {
        token = await vscode.window.showInputBox({
          title: 'GitHub token (stored in SecretStorage)',
          password: true,
          ignoreFocusOut: true,
          prompt: 'Needs pull-request comment permission',
        });
        if (!token) {
          return;
        }
        await context.secrets.store(GH_TOKEN_KEY, token);
      }

      const git = simpleGit(root);
      let remoteUrl = '';
      try {
        remoteUrl = (await git.remote(['get-url', 'origin']))?.toString().trim() ?? '';
      } catch {
        // ignore
      }
      const parsed = parseGithubRemote(remoteUrl);
      if (!parsed) {
        vscode.window.showErrorMessage('Could not parse GitHub owner/repo from origin remote.');
        return;
      }

      const prInput = await vscode.window.showInputBox({
        title: 'Pull request number',
        placeHolder: '123',
        ignoreFocusOut: true,
        validateInput: (v) => (/^\d+$/.test(v) ? undefined : 'Enter a PR number'),
      });
      if (!prInput) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Post breaking-change summary to ${parsed.owner}/${parsed.repo}#${prInput}?`,
        { modal: true },
        'Post Comment'
      );
      if (confirm !== 'Post Comment') {
        return;
      }

      try {
        const result = await postPrComment({
          token,
          owner: parsed.owner,
          repo: parsed.repo,
          pullNumber: Number(prInput),
          body: service.formatMarkdown(report),
        });
        vscode.window.showInformationMessage(`Posted: ${result.htmlUrl}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to post PR comment: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('breakingChange.jumpToSite', async (payload?: {
      file?: string;
      line?: number;
    }) => {
      const root = workspaceRoot();
      if (!root || !payload?.file) {
        return;
      }
      const uri = vscode.Uri.file(`${root}/${payload.file}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const line = Math.max(0, (payload.line ?? 1) - 1);
      const pos = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    })
  );

  registerCheckBreakingChangesTool(context, () => createService(), setReport, dashboard);
}

export function deactivate() {}
