import test from 'node:test';
import assert from 'node:assert/strict';
import { readImport, missingImages, imageReferences } from '../src/import-files.js';
// FileReader is a browser transport; retain the real File bytes in this Node shim.
global.FileReader = class { async readAsDataURL(file) { try { this.result=`data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;this.onload?.(); } catch(e) { this.onerror?.(e); } } };
const file = (path,body,type='text/markdown') => ({path,file:new File([body],path.split('/').pop(),{type})});
const image = path => file(path,'PNG-FIXTURE','image/png');
test('structured folder import never borrows another exam image',async()=>{
 const batch=await readImport([file('A/exam.md','## 1.\nA\n![图](images/q.png)'),image('A/images/q.png'),file('B/exam.md','## 1.\nB\n![图](images/q.png)')]);
 const missing=missingImages(batch.drafts,batch.assets);assert.equal(missing.length,1);assert.ok(missing[0].source.endsWith('/B/exam.md'));
 assert.ok(!batch.assets[`${batch.prefix}/B/images/q.png`]);
});
test('two same-name loose images are rejected before either can silently overwrite',async()=>{
 await assert.rejects(readImport([file('exam.md','## 1.\n![图](q.png)'),image('q.png'),image('q.png')]),/同名图片/);
});
test('unique loose image can resolve a path lost in loose-file drop',async()=>{
 const batch=await readImport([file('exam.md','## 1.\n![图](images/q.png)'),image('q.png')]);assert.equal(missingImages(batch.drafts,batch.assets).length,0);
});
test('same image names in distinct declared folders keep independent original bytes',async()=>{
 const batch=await readImport([file('A/exam.md','## 1.\n![图](q.png)'),file('B/exam.md','## 1.\n![图](q.png)'),file('A/q.png','AAA','image/png'),file('B/q.png','BBB','image/png')]);
 assert.equal(missingImages(batch.drafts,batch.assets).length,0);assert.notEqual(batch.assets[`${batch.prefix}/A/q.png`],batch.assets[`${batch.prefix}/B/q.png`]);
});
test('image discovery supports reference style and titles without treating code as images',()=>{
 assert.deepEqual(imageReferences('![图][a]\n\n[a]: images/a.png "title"\n\n```md\n![假图](b.png)\n```'),['images/a.png']);
});
