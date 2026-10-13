import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateQuestionPackage, makeQuestionPackage } from '../src/question-package.js';
import { preparePackageImport } from '../src/package-workspace.js';
import { initialState } from '../src/samples.js';
import { validateProject, resolveAsset, exportMarkdown } from '../src/model.js';
import { imageReferences } from '../src/import-files.js';
import { taskMarkdown, workflows, latestQuestions } from '../src/workflows.js';
const fixture = () => readFile(new URL('../examples/ai-package-demo.题包.json',import.meta.url),'utf8').then(JSON.parse).then(validateQuestionPackage);
test('standard package applies atomically as independent questions and ordered handout copies',async()=>{
 const original=initialState(), snapshot=JSON.stringify(original), pack=await fixture();
 const imported=preparePackageImport(original,pack,{compose:true});
 assert.equal(JSON.stringify(original),snapshot);assert.equal(imported.added,3);assert.equal(imported.appended,3);assert.ok(validateProject(imported.state));
 const fresh=imported.state.exams.at(-1).questions;
 assert.deepEqual(imported.state.blocks.slice(-3).map(q=>q.protocol.questionId),pack.handout.items.map(i=>i.questionId));
 for(const q of fresh)for(const ref of imageReferences([q.stem,q.answer,q.analysis,q.notes].join('\n\n')))assert.ok(resolveAsset(ref,q.source.assetFile,imported.state.assets));
 const copy=imported.state.blocks.at(-1);copy.stem='EDITED';assert.ok(fresh.every(q=>q.stem!=='EDITED'));
 assert.ok(!exportMarkdown(imported.state).includes('训练角色：'));assert.ok(!exportMarkdown(imported.state).includes('选题依据：'));
 assert.ok(exportMarkdown(imported.state,true).includes('训练角色：'));
});
test('reimport reuses identical revisions, keeps assets bounded, and does not duplicate library or composition',async()=>{
 const pack=await fixture(),first=preparePackageImport(initialState(),pack),again=preparePackageImport(first.state,pack);
 assert.equal(again.added,0);assert.equal(again.reused,3);assert.equal(again.state.exams.length,first.state.exams.length);assert.equal(again.state.blocks.length,first.state.blocks.length);assert.deepEqual(again.state.assets,first.state.assets);
});
test('same identity/version with changed content rejects whole import; increased revision preserves old record',async()=>{
 const pack=await fixture(),first=preparePackageImport(initialState(),pack),changed=structuredClone(pack);
 changed.questions[0].stem+='改变';assert.throws(()=>preparePackageImport(first.state,changed),/冲突/);assert.equal(first.added,3);
 changed.questions[0].revision++;const next=preparePackageImport(first.state,changed);assert.equal(next.added,1);assert.equal(next.reused,2);assert.ok(validateProject(next.state));
});
test('legacy workspace restores; invalid protocol identity and duplicate revision cannot overwrite storage',async()=>{
 assert.ok(validateProject(initialState()));const first=preparePackageImport(initialState(),await fixture()).state;
 const bad=structuredClone(first);bad.exams.at(-1).questions[0].protocol.revision=0;assert.throws(()=>validateProject(bad),/题包身份/);
 const dup=structuredClone(first);dup.exams.at(-1).questions[1].protocol=structuredClone(dup.exams.at(-1).questions[0].protocol);assert.throws(()=>validateProject(dup),/重复的题目版本/);
});
test('workflow tasks contain evidence gates, source scope and provider-independent return contract',()=>{
 for(const w of workflows){const text=taskMarkdown({templateId:w.id,goal:'函数方法练习',count:6,level:'',sourceCount:10,specification:'PROTOCOL'});assert.ok(text.includes('PROTOCOL'));assert.ok(text.includes(w.instructions));assert.ok(text.includes('未知'));assert.ok(text.includes('revision'));}
 assert.throws(()=>taskMarkdown({templateId:'unknown',goal:'x',count:1}),/填写教学目标/);assert.throws(()=>taskMarkdown({templateId:'ladder',goal:'x',count:0}),/1–200/);
});
test('AI proposals reference existing legacy bank records instead of duplicating unchanged originals',async()=>{
 const state=initialState(),questions=state.exams[0].questions;
 const pack=await makeQuestionPackage({title:'旧题交接',questions,assets:state.assets});
 const result=preparePackageImport(state,await validateQuestionPackage(pack));
 assert.equal(result.added,0);assert.equal(result.reused,questions.length);assert.equal(result.state.exams.length,state.exams.length);
});
test('AI candidate export selects one latest revision per question while preserving original records',()=>{
 const q={id:'legacy',stem:'old'},old={id:'v1',protocol:{questionId:'stable',revision:1}},next={id:'v2',protocol:{questionId:'stable',revision:2}},legacyNext={id:'legacy-v2',protocol:{questionId:'legacy',revision:2}};
 const all=[q,old,next,legacyNext];assert.deepEqual(latestQuestions(all),[legacyNext,next]);assert.equal(all.length,4);
});
test('unchanged image source roundtrip preserves inline code/prose and reuses original version',async()=>{
 const state=initialState(),q=state.exams[0].questions[0];
 q.stem='图片路径 `images/a.png`。\n\n![图](images/a.png)\n\n`![代码](images/a.png)`';q.source.assetFile='exam/test.md';
 state.assets['exam/images/a.png']='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=';
 const pack=await validateQuestionPackage(await makeQuestionPackage({title:'图片交接',questions:[q],assets:state.assets}));
 assert.equal(preparePackageImport(state,pack).reused,1);
});
