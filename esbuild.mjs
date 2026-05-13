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

import fs from 'node:fs';
import path from 'node:path';

const htmlPlugin = {
  name: 'html-plugin',
  setup(build) {
    build.onEnd(result => {
        if (result.errors.length > 0) return;

        const publicDir = './public';
        const metafile = result.metafile;
        if(!metafile) return;

        let appFile = '';
        let swFile = '';

        for (const file of Object.keys(metafile.outputs)) {
            if (file.includes('app-') && file.endsWith('.js')) {
                appFile = path.basename(file);
            } else if (file.includes('sw-') && file.endsWith('.js')) {
                swFile = path.basename(file);
            }
        }

        let indexPath = path.join(publicDir, 'index.html');
        let indexHtml = fs.readFileSync(indexPath, 'utf-8');

        // Replace app.js script tag
        indexHtml = indexHtml.replace(/<script src="app(-[a-zA-Z0-9]+)?\.js"><\/script>/g, `<script src="${appFile}"></script>`);

        // Replace sw.js in the service worker registration string
        indexHtml = indexHtml.replace(/navigator\.serviceWorker\.register\('\.\/sw(-[a-zA-Z0-9]+)?\.js'\)/g, `navigator.serviceWorker.register('./${swFile}')`);

        fs.writeFileSync(indexPath, indexHtml);
        console.log(`Updated index.html: ${appFile}, ${swFile}`);

        // clean up old files
        const files = fs.readdirSync(publicDir);
        for (const file of files) {
            if (file === 'index.html' || file === 'manifest.json' || file === 'favicon.ico') continue;

            if (file.endsWith('.js') || file.endsWith('.map')) {
                 if (file !== appFile && file !== swFile && file !== `${appFile}.map` && file !== `${swFile}.map`) {
                     fs.unlinkSync(path.join(publicDir, file));
                 }
            }
        }
    });
  },
}

buildOptions.metafile = true;
buildOptions.plugins = [htmlPlugin];

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