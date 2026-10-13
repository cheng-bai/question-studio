import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExam, exportMarkdown } from '../src/model.js';
const numbered = raw => parseExam(raw, '资料/数字题号.md', { splitMode: 'numbered' });
const numbers = e => e.questions.map(q => q.number);
const student = e => exportMarkdown({title:'练习',subtitle:'',blocks:e.questions,assets:{}});

test('auto accepts mixed heading, bold, and ordinary question IDs without global suppression', () => {
  const e = parseExam('# 卷\n## 1. 第一题\n答案：A\n2. 第二题\n答案：B\n**3.** 第三题\n4. 第四题');
  assert.deepEqual(numbers(e), ['1', '2', '3', '4']);
  assert.equal(e.questions[1].answer, 'B');
  assert.equal(e.splitMode, 'auto');
  assert.equal(e.splitDiagnostics.filter(x => x.action === 'split').length, 4);
});

test('auto accepts skipped plain IDs, reports gaps, and preserves source text and line numbers', () => {
  const raw = '# 卷\n2. 计算第一题\n\n5. 计算第二题\n9．第三题';
  const e = parseExam(raw, '原卷.md');
  assert.deepEqual(numbers(e), ['2', '5', '9']);
  assert.deepEqual(e.questions.map(q => q.source.line), [2, 4, 5]);
  assert.equal(e.questions[1].source.originalNumber, '5');
  assert.equal(e.questions[1].raw, '5. 计算第二题');
  assert.equal(e.raw, raw);
  assert.ok(e.warnings.some(w => w.includes('从 2 跳到 5')));
});

test('auto preserves plain solution steps but warns for skipped or repeated numbers', () => {
  const e = parseExam('## 1. 问题\n解析：\n1. 代换\n2. 再计算\n5. 可能是下一题');
  assert.deepEqual(numbers(e), ['1']);
  assert.ok(e.questions[0].analysis.includes('5. 可能是下一题'));
  assert.ok(e.warnings.some(w => w.includes('解析步骤')));
  assert.equal(e.splitDiagnostics.find(x => x.number === '5').reason, 'possible-solution-step');
});

test('numbered mode splits explicit top-level dotted IDs after solutions and shows ambiguity', () => {
  const e = numbered('## 1. 已知函数\n答案：4\n解析：第一题推导\n3. 已知集合\n答案：2\n解析：第二题推导\n**5.** 第三题');
  assert.deepEqual(numbers(e), ['1', '3', '5']);
  assert.equal(e.questions[0].analysis, '第一题推导');
  assert.equal(e.questions[1].analysis, '第二题推导');
  assert.equal(e.splitMode, 'numbered');
  assert.equal(e.questions[1].splitReason, 'explicit-numbered-line');
  assert.ok(e.warnings.some(w => w.includes('位于解析之后')));
  assert.ok(e.warnings.some(w => w.includes('解析中的同类编号也会拆开')));
});

test('explicit numbered mode supports duplicate or reset dotted IDs with warnings', () => {
  const e = numbered('4. 第一题\n1. 重置题号\n1. 重复题号');
  assert.deepEqual(numbers(e), ['4', '1', '1']);
  assert.ok(e.warnings.some(w => w.includes('原题号 1 重复')));
});

test('indented lists, parenthesized subquestions, and decimal outlines never split numbered mode', () => {
  const e = numbered('1. 大题\n  2. 缩进小问\n\t3. 制表符小问\n（1）求解\n(2) 证明\n1.2 小数章节\n2．3 小数章节\n5. 下一题');
  assert.deepEqual(numbers(e), ['1', '5']);
  for (const text of ['  2. 缩进小问', '\t3. 制表符小问', '（1）求解', '(2) 证明', '1.2', '2．3']) assert.ok(e.questions[0].stem.includes(text), text);
});

test('fenced code and three display-math syntaxes protect numbered lines and answer-like headings', () => {
  const e = numbered('1. 大题\n````md\n2. 代码\n```\n3. 仍在四反引号围栏中\n````\n$$\n4. 公式\n$$\n\\[\n5. 公式\n## 参考答案\n\\]\n\\begin{align}\n6. 公式\n\\end{align}\n7. 下一题');
  assert.deepEqual(numbers(e), ['1', '7']);
  assert.ok(e.questions[0].stem.includes('6. 公式'));
  assert.ok(e.questions[0].stem.includes('## 参考答案'));
});

test('central answer IDs remain answer data in numbered mode and student output omits secrets', () => {
  const e = numbered('1. 题一\n3. 题三\n## 参考答案\n1. SECRET_ONE\n3. SECRET_THREE');
  assert.deepEqual(numbers(e), ['1', '3']);
  assert.equal(e.questions[0].answer, 'SECRET_ONE');
  assert.equal(e.questions[1].answer, 'SECRET_THREE');
  assert.ok(!student(e).includes('SECRET'));
  assert.ok(e.questions[1].answerSource.raw.includes('SECRET_THREE'));
});

test('ordinary sequence can restart after a section heading even when previous field was analysis', () => {
  const e = parseExam('1. 第一部分\n解析：过程\n## 二、解答题\n5. 新部分题目');
  assert.deepEqual(numbers(e), ['1', '5']);
});

test('strong heading styles can mix after solutions while deeper solution headings stay content', () => {
  const e = parseExam('## 1. 第一题\n解析：\n### 1. 内部步骤\n步骤\n**2.** 第二题\n解析：过程\n## 3. 第三题');
  assert.deepEqual(numbers(e), ['1', '2', '3']);
  assert.ok(e.questions[0].analysis.includes('### 1. 内部步骤'));
});

test('reject unsupported split mode instead of silently choosing a different parser', () => {
  assert.throws(() => parseExam('1. 题', '卷.md', {splitMode:'unknown'}), /拆题模式/);
});


test('one leading formatting space is allowed for dotted questions after analysis', () => {
  const e = numbered('1. 第一题\n解析：过程\n 3. 第二题\n  4. 缩进列表');
  assert.deepEqual(numbers(e), ['1', '3']);
  assert.ok(e.questions[1].stem.includes('  4. 缩进列表'));
});
