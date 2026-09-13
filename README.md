# Internal Breaking-Change Detector

Diffs an internal package's public API across versions and maps exactly which in-repo call sites a change will break.

## Status

Scaffold generated. Core logic is not yet implemented — see `DIRECTIVE.md` for the full build plan.

## Development

```bash
npm install
npm run watch    # esbuild + tsc in watch mode
```

Then press `F5` in VS Code to launch an Extension Development Host.
