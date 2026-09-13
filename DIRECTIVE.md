
# Build Directive — Internal Breaking-Change Detector

> Rank **#6** in the Unbuilt VS Code Tools roadmap. This directive is written for an AI coding agent (Claude Code, Copilot agent mode, or a human following along) to execute directly. The `breaking-change-detector/` folder next to this file already contains a working scaffold — activation, side-panel dashboard, command registration, and a Language Model Tool stub — generated per the shared conventions in `../AGENTS.md`. Everything marked `TODO` below is the real remaining work.

## 1. Objective

Extract the public API surface of an internal package (types, exported function signatures) using the TypeScript Compiler API, diff it against the previous published version, then search all workspace consumers for usages matching the changed signatures — surfacing exactly which call sites will break, before merge.

## 2. Why this doesn't already exist

Public semver tooling (api-extractor and friends) checks a package against its own history in isolation. Nothing walks a monorepo's actual consumers and maps a given internal change to the exact call sites it will break.

## 3. VS Code surfaces this extension uses

- **Activity bar view container**: `breaking-change-detectorContainer` (icon: `warning`)
- **Side panel dashboard**: `breaking-change-detectorView`, a `WebviewViewProvider` — see `src/dashboardProvider.ts`
- **Commands**: `breakingChange.diffAgainstBase`, `breakingChange.viewImpacted`, `breakingChange.postPrCheck`
- **Language Model Tool**: `check_breaking_changes` — see `src/lmTool.ts` and `contributes.languageModelTools` in `package.json`. This is what lets Copilot Chat, Claude Code, or any other MCP/agent-aware surface invoke this extension's core action conversationally instead of the user hunting for the right command.

## 4. Dashboard (side panel) spec

The sidebar webview is the primary UI. It must show, at minimum, the buttons below plus a status/summary area above them (current scan state, last-run timestamp, or a short result summary — specifics depend on the feature, see phase notes).

| Button | Command | Behavior |
|---|---|---|
| **Diff Against Base** | `breakingChange.diffAgainstBase` | Extracts the current public API surface and diffs it against the version published from the base branch (using git to check out the previous package.json + source at HEAD~ or the last release tag). |
| **View Impacted Call Sites** | `breakingChange.viewImpacted` | Lists every workspace file that calls a changed export, grouped by change severity (removed > signature-changed > type-narrowed). |
| **Post PR Check** | `breakingChange.postPrCheck` | Posts the impact summary as a PR comment via the GitHub API, using a token from vscode.SecretStorage. |

Buttons call `vscode.commands.executeCommand`, not the tool logic directly — keep exactly one implementation of the core logic (a plain TypeScript service module with no VS Code imports) called from three places: the command handler, the dashboard's message handler, and the Language Model Tool's `invoke`. Do not fork the logic across these three entry points.

## 5. Implementation phases

1. **API surface extraction** — For a target package, use the TypeScript Compiler API (`ts.createProgram` rooted at the package's entry point) to walk exported declarations and produce a normalized surface: `{exportName, kind: 'function'|'type'|'class', signature: string}` using `ts.TypeChecker.typeToString` for a stable textual signature. This is the same category of technique `api-extractor` uses, scoped down to what's needed for a diff rather than a full .d.ts rollup.
2. **Baseline retrieval** — Use `simple-git` to check out the package's source as of the base ref (last release tag, or the PR's merge-base) into a temporary worktree, and run the same extraction against it to get the 'before' surface — this avoids depending on a separate published-package registry for internal, unpublished packages.
3. **Surface diff** — Compare before/after surfaces by export name: removed exports are always breaking; changed signatures are breaking unless the change is a widening (e.g. a new optional parameter); compare param types structurally where possible rather than by string equality alone, to avoid false positives from harmless type alias renames.
4. **Consumer search** — For each breaking export, use `ts-morph`'s project-wide reference finding (`findReferencesAsNodes` or a manual identifier scan scoped to files that import the package) to list every call site, with enough surrounding context to judge severity without opening the file.
5. **Dashboard wiring** — WebviewView grouped list: package name, breaking export, severity badge, expandable call-site list with jump links; 'Diff Against Base' and 'Post PR Check' actions at the top.
6. **CI integration** — Expose the same logic as a small CLI entry point (`npx breaking-change-check <package>`) so it can run in CI independent of the editor, with the extension as the interactive front-end for local, pre-push checking.
7. **Language Model Tool** — Register `check_breaking_changes` so an agent proposing a change to a shared package can self-check impact before suggesting the change is safe to merge.
8. **Tests** — Fixture monorepo with a shared package and two consumers, one call site broken by a deliberate signature change and one left compatible, asserting the diff correctly separates them.

## 6. Suggested dependencies

`typescript`, `ts-morph`, `@octokit/rest`, `simple-git`

Install as regular `dependencies` (already stubbed into `package.json` — replace the `"latest"` version pins with the actual resolved versions once installed, per the pinning convention in `AGENTS.md`).

## 7. Edge cases & safety notes

- Non-TypeScript internal packages (plain JS, Python) need a different extraction strategy per language — scope v1 to TypeScript/JavaScript and document the gap rather than silently skipping other packages without saying so.
- A change that's technically breaking by type but never actually exercised by any consumer should still be flagged, just ranked lower — absence of a call site today doesn't guarantee absence tomorrow.

## 8. Definition of done

- [ ] Core logic lives in a VS Code-free service module, unit-tested against fixtures (see phase notes above for what fixtures to build).
- [ ] All buttons in the dashboard spec are wired to real behavior, not the placeholder `showInformationMessage` stub.
- [ ] The Language Model Tool calls the same service module and returns a concise, agent-readable text result (not raw JSON dumped as text).
- [ ] No destructive or external-write action (file rewrite, PR post, process kill) runs without an explicit user-initiated click — the LM tool path in particular must stay read/report-only unless the directive above says otherwise.
- [ ] `npm run package` produces a `dist/extension.js` with no bundling warnings; `vsce package` produces a `.vsix` that installs cleanly via `code --install-extension`.
- [ ] README.md (user-facing, not this directive) documents what the extension does in plain language, per `AGENTS.md`'s copy conventions.
    