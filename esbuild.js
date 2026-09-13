const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const shared = {
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    logLevel: 'silent',
  };

  const extensionCtx = await esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  });

  const cliCtx = await esbuild.context({
    ...shared,
    entryPoints: ['src/cli.ts'],
    outfile: 'dist/cli.js',
    banner: { js: '#!/usr/bin/env node' },
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), cliCtx.watch()]);
  } else {
    await extensionCtx.rebuild();
    await cliCtx.rebuild();
    await extensionCtx.dispose();
    await cliCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
