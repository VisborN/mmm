import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

async function build() {
    // Delete existing built files (app-*.js and sw-*.js) to prevent piling up
    const publicDir = './public';
    const files = fs.readdirSync(publicDir);
    for (const file of files) {
        if ((file.startsWith('app-') && file.endsWith('.js')) ||
            (file.startsWith('sw-') && file.endsWith('.js')) ||
            (file.startsWith('app-') && file.endsWith('.js.map')) ||
            (file.startsWith('sw-') && file.endsWith('.js.map')) ||
            file === 'app.js' || file === 'sw.js' || file === 'app.js.map' || file === 'sw.js.map'
        ) {
            fs.unlinkSync(path.join(publicDir, file));
        }
    }

    const result = await esbuild.build({
        entryPoints: ['web_src/app.tsx', 'web_src/sw.ts'],
        bundle: true,
        minify: true,
        sourcemap: true,
        outdir: 'public',
        entryNames: '[name]-[hash]',
        metafile: true,
    });

    const metafile = result.metafile;
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
    console.log(`Built successfully: ${appFile}, ${swFile}`);
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
