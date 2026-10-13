#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { validateQuestionPackage } from '../src/question-package.js';

const file = process.argv[2];
if (!file || process.argv.length !== 3) {
  console.error('用法：node scripts/validate-package.mjs FILE.题包.json');
  process.exitCode = 1;
} else {
  try {
    if ((await stat(file)).size > 50 * 1024 * 1024) throw new Error('题包 JSON 文件超过 50 MB');
    const result = await validateQuestionPackage(JSON.parse(await readFile(file, 'utf8')));
    console.log(`校验通过：${result.title} · ${result.questions.length} 题 · ${Object.keys(result.assets).length} 张配图 · 讲义 ${result.handout?.items.length || 0} 项`);
    for (const warning of result.warnings) console.log(`提示：${warning}`);
    console.log('这仅验证格式、引用与完整性；不证明答案或考点正确。');
  } catch (error) {
    console.error(`校验失败：${error.message}`);
    process.exitCode = 1;
  }
}
