import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExam, exportMarkdown, suggestTags, instanceOf, validateProject } from '../src/model.js';
const stateFor = exam => ({ version: 1, title: '练习', subtitle: '', exams: [exam], blocks: exam.questions.map(instanceOf), assets: {} });

test('central marked answers preserve multiline solutions and plain step numbers', () => {
  const raw = '# 测试卷\n## 1.\n原题 A\n（1）求值\n（2）证明\n## 2.\n原题 B\n## 参考答案与解析\n### 1.\n【答案】ANSWER_A\n【解析】\n1. 先做代换\n2. 再证明\n$$\nx=1\n$$\n### 2. 答案：ANSWER_B\n解析：第二题解析';
  const e = parseExam(raw, '资料/卷.md');
  assert.equal(e.questions.length, 2);
  assert.equal(e.questions[0].answer, 'ANSWER_A');
  assert.ok(e.questions[0].analysis.includes('2. 再证明'));
  assert.equal(e.questions[1].answer, 'ANSWER_B');
  assert.equal(e.questions[1].analysis, '第二题解析');
  assert.ok(e.questions[0].raw.includes('（2）证明'));
  assert.equal(e.questions[0].source.line, 2);
  assert.equal(e.questions[0].answerSource.file, '资料/卷.md');
  assert.equal(e.raw, raw);
  assert.ok(!exportMarkdown(stateFor(e)).includes('ANSWER_'));
  assert.ok(exportMarkdown(stateFor(e), true).includes('ANSWER_A'));
});

test('central plain entries support answer labels and multiline analysis conservatively', () => {
  const e = parseExam('## 1.\n题 A\n## 2.\n题 B\n# 答案解析\n1. 答案：A\n解析：\n1. 步骤甲\n2. 步骤乙\n2. 答案：B\n解析：解 B');
  assert.equal(e.questions.length, 2);
  assert.equal(e.questions[1].answer, 'B');
  assert.ok(e.questions[0].analysis.includes('2. 步骤乙'));
  assert.ok(e.warnings.some(w => w.includes('歧义')));
});

test('conflicting central answers never overwrite inline answers or fill contradictory analysis', () => {
  const e = parseExam('## 1.\n题干\n答案：保留答案\n# 参考答案\n**1.** 替代答案\n解析：矛盾解析');
  assert.equal(e.questions[0].answer, '保留答案');
  assert.equal(e.questions[0].analysis, '');
  assert.ok(e.warnings.some(w => w.includes('冲突')));
});

test('duplicate and unmatched central IDs are reported, never imported as stems', () => {
  const e = parseExam('## 1.\n题一\n## 2.\n题二\n## 参考答案\n**1.** SECRET_A\n**1.** SECRET_B\n**9.** SECRET_NINE');
  assert.equal(e.questions.length, 2);
  assert.equal(e.questions[0].answer, '');
  assert.ok(e.warnings.some(w => w.includes('1 重复')));
  assert.ok(e.warnings.some(w => w.includes('9 没有对应')));
  assert.ok(e.warnings.some(w => w.includes('未提供第 2')));
  assert.ok(!exportMarkdown(stateFor(e)).includes('SECRET'));
});

test('duplicate original numbers prevent ambiguous central matching', () => {
  const e = parseExam('## 1.\n卷 A 题一\n## 1.\n卷 B 题一\n## 参考答案\n1. A');
  assert.equal(e.questions.length, 2);
  assert.ok(e.questions.every(q => !q.answer));
  assert.ok(e.warnings.some(w => w.includes('对应多个原题')));
});

test('appendix stops central solution ingestion', () => {
  const e = parseExam('## 1.\n题干\n## 参考答案\n1. A\n## 附：考点分布\n2. 无关附录');
  assert.equal(e.questions[0].answer, 'A');
  assert.ok(!e.questions[0].answerSource.raw.includes('无关附录'));
});

test('plain analysis numbered steps do not create phantom source questions', () => {
  const e = parseExam('1. 问题一\n答案：A\n解析：\n1. 第一步\n2. 第二步\n  3. 缩进步骤');
  assert.equal(e.questions.length, 1);
  assert.ok(e.questions[0].analysis.includes('2. 第二步'));
  assert.ok(e.warnings.some(w => w.includes('解析步骤')));
});

test('central headings in code or math are not answer-section delimiters', () => {
  const e = parseExam('## 1.\n问题\n```md\n## 参考答案\n```\n$$\n## 参考答案\n$$\n## 2.\n问题二');
  assert.equal(e.questions.length, 2);
  assert.ok(e.questions[0].stem.includes('## 参考答案'));
});

test('original tags win; suggestions are local, limited, and await confirmation', () => {
  const e = parseExam('## 1.\n已知椭圆。\n【考点：原文考点】\n## 2.\n已知等比数列。\n## 3.\n抽象问题');
  assert.equal(e.questions[0].tags, '原文考点');
  assert.equal(e.questions[0].tagOrigin, 'source');
  assert.equal(e.questions[1].tags, '等比数列');
  assert.equal(e.questions[1].tagOrigin, 'suggested');
  assert.equal(e.questions[1].tagsConfirmed, false);
  assert.equal(e.questions[2].tags, '');
  assert.ok(suggestTags('椭圆、双曲线、抛物线、向量、等比数列').length <= 3);
  assert.deepEqual(suggestTags('无已知关键词'), []);
  assert.ok(!exportMarkdown(stateFor(e)).includes('原文考点'));
  assert.ok(exportMarkdown(stateFor(e),true).includes('建议考点（待确认）'));
});

test('v1 project remains valid without added tag metadata', () => {
  const e = parseExam('## 1.\n题干');
  delete e.questions[0].tagOrigin; delete e.questions[0].tagsConfirmed;
  const s = stateFor(e);
  assert.equal(validateProject(s), s);
  const q = instanceOf(e.questions[0]); q.tagOrigin = 'manual';
  assert.equal(validateProject({ ...s, blocks: [q] }).blocks[0].tagOrigin, 'manual');
});

test('field-like prose is retained as question content', () => {
  const e = parseExam('## 1.\n解答下列问题：\n解析几何综合练习。\n【考点：解析几何】');
  assert.ok(e.questions[0].stem.includes('解答下列问题'));
  assert.ok(e.questions[0].stem.includes('解析几何综合'));
  assert.equal(e.questions[0].tags, '解析几何');
});


test('per-question answer headings never truncate subsequent questions', () => {
 for (const label of ['答案','参考答案','参考答案与解析']) {
  const e=parseExam(`## 1.\n题1\n### ${label}\n4\n### 解析\n过程1\n## 2.\n题2\n### ${label}\n9\n### 解析\n过程2`);
  assert.equal(e.questions.length,2,label);
  assert.equal(e.questions[0].answer,'4');assert.equal(e.questions[1].answer,'9');
  assert.equal(e.questions[0].analysis,'过程1');assert.equal(e.questions[1].analysis,'过程2');
 }
});
