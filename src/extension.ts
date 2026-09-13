import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerCheckBreakingChangesTool } from './lmTool';

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("breaking-change-detectorView", dashboard)
  );

  context.subscriptions.push(vscode.commands.registerCommand("breakingChange.diffAgainstBase", () => {
    // TODO (Diff Against Base): Extracts the current public API surface and diffs it against the version published from the base branch (using git to check out the previous package.json + source at HEAD~ or the last release tag).
    vscode.window.showInformationMessage("Diff Against Base \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("breakingChange.viewImpacted", () => {
    // TODO (View Impacted Call Sites): Lists every workspace file that calls a changed export, grouped by change severity (removed > signature-changed > type-narrowed).
    vscode.window.showInformationMessage("View Impacted Call Sites \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("breakingChange.postPrCheck", () => {
    // TODO (Post PR Check): Posts the impact summary as a PR comment via the GitHub API, using a token from vscode.SecretStorage.
    vscode.window.showInformationMessage("Post PR Check \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  // Exposes the same capability to Copilot Chat / Claude Code / any MCP-aware
  // agent via the Language Model Tool API — see contributes.languageModelTools
  // in package.json and DIRECTIVE.md, section "Language Model Tool".
  registerCheckBreakingChangesTool(context);
}

export function deactivate() {}
