import * as esbuild from 'esbuild';
import { esbuildPluginHtmlEntry } from "esbuild-plugin-html-entry";

const buildMode = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['web_src/index.html'],
  bundle: true,
  minify: !buildMode,
  sourcemap: true,
  outdir: 'public',
  entryNames: '[name]-[hash]',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
  plugins: [esbuildPluginHtmlEntry({ integrity: "sha256" })],
};

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