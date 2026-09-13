# Internal Breaking-Change Detector

Diffs an internal TypeScript package’s public API against a git baseline and maps which in-repo call sites will break — before merge.

## Install

```bash
git clone https://github.com/bobrowsse-tech/breaking-change-detector.git
cd breaking-change-detector
npm install
npm run package
npx @vscode/vsce package --no-dependencies
code --install-extension breaking-change-detector-0.1.0.vsix
```

Or press **F5** after `npm install`.

## Use

| Action | What it does |
|---|---|
| **Diff Against Base** | Extract API surface, compare to a git ref, find consumer call sites |
| **View Impacted Call Sites** | Ranked: removed → signature-changed → type-narrowed |
| **Post PR Check** | Optional GitHub PR comment (token in SecretStorage; confirm first) |

CLI for CI (same analysis as the extension):

```bash
npx breaking-change-check @acme/shared --base origin/main
```

Agents can call `check_breaking_changes` (report-only). PR comments need a human click.

## How it’s built

TypeScript Compiler API for surface extract; `simple-git` for baselines; esbuild produces `dist/extension.js` and `dist/cli.js`.

```bash
npm run watch
npm run test:unit
npm run package
```

## License

MIT
