import React, { useEffect, useRef, useState } from 'react';
import { FileCheck2, Download, Check, AlertCircle } from 'lucide-react';
import Markdown from './Markdown';
import { validateQuestionPackage } from './question-package';
import { preparePackageImport } from './package-workspace';
import demo from '../examples/ai-package-demo.题包.json';

export default function PackageDialog({ Modal, workspace, dropped, commit, close, download }) {
  const [result, setResult] = useState(null), [raw, setRaw] = useState(''), [error, setError] = useState(''),
    [busy, setBusy] = useState(false), [compose, setCompose] = useState(false), [details, setDetails] = useState(false);
  const picker = useRef(), revision = useRef(0);
  async function validate(value, run = ++revision.current) {
    setBusy(true); setError(''); setResult(null); setCompose(false);
    try {
      if (typeof value === 'string' && new TextEncoder().encode(value).length > 50 * 1024 * 1024) throw new Error('题包超过 50 MB，请分批导入。');
      const validated = await validateQuestionPackage(typeof value === 'string' ? JSON.parse(value) : value);
      preparePackageImport(workspace, validated); // Detect revision conflicts before offering Apply.
      if (run === revision.current) setResult(validated);
    } catch (e) { if (run === revision.current) setError(e.message); }
    finally { if (run === revision.current) setBusy(false); }
  }
  async function load(file) {
    if (!file) return;
    const run = ++revision.current;
    setResult(null); setError(''); setBusy(true); setCompose(false);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('题包超过 50 MB，请分批导入。');
      const text = await file.text();
      if (run !== revision.current) return;
      setRaw(text); await validate(text, run);
    } catch (e) { if (run === revision.current) { setError(e.message); setBusy(false); } }
  }
  useEffect(() => {
    if (dropped) Promise.resolve(dropped).then(files => {
      if (files.length !== 1 || !/\.json$/i.test(files[0].path)) throw new Error('标准题包请一次拖入一个 .题包.json 文件；MD 资料请从「导入资料」进入。');
      return load(files[0].file);
    }).catch(e => setError(e.message));
    return () => { revision.current++; };
  }, [dropped]);
  const preview = result ? preparePackageImport(workspace, result) : null;
  const assetPreview = result ? Object.fromEntries(Object.entries(result.assets).map(([path, data]) => [`pack/${path}`, data])) : {};
  const byId = new Map(result?.questions.map(q => [`${q.questionId}@${q.revision}`, q]));
  return <Modal title="AI 标准题包" subtitle="显式题目字段 · 校验配图与版本 · 教师预览后应用" close={close} wide>
    <div className="package-tools"><button className="button" disabled={busy} onClick={() => picker.current.click()}><FileCheck2 size={16}/>读取题包 JSON</button><input ref={picker} type="file" accept=".json" hidden aria-label="读取标准题包" onChange={e => { load(e.target.files[0]); e.target.value = ''; }}/><button className="text-button" disabled={busy} onClick={() => { setRaw(JSON.stringify(demo, null, 2)); validate(demo); }}>试用 3 道演示题</button><button className="text-button" onClick={() => download('演示题目.题包.json', JSON.stringify(demo, null, 2), 'application/json')}><Download size={13}/>下载样包</button></div>
    <div className="package-content">
      {error && <p className="import-error" role="alert"><AlertCircle size={16}/>{error}</p>}
      {busy && <p role="status">正在校验题目字段、文件校验值、配图和编排引用…</p>}
      <details className="package-paste"><summary>或粘贴 AI 返回的题包 JSON</summary><textarea aria-label="题包 JSON" rows={7} value={raw} onChange={e => { ++revision.current; setBusy(false); setRaw(e.target.value); setResult(null); setError(''); }}/><button className="button" disabled={!raw.trim() || busy} onClick={() => validate(raw)}>校验粘贴内容</button></details>
      {!result && !busy && <div className="package-empty"><FileCheck2 size={30}/><h3>让不同 AI 使用同一份规范</h3><p>题包内每题一个 Markdown，明确分开题干、答案、解析和教学备注。题号只决定展示顺序，题目 ID 与版本保留在题库中。</p><p>可先试用样包，再到「AI 汇编」下载任务与候选题。</p></div>}
      {result && <><div className="package-summary"><div><span className="eyebrow">READY FOR TEACHER REVIEW</span><h3>{result.title}</h3></div><strong>{result.questions.length} 题 · {Object.keys(result.assets).length} 张图</strong><p>{preview.added} 道新题，{preview.reused} 道同版题可复用。格式通过；数学内容与 AI 建议仍需教师核对。</p></div>
        {result.warnings.length > 0 && <details className="package-warnings"><summary>{result.warnings.length} 条核对提醒 · 建议考点尚待教师确认</summary>{result.warnings.map((w, i) => <p className="warning" key={i}><AlertCircle size={14}/>{w}</p>)}</details>}
        {result.handout && <div className="package-order"><h4>AI 建议编排 · {result.handout.items.length} 个题块</h4><ol>{result.handout.items.map((item, i) => { const q = byId.get(`${item.questionId}@${item.revision}`); return <li key={i}><strong>原第 {q.source.originalNumber} 题</strong><span>{item.role || '未指定训练角色'}</span>{item.reason && <p>{item.reason}</p>}</li>; })}</ol><label><input type="checkbox" checked={compose} onChange={e => setCompose(e.target.checked)}/>按此顺序追加到左侧讲义（保留现有题目）</label><small>训练角色和选题依据仅写入讲义副本的教学备注。</small></div>}
        <label className="package-teacher"><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)}/>显示答案、解析与教师备注以便核对</label>
        {result.questions.map(q => <article className="package-question" key={`${q.questionId}@${q.revision}`}><header><strong>原第 {q.source.originalNumber} 题</strong><span>{q.type} · 第 {q.revision} 版</span><code>{q.questionId}</code></header><Markdown text={q.stem} source="pack/package.md" assets={assetPreview}/><p className="package-source">来源：{q.source.title} · {q.source.file}:{q.source.line}</p>{q.tags.length > 0 && <p className="package-source">建议考点（待核）：{q.tags.join('；')}</p>}{details && <div className="teacher-notes">{[['answer', '答案'], ['analysis', '解析'], ['notes', '教学备注']].map(([field, title]) => q[field] && <div key={field}><span>{title}</span><Markdown text={q[field]} source="pack/package.md" assets={assetPreview}/></div>)}</div>}</article>)}
      </>}
    </div>
    <footer className="modal-footer"><span>不覆盖旧题；同题同版本内容冲突会拒绝导入。</span><button className="button primary" disabled={!result || busy} onClick={() => { try { commit(result, compose); } catch (e) { setError(e.message); } }}><Check size={16}/>{compose ? '加入题库并追加编排' : '确认加入题库'}</button></footer>
  </Modal>;
}
