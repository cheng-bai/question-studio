import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExam,instanceOf,exportMarkdown,resolveAsset,validateProject} from '../src/model.js';

test('split complete questions and separate answer fields without including frontmatter or appendix',()=>{
 const exam=parseExam(`---\ntitle: test\n---\n# 测试卷\n## 考点结构总览\n#### 1.1 集合\n## 一、填空题\n**1.** 计算 $x^2$。\n\nA. $1$ B. $2$\n**【答案】** $1$\n**【解析】**\n1. 先计算\n2. 再检查\n**2.** 已知函数。\n（1）求值；\n（2）证明。\n【考点：函数】\n## 附：考点分布速览\n不应进入题目`, 'folder/a.md');
 assert.equal(exam.questions.length,2); assert.equal(exam.title,'测试卷');
 assert.ok(exam.questions[0].stem.includes('A.'));assert.equal(exam.questions[0].answer,'$1$');assert.ok(exam.questions[0].analysis.includes('2. 再检查'));
 assert.ok(exam.questions[1].stem.includes('（2）'));assert.equal(exam.questions[1].tags,'函数');assert.ok(!exam.questions[1].stem.includes('不应进入'));
});
test('headed question types, formulas, numbered code and centralized answers',()=>{
 const exam=parseExam('# 试卷\n### 1. 填空题\n求值。\n$$\n1. 公式行\n$$\n```text\n2. 代码行\n```\n**答案：** 2\n### 2. 解答题\n证明。\n## 参考答案\n1. 2\n2. 证明略');
 assert.equal(exam.questions.length,2);assert.equal(exam.questions[0].type,'填空题');assert.ok(exam.questions[0].stem.includes('2. 代码行'));assert.ok(exam.warnings.some(w=>w.includes('集中答案')));
});
test('each inserted block is independent and student export contains only the stem',()=>{
 const q=parseExam('# test\n## 1.\n题干STEM\n**答案：** ANSWER_SECRET\n**解析：** ANALYSIS_SECRET\n**考点：** TAG_SECRET\n**教学备注：** NOTE_SECRET').questions[0];
 const a=instanceOf(q),b=instanceOf(q);a.stem='改写STEM';assert.notEqual(a.instanceId,b.instanceId);assert.equal(q.stem,'题干STEM');assert.equal(b.stem,q.stem);
 const state={version:1,title:'测试',subtitle:'练习',exams:[],assets:{},blocks:[a,b]};
 const student=exportMarkdown(state);assert.ok(student.includes('改写STEM'));assert.ok(!/ANSWER_SECRET|ANALYSIS_SECRET|TAG_SECRET|NOTE_SECRET/.test(student));
 const teacher=exportMarkdown(state,true);assert.ok(teacher.includes('ANSWER_SECRET'));assert.ok(teacher.includes('原第 1 题'));assert.ok(teacher.includes('NOTE_SECRET'));
});
test('resolve image relative to source including Chinese paths, reject external protocols',()=>{
 const data='data:image/png;base64,AA==';const assets={'batch/资料/配图/图.png':data};
 assert.equal(resolveAsset('配图/图.png','batch/资料/卷.md',assets),data);
 assert.equal(resolveAsset('%E9%85%8D%E5%9B%BE/%E5%9B%BE.png','batch/资料/卷.md',assets),data);
 assert.equal(resolveAsset('https://external/a.png','a.md',assets),null);assert.equal(resolveAsset('javascript:alert(1)','a.md',assets),null);
});
test('project rejects malformed question records and duplicated sortable IDs',()=>{
 const q=parseExam('# test\n## 1.\n题目').questions[0],a=instanceOf(q);
 const state={version:1,title:'测试',subtitle:'',exams:[],assets:{},blocks:[a]};assert.equal(validateProject(state),state);
 assert.throws(()=>validateProject({...state,blocks:[a,a]}));assert.throws(()=>validateProject({...state,blocks:[{}]}));assert.throws(()=>validateProject({...state,assets:{'a':'https://x'}}));
});


test('plain consecutive question numbers after answers warn about ambiguity',()=>{
 const e=parseExam('1. 问 A\n答案：2\n2. 问 B\n答案：4');
 assert.equal(e.questions.length,2);assert.equal(e.questions[0].answer,'2');assert.equal(e.questions[1].answer,'4');assert.ok(e.warnings.some(w=>w.includes('普通数字题号')));
});
test('bold centralized answer header never becomes student questions',()=>{
 const e=parseExam('## 一、填空题\n**1.** 问 A\n**2.** 问 B\n**参考答案**\n**1.** SECRET_A\n**2.** SECRET_B');
 assert.equal(e.questions.length,2);assert.equal(e.questions[0].answer,'SECRET_A');assert.equal(e.questions[1].answer,'SECRET_B');assert.ok(!exportMarkdown({title:'测试',subtitle:'',blocks:e.questions,assets:{}}).includes('SECRET'));
});
test('single and multiple choice types normalize for library filters',()=>{
 const e=parseExam('### 1. 单选题\n题干A\n### 2. 多选题\n题干B');
 assert.deepEqual(e.questions.map(q=>q.type),['选择题','选择题']);
});
