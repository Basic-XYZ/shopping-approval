'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../miniprogram');
const compilerRoot = process.env.WECHAT_COMPILER_DIR || '/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec';
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const [compiler, files] of [
  ['wcc', app.pages.map((page) => `${page}.wxml`)],
  ['wcsc', ['app.wxss', ...app.pages.map((page) => `${page}.wxss`)]]
]) {
  const executable = path.join(compilerRoot, compiler);
  if (!fs.existsSync(executable)) throw new Error('未找到微信原生编译器，可通过 WECHAT_COMPILER_DIR 指定目录');
  execFileSync(executable, files, { cwd: root, maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`PASS: ${compiler} compiled ${files.length} files`);
}
