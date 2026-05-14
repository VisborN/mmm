#!/usr/bin/env node
import { configure } from 'esbd';
import * as path from 'path';

configure({
  entryPoints: ['index.html'],
  outdir: '../public',
  absWorkingDir: import.meta.dirname+"/web_src",
  integrity: "sha256",
  entryNames: '[name]-[hash]',
});