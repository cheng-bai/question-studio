import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExam, instanceOf, validateProject, exportMarkdown } from '../src/model.js';
import { questionIdentity, questionBasis, additionsFor } from '../src/question-identity.js';
import { questionTarget, buildQuestionTask, exampleAdditions, prepareAdditionImport, validateAdditionSnapshotHashes } from '../src/question-additions.js';
import { validateAdditionPayload } from '../src/question-addition-format.js';
function setup() { const exam = parseExam('# 合成卷\n## 1. 解答题\n求 $y=(x-1)^2-2$ 的最小值。\n答案：$-2$\n解析：平方非负。'); const q = exam.questions[0]; return { q, state: { version: 1, title: '合成讲义', subtitle: '', exams: [exam], blocks: [instanceOf(q), instanceOf(q)], assets: {} } }; }
async function payload(q, state, id = 'extra-1') { const p = exampleAdditions(await questionTarget(q, state.assets)); Object.assign(p.additions[0], { addition_id: id, title: '最小值解析', markdown: 'SUPPLEMENT_SECRET：$y=(x-1)^2-2\\ge -2$，等号当且仅当 $x=1$ 成立。', author: '合成 AI 夹具' }); return p; }
function graph(entry) { return { ...entry, kind: 'visualization', visualization: { kind: 'quadratic', parameters: { a: 1, h: 1, k: -2 }, x_range: [-5, 5], y_range: [-5, 10] } }; }

test('source and copies share a stable identity; revisions remain explicit', () => { const { q, state } = setup(); assert.deepEqual(questionIdentity(q), questionIdentity(state.blocks[0])); assert.notEqual(state.blocks[0].instanceId, state.blocks[1].instanceId); q.protocol = { questionId: 'permanent', revision: 3 }; assert.deepEqual(questionIdentity(instanceOf(q)), { questionId: 'permanent', revision: 3 }); });
test('task carries exact target, full question and source, existing answer and provider-neutral schema', async () => { const { q, state } = setup(), task = await buildQuestionTask(q, {}, '详细分析'); for (const text of [q.id, q.stem, q.answer, q.source.file, 'content_sha256', 'question-studio-additions', 'JSON Schema']) assert.ok(task.includes(text)); await assert.rejects(buildQuestionTask(q, {}, '  '), /填写/); });
test('full task includes original companion image bytes and rejects missing or remote images', async () => { const { q, state } = setup(); const pixel = 'data:image/png;base64,AA=='; q.stem += '\n![图](images/图.png)'; state.assets['images/图.png'] = pixel; assert.ok((await buildQuestionTask(q, state.assets, '看图')).includes(pixel)); await assert.rejects(buildQuestionTask(q, {}, '看图'), /缺少配图/); });
test('import appends separate supplements, preserves original and shares across equal copies', async () => { const { q, state } = setup(), before = structuredClone(state); const p = await payload(q, state), out = await prepareAdditionImport(state, p, q); assert.equal(out.added, 1); assert.deepEqual(state, before); assert.deepEqual(out.state.exams, before.exams); for (const b of [q, ...state.blocks]) assert.equal(additionsFor(out.state, b).length, 1); validateProject(out.state); });
test('edited handout copies match only their own content snapshot', async () => { const { q, state } = setup(); state.blocks[0].stem = '求 $y=x^2+5$ 的最小值。'; const p = await payload(state.blocks[0], state), out = await prepareAdditionImport(state, p, state.blocks[0]); assert.equal(additionsFor(out.state, q).length, 0); assert.equal(additionsFor(out.state, state.blocks[0]).length, 1); assert.equal(additionsFor(out.state, state.blocks[1]).length, 0); await assert.rejects(prepareAdditionImport(state, p, q), /不属于当前题目/); });
test('stale content, missing identity and different revision reject the entire import', async () => { const { q, state } = setup(); for (const field of ['question_id', 'question_revision', 'content_sha256']) { const p = await payload(q, state); p.target[field] = field === 'question_revision' ? 2 : field === 'question_id' ? 'absent' : '0'.repeat(64); await assert.rejects(prepareAdditionImport(state, p)); assert.equal(state.questionAdditions, undefined); } });
test('image byte changes invalidate snapshots but grouping notes do not', async () => { const { q, state } = setup(); q.stem += '\n![图](a.png)'; state.assets['a.png'] = 'data:image/png;base64,AA=='; const p = await payload(q, state); const unchanged = questionBasis(q, state.assets); q.notes += '教学分组'; q.tags = '新考点'; assert.equal(questionBasis(q, state.assets), unchanged); state.assets['a.png'] = 'data:image/png;base64,BB=='; await assert.rejects(prepareAdditionImport(state, p), /过期/); });
test('duplicate result is idempotent even when object keys are reordered', async () => { const { q, state } = setup(), p = await payload(q, state), first = await prepareAdditionImport(state, p); const ordered = { ...p, target: Object.fromEntries(Object.entries(p.target).reverse()), additions: p.additions.map(a => Object.fromEntries(Object.entries(a).reverse())) }; const out = await prepareAdditionImport(first.state, ordered, q); assert.equal(out.added, 0); assert.equal(out.reused, 1); assert.equal(out.state.questionAdditions.length, 1); });
test('same addition ID with changed content rejects; new ID keeps both drafts', async () => { const { q, state } = setup(), p = await payload(q, state), first = await prepareAdditionImport(state, p); p.additions[0].markdown = '修订解析'; await assert.rejects(prepareAdditionImport(first.state, p), /ID 已存在/); p.additions[0].addition_id = 'new-draft'; assert.equal((await prepareAdditionImport(first.state, p)).state.questionAdditions.length, 2); });
test('duplicate additions and unknown/self-certified fields are rejected atomically', async () => { const { q, state } = setup(); for (const mutate of [p => p.additions.push({ ...p.additions[0] }), p => p.ai_verified = true, p => p.additions[0].checks_passed = true, p => p.target.instance_id = 'hidden']) { const p = await payload(q, state); mutate(p); await assert.rejects(prepareAdditionImport(state, p)); } });
test('graph data is bounded, non-executable and schema-checked on restore', async () => { const { q, state } = setup(), p = await payload(q, state); p.additions[0] = graph(p.additions[0]); const out = await prepareAdditionImport(state, p); validateProject(out.state); for (const mutate of [a => a.visualization.script = 'alert(1)', a => a.visualization.parameters.a = Infinity, a => a.visualization.x_range = [5, -5], a => a.visualization.kind = 'html', a => a.visualization.parameters.a = 100]) { const bad = structuredClone(p); mutate(bad.additions[0]); assert.throws(() => validateAdditionPayload(bad)); } });
test('rejects external supplement images and accepts original local images', async () => { const { q, state } = setup(), p = await payload(q, state); p.additions[0].markdown = '![新图](https://example.com/a.png)'; await assert.rejects(prepareAdditionImport(state, p), /外部资源/); p.additions[0].markdown = '![图](a.png)'; state.assets['a.png'] = 'data:image/png;base64,AA=='; assert.equal((await prepareAdditionImport(state, p)).added, 1); });
test('student export omits supplements; teacher export keeps text and graph summary', async () => { const { q, state } = setup(), p = await payload(q, state); p.additions[0] = graph(p.additions[0]); const out = (await prepareAdditionImport(state, p)).state; assert.ok(!exportMarkdown(out).includes('SUPPLEMENT_SECRET')); assert.ok(exportMarkdown(out, true).includes('SUPPLEMENT_SECRET')); assert.ok(exportMarkdown(out, true).includes('初始 a=1')); out.blocks[0].stem = '另一道题'; assert.equal(additionsFor(out, out.blocks[0]).length, 0); });
test('old workspace remains readable; malformed/duplicate restored supplements rejected', async () => { const { q, state } = setup(); validateProject(state); const out = (await prepareAdditionImport(state, await payload(q, state))).state; assert.equal(validateProject(JSON.parse(JSON.stringify(out))).questionAdditions.length, 1); for (const mutate of [s => s.questionAdditions.push({ ...s.questionAdditions[0] }), s => s.questionAdditions[0].basis = 'null', s => s.questionAdditions[0].target.question_revision = 0, s => s.questionAdditions[0].origin = 'teacher-approved']) { const bad = structuredClone(out); mutate(bad); assert.throws(() => validateProject(bad)); } });

test('teacher supplemental images are embedded while code and ordinary path text stay unchanged', async () => {
  const { q, state } = setup(), p = await payload(q, state), pixel = 'data:image/png;base64,AA==';
  state.assets['assets/p.png'] = pixel;
  p.additions[0].markdown = '![图][p]\n\n[p]: assets/p.png\n\n`assets/p.png`';
  const out = (await prepareAdditionImport(state, p)).state;
  const md = exportMarkdown(out, true); assert.ok(md.includes('[p]: ' + pixel)); assert.ok(md.includes('`assets/p.png`'));
});
test('asynchronous restore rejects tampered supplementary snapshot hashes', async () => {
  const { q, state } = setup(), out = (await prepareAdditionImport(state, await payload(q, state))).state;
  await validateAdditionSnapshotHashes(out); out.questionAdditions[0].target.content_sha256 = '0'.repeat(64);
  await assert.rejects(validateAdditionSnapshotHashes(out), /快照与校验值/);
});

test('published supplement example matches the versioned three-question package', async () => {
  const { readFile } = await import('node:fs/promises');
  const { validateQuestionPackage } = await import('../src/question-package.js');
  const { preparePackageImport } = await import('../src/package-workspace.js');
  const pkg = await validateQuestionPackage(JSON.parse(await readFile(new URL('../examples/ai-package-demo.题包.json', import.meta.url), 'utf8')));
  const state = preparePackageImport({version:1,title:'',subtitle:'',exams:[],blocks:[],assets:{}}, pkg).state;
  const result = JSON.parse(await readFile(new URL('../examples/ai-question-demo.补充.json', import.meta.url), 'utf8'));
  const out = await prepareAdditionImport(state, result); assert.equal(out.added, 2);
  assert.equal(additionsFor(out.state, out.question).length, 2); await validateAdditionSnapshotHashes(out.state);
});

test('legacy Markdown export remains permissive for incomplete code or display math during editing', () => {
  const { state } = setup();
  for (const text of ['计算：\n$$\nx+1', '示例：\n```md\n尚未写完']) { state.blocks[0].stem = text; assert.ok(exportMarkdown(state).includes(text)); assert.ok(exportMarkdown(state, true).includes(text)); }
});
