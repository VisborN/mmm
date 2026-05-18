#!/usr/bin/env node
import { configure } from 'esbd';
import * as path from 'path';
import * as fs from 'fs';

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

configure([
  {
    entryPoints: ['index.html'],
    outdir: '../public',
    absWorkingDir: path.join(import.meta.dirname, 'web_src'),
    integrity: "sha256",
    entryNames: '[name]-[hash]',
    copy: copyConfig,
  },
  {
    entryPoints: ['sw.ts'],
    outdir: '../public',
    absWorkingDir: path.join(import.meta.dirname, 'web_src'),
  },
  {
    entryPoints: ['domain/recalculate_worker.ts'],
    outdir: '../public',
    absWorkingDir: path.join(import.meta.dirname, 'web_src'),
    bundle: true,
    entryNames: 'domain/recalculate_worker',
  }
]);