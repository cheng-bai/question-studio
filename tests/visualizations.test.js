import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, visualTemplate, validParameters, frameDocument } from '../src/visualizations.js';
import { instanceOf, validateProject, exportMarkdown, parseExam } from '../src/model.js';
test('nine known visualizations have valid defaults and deeply independent instances',()=>{
 assert.equal(SCENES.length,9);
 for(const s of SCENES){const t=visualTemplate(s.id),a=instanceOf(t),b=instanceOf(t);assert.ok(validParameters(s.id,a.visualization.parameters));a.visualization.parameters.degrees=90;assert.notEqual(b.visualization.parameters.degrees,90);assert.notEqual(t.visualization.parameters.degrees,90);}
});
test('restore rejects unknown components, missing and out-of-range visual state',()=>{
 const q=instanceOf(visualTemplate('foci'));const state={version:1,title:'测试',subtitle:'',blocks:[q],exams:[],assets:{}};
 assert.equal(validateProject(state),state);
 for(const invalid of [{...q,kind:'iframe'},{...q,visualization:{...q.visualization,scene:'javascript:evil'}},{...q,visualization:{...q.visualization,parameters:{...q.visualization.parameters,ratio:0}}}])assert.throws(()=>validateProject({...state,blocks:[invalid]}));
});
test('mixed modules keep question numbering and static student exports omit teacher notes',()=>{
 const q=instanceOf(parseExam('## 1.\n题干\n**答案：** SECRET').questions[0]),v=instanceOf(visualTemplate('string'));v.notes='TEACHER_SECRET';
 const s={title:'混合',subtitle:'',blocks:[q,v,instanceOf(q)],assets:{}};const md=exportMarkdown(s);
 assert.ok(md.includes('## 1.')&&md.includes('## 2.')&&!md.includes('## 3.'));assert.ok(md.includes('互动探究 1'));assert.ok(!md.includes('SECRET'));assert.ok(exportMarkdown(s,true).includes('TEACHER_SECRET'));
});
test('frame configuration cannot terminate bridge script',()=>{
 const h=frameDocument('<html><head></head><body></body></html>',{token:'</script><script>alert(1)</script>',parameters:{}});
 assert.ok(h.includes('\\u003c/script>'));assert.ok(!h.includes('<script>alert(1)'));
});
