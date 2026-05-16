#!/usr/bin/env node
import { configure } from 'esbd';
import * as path from 'path';

configure([
  {
    entryPoints: ['sw.ts'],
    outdir: '../public',
    absWorkingDir: import.meta.dirname + "/web_src",
  },
  {
    entryPoints: ['index.html'],
    outdir: '../public',
    absWorkingDir: import.meta.dirname + "/web_src",
    integrity: "sha256",
    entryNames: '[name]-[hash]',
  }
]);