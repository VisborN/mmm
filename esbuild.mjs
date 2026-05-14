import * as esbuild from 'esbuild';

const buildMode = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['web_src/app.tsx', 'web_src/sw.ts'],
  bundle: true,
  minify: !buildMode,
  sourcemap: true,
  outdir: 'public',
  entryNames: '[name]-[hash]',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
};

import { htmlPlugin } from '@craftamap/esbuild-plugin-html';

buildOptions.plugins = [
    htmlPlugin({
        files: [
            {
                entryPoints: [
                    'web_src/app.tsx',
                    'web_src/sw.ts'
                ],
                filename: 'index.html',
                htmlTemplate: 'web_src/index.html',
                scriptLoading: 'blocking'
            }
        ]
    })
];

async function run() {
    if (buildMode) {
        let ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log("Watching...");
    } else {
        await esbuild.build(buildOptions);
    }
}

run().catch(() => process.exit(1));