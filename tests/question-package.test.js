import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeQuestionPackage, validateQuestionPackage, sha256, questionPackageSchema, rewriteImageDestinations, questionImageReferences } from '../src/question-package.js';
import { resolveAsset } from '../src/model.js';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/WQAAAAASUVORK5CYII=';
function question(extra = {}) { return { id: 'q-test', type: '填空题', stem: '计算 $1+1=$ ______。', answer: '$2$', analysis: '直接相加。', notes: '观察基本运算。', tags: '数与式、运算', tagOrigin: 'manual', source: { title: '合成演示', file: 'demo.md', originalNumber: '1', line: 1 }, ...extra }; }
async function fixture(q = question()) { return makeQuestionPackage({ title: '合成题包', questions: [q], assets: { 'images/pixel.png': pixel } }); }
async function editMarkdown(pkg, transform) { const entry = pkg.questions[0]; pkg.files[entry.file] = transform(pkg.files[entry.file]); entry.sha256 = await sha256(pkg.files[entry.file]); return pkg; }

test('builder and validator preserve question fields, source and identity', async () => {
  const pkg = await fixture(question({ protocol: { questionId: 'stable-q1', revision: 3, tagOrigin: 'source' } }));
  const result = await validateQuestionPackage(pkg), q = result.questions[0];
  assert.equal(q.questionId, 'stable-q1'); assert.equal(q.revision, 3); assert.deepEqual(q.source, question().source);
  assert.equal(q.answer, '$2$'); assert.equal(q.notes, '观察基本运算。'); assert.deepEqual(q.tags, ['数与式', '运算']); assert.equal(q.tagOrigin, 'source');
});
test('schema is an actual shared JSON Schema', async () => {
  assert.deepEqual(questionPackageSchema, JSON.parse(await readFile(new URL('../schemas/question-package.schema.json', import.meta.url), 'utf8')));
});
test('rejects incorrect SHA-256', async () => {
  const pkg = await fixture(); pkg.files[pkg.questions[0].file] += 'tamper';
  await assert.rejects(validateQuestionPackage(pkg), /SHA-256/);
});
test('rejects missing and malformed YAML frontmatter', async () => {
  for (const transform of [text => text.slice(4), text => text.replace('type: 填空题', 'type: [broken')]) {
    const pkg = await editMarkdown(await fixture(), transform);
    await assert.rejects(validateQuestionPackage(pkg), /frontmatter/);
  }
});
test('rejects duplicate YAML keys and alias expansion', async () => {
  for (const transform of [text => text.replace('type: 填空题', 'type: 填空题\ntype: 解答题'), text => text.replace('tags:', 'extra: &x [a]\ncopy: *x\ntags:')]) {
    await assert.rejects(validateQuestionPackage(await editMarkdown(await fixture(), transform)), /unique|重复|alias|Map keys/i);
  }
});
test('rejects repeated question identities', async () => {
  const pkg = await fixture(); pkg.questions.push({ ...pkg.questions[0] });
  await assert.rejects(validateQuestionPackage(pkg), /重复 question_id/);
});
test('rejects traversal, encoded traversal and protocol file names', async () => {
  for (const path of ['../private.png', 'assets/../private.png', 'assets/%2e%2e/private.png', 'https://x/image.png', '/image.png', 'assets\\x.png']) {
    const pkg = await fixture(); pkg.files[path] = pixel;
    await assert.rejects(validateQuestionPackage(pkg), /路径|资源/);
  }
});
test('rejects normalized duplicate file paths', async () => {
  const pkg = await fixture(); pkg.files['assets/a.png'] = pixel; pkg.files['assets/%61.png'] = pixel;
  await assert.rejects(validateQuestionPackage(pkg), /归一化路径重复/);
});
test('preserves delimiter-looking headings in fenced code and display math', async () => {
  const stem = '阅读以下内容：\n\n```text\n## 答案\n---\n```\n\n$$\n## 解析\n$$\n\n再回答。';
  const q = (await validateQuestionPackage(await fixture(question({ stem })))).questions[0];
  assert.equal(q.stem, stem); assert.equal(q.answer, '$2$');
});
test('rejects unknown top-level content and duplicate fields', async () => {
  for (const transform of [text => text.replace('## 题干', '内容会丢失\n\n## 题干'), text => text + '\n## 答案\n\nother', text => text + '\n## AI校验\n\npassed', text => text + '\n# 顶层标题\n']) {
    await assert.rejects(validateQuestionPackage(await editMarkdown(await fixture(), transform)), /字段|标题/);
  }
});
test('rejects self-certified AI fields', async () => {
  const pkg = await fixture(); pkg.ai_verified = true;
  await assert.rejects(validateQuestionPackage(pkg), /additional properties/);
});
test('separates Markdown fields with one to three leading spaces', async () => {
  for (const indent of [' ', '  ', '   ']) {
    const pkg = await editMarkdown(await fixture(), text => text.replace(/^## /gm, indent + '## '));
    const q = (await validateQuestionPackage(pkg)).questions[0];
    assert.equal(q.stem, question().stem); assert.equal(q.answer, '$2$');
    assert.equal(q.analysis, question().analysis); assert.equal(q.notes, question().notes);
  }
});
test('rejects indented unknown, duplicate and top-level headings', async () => {
  for (const indent of [' ', '  ', '   ']) {
    for (const suffix of ['## 未知字段\nsecret', '## 答案\nsecret', '# 一级标题\nsecret']) {
      await assert.rejects(validateQuestionPackage(await editMarkdown(await fixture(), text => text + '\n' + indent + suffix)), /字段|标题/);
    }
  }
});
test('keeps indented delimiter text inside protected code and math', async () => {
  const stem = '示例：\n\n```md\n  ## 答案\n```\n\n$$\n   ## 解析\n$$';
  const q = (await validateQuestionPackage(await fixture(question({ stem })))).questions[0];
  assert.equal(q.stem, stem); assert.equal(q.answer, '$2$');
});
test('checks Markdown identity against manifest', async () => {
  const pkg = await editMarkdown(await fixture(), text => text.replace('question_id: q-test', 'question_id: q-other'));
  await assert.rejects(validateQuestionPackage(pkg), /身份/);
});
test('requires valid source and string tags', async () => {
  for (const transform of [text => text.replace('line: 1', 'line: 0'), text => text.replace('- 数与式', '- 42')]) {
    await assert.rejects(validateQuestionPackage(await editMarkdown(await fixture(), transform)), /source.line|tags/);
  }
});
test('resolves images in all four fields and preserves original source', async () => {
  const q = question({ stem: '![题图](images/pixel.png)', answer: '![答案](images/pixel.png)', analysis: '![解析][p]\n\n[p]: images/pixel.png "图"', notes: '![备注](<images/pixel.png>)' });
  const pkg = await fixture(q), result = await validateQuestionPackage(pkg);
  assert.equal(Object.keys(result.assets).length, 1);
  for (const field of ['stem', 'answer', 'analysis', 'notes']) assert.match(result.questions[0][field], /assets\/[a-f0-9]{64}\.png/);
  assert.equal(result.questions[0].source.file, 'demo.md');
});
test('prefers source.assetFile to preserve import namespace', async () => {
  const q = question({ stem: '![图](images/pixel.png)', source: { ...question().source, assetFile: 'batch/demo.md' } });
  const pkg = await makeQuestionPackage({ title: '配图', questions: [q], assets: { 'batch/images/pixel.png': pixel } });
  assert.equal(Object.keys((await validateQuestionPackage(pkg)).assets).length, 1);
});
test('exports image destinations with spaces and nested parentheses', async () => {
  const q = question({ stem: '![图](<images/a b.png>)\n\n![图](images/a(b).png)' });
  const pkg = await makeQuestionPackage({ title: '图片地址', questions: [q], assets: { 'images/a b.png': pixel, 'images/a(b).png': pixel } });
  const result = await validateQuestionPackage(pkg);
  assert.equal(Object.keys(result.assets).length, 1); assert.match(result.questions[0].stem, /assets\//);
});
test('rejects invalid explicit revision rather than silently replacing it', async () => {
  await assert.rejects(fixture(question({ protocol: { questionId: 'q1', revision: 0 } })), /minimum|>= 1/);
});
test('canonicalizes encoded Chinese/space image keys for downstream asset resolution', async () => {
  const pkg = await fixture(question({ stem: '![图](images/pixel.png)' }));
  const original = Object.keys(pkg.files).find(path => path.startsWith('assets/'));
  pkg.files['assets/配%20图.png'] = pkg.files[original]; delete pkg.files[original];
  await editMarkdown(pkg, text => text.replace(original, 'assets/%E9%85%8D%20%E5%9B%BE.png'));
  const result = await validateQuestionPackage(pkg);
  assert.deepEqual(Object.keys(result.assets), ['assets/配 图.png']);
  const namespaced = Object.fromEntries(Object.entries(result.assets).map(([key, value]) => ['batch/' + key, value]));
  assert.equal(resolveAsset('assets/%E9%85%8D%20%E5%9B%BE.png', 'batch/questions/q-test.md', namespaced), null);
  assert.equal(resolveAsset('assets/%E9%85%8D%20%E5%9B%BE.png', 'batch/package.md', namespaced), pixel);
});
test('rewrites image destinations without changing prose, code or ordinary-only link definitions', () => {
  const text = '![真实](assets/a.png)\n\n普通文字 assets/a.png\n\n`![行内代码](assets/a.png)`\n\n```md\n![代码](assets/a.png)\n```\n\n[普通链接][link]\n\n[link]: assets/a.png\n\n![引用图片][pic]\n\n[pic]: assets/a.png\n\n$$\n![公式文本](assets/a.png)\n$$';
  const result = rewriteImageDestinations(text, new Map([['assets/a.png', 'PACKAGED']]));
  assert.equal(result, text.replace('![真实](assets/a.png)', '![真实](PACKAGED)').replace('[pic]: assets/a.png', '[pic]: PACKAGED'));
});
test('inline-code dollars cannot absorb a real image when protecting math', () => {
  const text = '`$foo` actual ![real](assets/a.png) `$bar`';
  assert.deepEqual(questionImageReferences(text), ['assets/a.png']);
  assert.equal(rewriteImageDestinations(text, new Map([['assets/a.png', 'DATA']])), '`$foo` actual ![real](DATA) `$bar`');
});
test('builder keeps fake code/math image text unchanged while packaging actual image', async () => {
  const stem = '![真图](images/pixel.png)\n\n`![假图](missing.png)`\n\n```md\n![假图](missing.png)\n```\n\n$\\text{![假图](missing.png)}$\n\n\\[\n![假图](missing.png)\n\\]';
  const result = await validateQuestionPackage(await fixture(question({ stem })));
  assert.match(result.questions[0].stem, /assets\/[a-f0-9]+\.png/);
  assert.match(result.questions[0].stem, /`!\[假图\]\(missing\.png\)`/);
  assert.deepEqual(questionImageReferences(stem), ['images/pixel.png']);
});
test('builder rejects duplicate IDs before file overwrite for same or different versions', async () => {
  for (const revision of [1, 2]) {
    const a = question({ protocol: { questionId: 'same', revision: 1 } });
    const b = question({ protocol: { questionId: 'same', revision } });
    await assert.rejects(makeQuestionPackage({ title: '重复', questions: [a, b] }), /重复 question_id/);
  }
});
test('protects matched equation/align/gather/multline environments and bracket math', async () => {
  for (const env of ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'displaymath']) {
    const stem = `计算：\n\n\\begin{${env}}\n## 答案\n![非图片](missing.png)\n\\end{${env}}\n\n继续。`;
    const result = await validateQuestionPackage(await fixture(question({ stem })));
    assert.equal(result.questions[0].stem, stem); assert.equal(result.questions[0].answer, '$2$');
  }
  const stem = '公式：\n\n\\[\n## 答案\n\\]\n\n继续。';
  assert.equal((await validateQuestionPackage(await fixture(question({ stem })))).questions[0].stem, stem);
});
test('rejects mismatched math delimiters rather than hiding later fields', async () => {
  for (const stem of ['\\[\nx\n$$', '$$\nx\n\\]', '\\begin{align}\nx\n\\end{equation}', '\\]\nx', '\\begin{equation}\nx']) {
    await assert.rejects(fixture(question({ stem })), /块公式/);
  }
});
test('rejects missing images and external image requests', async () => {
  await assert.rejects(fixture(question({ stem: '![图](missing.png)' })), /图片缺失/);
  await assert.rejects(fixture(question({ stem: '![图](https://example.com/image.png)' })), /网络资源/);
  const pkg = await editMarkdown(await fixture(), text => text.replace('## 题干', '## 题干\n\n![图](assets/missing.png)'));
  await assert.rejects(validateQuestionPackage(pkg), /引用图片缺失/);
});
test('rejects unreferenced file payloads and executable data images', async () => {
  const pkg = await fixture(); pkg.files['assets/unreferenced.png'] = pixel;
  await assert.rejects(validateQuestionPackage(pkg), /未被题目引用/);
  await assert.rejects(makeQuestionPackage({ title: 'SVG', questions: [question({ stem: '![图](images/a.svg)' })], assets: { 'images/a.svg': 'data:image/svg+xml;base64,PHN2Zz4=' } }), /base64 图片/);
});
test('handout preserves order, duplicates and exact revisions', async () => {
  const handout = { title: '讲义', subtitle: '顺序演示', items: [{ question_id: 'q-test', question_revision: 1, role: '例题', reason: '基础' }, { question_id: 'q-test', question_revision: 1 }] };
  const pkg = await makeQuestionPackage({ title: '演示', questions: [question()], handout });
  const result = await validateQuestionPackage(pkg);
  assert.equal(result.handout.items.length, 2); assert.equal(result.handout.items[1].role, '');
  pkg.handout.items[0].question_revision = 2;
  await assert.rejects(validateQuestionPackage(pkg), /锁定版本/);
});
test('AI tag suggestions stay warnings, not assertions of correctness', async () => {
  const result = await validateQuestionPackage(await fixture(question({ tagOrigin: 'suggested' })));
  assert.equal(result.warnings.length, 1); assert.match(result.warnings[0], /尚待教师确认/);
});
test('rejects more than 200 questions before builder work', async () => {
  await assert.rejects(makeQuestionPackage({ title: '过多', questions: Array(201).fill(question()) }), /200/);
});
test('published synthetic demo and CLI validate without writes or network', async () => {
  const path = new URL('../examples/ai-package-demo.题包.json', import.meta.url);
  const pkg = JSON.parse(await readFile(path, 'utf8')), result = await validateQuestionPackage(pkg);
  assert.equal(result.questions.length, 3); assert.deepEqual(result.handout.items.map(i => i.questionId), ['demo-q3', 'demo-q1', 'demo-q2']);
  const cli = spawnSync(process.execPath, ['scripts/validate-package.mjs', fileURLToPath(path)], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /校验通过/);
});
