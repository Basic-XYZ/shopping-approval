'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const app = readJSON('miniprogram/app.json');
const project = readJSON('project.config.json');
let count = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.baku-coding-discipline', 'artifacts'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.js')) { execFileSync(process.execPath, ['--check', file]); count++; }
    else if (entry.name.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}
walk(root);
for (const page of app.pages) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(root, project.miniprogramRoot, `${page}.${extension}`))) throw new Error(`Missing ${page}.${extension}`);
  }
  const template = fs.readFileSync(path.join(root, project.miniprogramRoot, `${page}.wxml`), 'utf8');
  for (const match of template.matchAll(/wx:(?:if|elif|for)="([^"]*)"/g)) {
    if (!match[1].startsWith('{{') || !match[1].endsWith('}}')) {
      throw new Error(`Missing WXML expression binding in ${page}: ${match[0]}`);
    }
  }
  if (/\{\{[^}]*&amp;/.test(template)) throw new Error(`Escaped operator in ${page}`);
}
if (process.argv.includes('--deployment')) {
  if (!/^wx[0-9a-f]{16}$/.test(project.appid)) throw new Error('BLOCKED: 请先配置自己的微信小程序 AppID');
  if (!require('../miniprogram/config').cloudEnv) throw new Error('Missing CloudBase environment');
}
console.log(`PASS: ${count} JavaScript files, JSON syntax and ${app.pages.length} native mini-program pages`);
if (!project.appid) console.log('NOTICE: AppID 未配置；部署和真实微信身份联调暂不可用。');
