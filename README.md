# Internal Breaking-Change Detector

Diffs an internal TypeScript package’s public API against a git baseline and maps which in-repo call sites will break — before merge.

1. **Diff Against Base** — extract API surface (TS Compiler API), compare to `HEAD~1` / a tag / branch, find consumer call sites.
2. **View Impacted Call Sites** — grouped by severity: removed → signature-changed → type-narrowed.
3. **Post PR Check** — optional GitHub PR comment (token in SecretStorage; explicit confirm). Never run from the LM tool.

CLI for CI:

```bash
npx breaking-change-check @acme/shared --base origin/main
```

Agents can call `check_breaking_changes` for a report-only impact summary.

## Development

```bash
npm install
npm run watch
npm run test:unit
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

MIT
