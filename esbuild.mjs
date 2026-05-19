#!/usr/bin/env node
import { configure } from 'esbd';
import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

let commitTime = '';
try {
  commitTime = execSync('git log -1 --format="%ci"', { encoding: 'utf-8' }).trim();
} catch (e) {
  commitTime = 'unknown';
}

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = `${dir}/${file}`;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      files.push(name);
    }
  }
  return files;
}

const baseDir = path.join(import.meta.dirname, 'web_src', 'assets');
const assetFiles = getFiles(baseDir);
const copyConfig = assetFiles.map(file => {
  const relativePath = path.relative(path.join(import.meta.dirname, 'web_src'), file);
  const destDir = path.dirname(path.join(import.meta.dirname, 'public', relativePath));
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  return [`./${relativePath}`, relativePath];
});

async function buildWorkerAndConfigure() {
  const domainDir = path.join(import.meta.dirname, 'public', 'domain');
  if (fs.existsSync(domainDir)) {
    fs.readdirSync(domainDir).forEach(f => {
      if (f.startsWith('recalculate_worker')) fs.unlinkSync(path.join(domainDir, f));
    });
  }

  const workerResult = await esbuild.build({
    entryPoints: ['web_src/domain/recalculate_worker.ts'],
    outdir: 'public',
    bundle: true,
    entryNames: 'domain/recalculate_worker-[hash]',
    metafile: true,
    write: true,
    sourcemap: true,
  });

  let workerPath = '/domain/recalculate_worker.js';
  for (const output in workerResult.metafile.outputs) {
    if (output.includes('recalculate_worker-') && output.endsWith('.js')) {
      workerPath = '/' + output.replace('public/', '');
      break;
    }
  }

  configure([
    {
      entryPoints: ['index.html'],
      outdir: '../public',
      absWorkingDir: path.join(import.meta.dirname, 'web_src'),
      integrity: "sha256",
      entryNames: '[name]-[hash]',
      copy: copyConfig,
      define: {
        '__WORKER_URL__': JSON.stringify(workerPath),
        '__COMMIT_TIME__': JSON.stringify(commitTime)
      }
    },
    {
      entryPoints: ['sw.ts'],
      outdir: '../public',
      absWorkingDir: path.join(import.meta.dirname, 'web_src'),
    }
  ]);
}

buildWorkerAndConfigure();