import React, { useEffect, useRef, useState } from 'react';
import { Copy, Download, FileUp, Check, Pencil, Trash2 } from 'lucide-react';
import Markdown from './Markdown';
import QuestionGraph from './QuestionGraph';
import { questionIdentity, additionsFor } from './question-identity';
import { additionKinds } from './question-addition-format';
import { buildQuestionTask, prepareAdditionImport } from './question-additions';

export async function copyText(text) {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return; } catch {} }
  const input = document.createElement('textarea'); input.value = text; input.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(input); input.select();
  let copied; try { copied = document.execCommand('copy'); } finally { input.remove(); } if (!copied) throw new Error('浏览器未允许复制，请在下方手动复制。');
}
const goals = { analysis: '补充完整答案与逐步解析，检查定义域、边界和漏解。', visualization: '为本题制作函数图像与参数变化的可视化解析，并说明图像如何支持解题。', method: '提炼本题的关键方法、适用条件与迁移思路。', notes: '补充易错点、课堂追问与教学备注。' };
export default function QuestionDetails({ Modal, q, workspace, close, notify, download, apply, remove, initialPayload }) {
  const identity = questionIdentity(q), entries = additionsFor(workspace, q), all = (workspace.questionAdditions || []).filter(a => a.target.question_id === identity.questionId && a.target.question_revision === identity.revision);
  const [tab, setTab] = useState('stem'), [taskKind, setTaskKind] = useState('analysis'), [goal, setGoal] = useState(goals.analysis), [raw, setRaw] = useState(''), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [manualCopy, setManualCopy] = useState(''), [draft, setDraft] = useState(null);
  const picker = useRef(), run = useRef(0);
  useEffect(() => () => { run.current++; }, []);
  useEffect(() => { setResult(null); ++run.current; setBusy(false); }, [q, workspace.assets]);
  useEffect(() => { if (initialPayload) { const text = JSON.stringify(initialPayload, null, 2); setRaw(text); validate(text); } }, [initialPayload]);
  const source = q.source.assetFile || q.source.file;
  async function copy(value, label) { try { await copyText(value); notify(label); } catch (e) { setManualCopy(value); setError(e.message); } }
  async function task(mode) {
    setBusy(true); setError('');
    try { const text = await buildQuestionTask(q, workspace.assets, goal); if (mode === 'download') download(`${identity.questionId}-AI任务.md`, text); else await copy(text, '已复制完整 AI 任务，包含题目 ID、版本和配图'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function validate(text) {
    const token = ++run.current; setBusy(true); setError(''); setResult(null);
    try {
      if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) throw new Error('补充结果超过 5 MB。');
      const payload = JSON.parse(text), preview = await prepareAdditionImport(workspace, payload, q);
      if (token === run.current) setResult({ payload, preview });
    } catch (e) { if (token === run.current) setError(e.message); }
    finally { if (token === run.current) setBusy(false); }
  }
  async function load(file) {
    if (!file) return; const token = ++run.current; setResult(null); setBusy(true); setError('');
    try { if (file.size > 5*1024*1024) throw new Error('补充结果超过 5 MB。'); const text = await file.text(); if (token !== run.current) return; setRaw(text); await validate(text); }
    catch (e) { if (token === run.current) setError(e.message); }
    finally { if (token === run.current) setBusy(false); }
  }
  async function commit(payload, origin = 'ai') {
    setBusy(true); setError('');
    try { await apply(payload, origin); setResult(null); setDraft(null); setTab(payload.additions[0].kind); notify('补充已挂到对应题目，原题未修改；可撤销'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function additionView(a, preview = false) {
    return <article className="addition-card" key={a.addition_id}><header><div><strong>{a.title}</strong><small>{a.author} · {a.origin === 'manual' ? '手工修订' : 'AI 补充'} · 待核</small></div>{!preview && <div><button className="icon-button" aria-label={`编辑补充 ${a.title}`} onClick={() => setDraft({ ...a })}><Pencil size={14}/></button><button className="icon-button" aria-label={`移除补充 ${a.title}`} onClick={() => remove(a.addition_id)}><Trash2 size={14}/></button></div>}</header><Markdown text={a.markdown} source={source} assets={workspace.assets}/>{a.visualization && <QuestionGraph key={a.addition_id} config={a.visualization}/>}</article>;
  }
  return <Modal title="题目资料" subtitle="教师资料页 · 补充绑定题目与内容版本 · 学生导出不含这些内容" close={close} wide>
    <div className="question-detail-id"><button className="question-id" title="复制完整题目 ID" onClick={() => copy(identity.questionId, '已复制题目 ID')}><Copy size={12}/><code>{identity.questionId}</code></button><span>v{identity.revision}</span>{q.instanceId && <small>当前讲义副本</small>}</div>
    <div className="question-detail-body">
      <div className="question-tabs" role="tablist" aria-label="题目内容页签">{[['stem','题干'], ['original','原答案解析'], ...Object.entries(additionKinds)].map(([key,label]) => <button key={key} role="tab" id={`question-tab-${key}`} aria-controls="question-tab-content" aria-selected={tab === key} onClick={() => { setTab(key); setDraft(null); }}>{label}{Object.hasOwn(additionKinds,key) && <span>{entries.filter(a => a.kind === key).length}</span>}</button>)}</div>
      <div className="question-tab-content" role="tabpanel" id="question-tab-content" aria-labelledby={`question-tab-${tab}`}>
        {tab === 'stem' ? <><Markdown text={q.stem} source={source} assets={workspace.assets}/><p className="question-source">来源：{q.source.title} · 原第 {q.source.originalNumber} 题 · {q.source.file}:{q.source.line}</p></> : tab === 'original' ? <>{[['answer','原答案'],['analysis','原解析'],['notes','原教学备注']].map(([key,label]) => q[key] && <div className="original-field" key={key}><strong>{label}</strong><Markdown text={q[key]} source={source} assets={workspace.assets}/></div>)}{!q.answer && !q.analysis && <p className="helper">原材料未提供答案解析。</p>}</> : <>{entries.filter(a => a.kind === tab).map(a => additionView(a))}{!entries.some(a => a.kind === tab) && <p className="addition-empty">还没有{additionKinds[tab]}。复制下方任务交给 AI，再回导结果。</p>}</>}
      </div>
      {all.length > entries.length && <p className="addition-stale">另有 {all.length - entries.length} 份补充依据不同内容快照，已保留在工程中；当前页与导出不使用。</p>}
      {draft && <div className="addition-draft"><strong>另存手工修订 · 保留旧稿</strong><label>补充标题<input aria-label="补充标题" value={draft.title} maxLength={200} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><label>补充 Markdown<textarea aria-label="补充 Markdown" rows={5} value={draft.markdown} onChange={e => setDraft({ ...draft, markdown: e.target.value })}/></label><div><button className="button primary" disabled={busy || !draft.title.trim() || !draft.markdown.trim()} onClick={() => { const { basis, createdAt, origin, target, ...entry } = draft; commit({ format: 'question-studio-additions', schema_version: '0.1', target, additions: [{ ...entry, addition_id: 'a-' + crypto.randomUUID(), author: '教师手工修订' }] }, 'manual'); }}>另存修订</button><button className="text-button" onClick={() => setDraft(null)}>取消</button></div></div>}
      <section className="single-ai-task"><header><span className="eyebrow">AI / THIS QUESTION</span><h3>让 AI 只补充这道题</h3></header><div className="single-task-fields"><label>任务类型<select aria-label="单题 AI 任务类型" value={taskKind} onChange={e => { setTaskKind(e.target.value); setGoal(goals[e.target.value]); }}>{Object.entries(additionKinds).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>补充要求<textarea aria-label="单题 AI 补充要求" rows={2} value={goal} onChange={e => setGoal(e.target.value)}/></label></div><div className="single-task-actions"><button className="button primary" disabled={busy || !goal.trim()} onClick={() => task('copy')}><Copy size={14}/>复制完整 AI 任务</button><button className="button" disabled={busy || !goal.trim()} onClick={() => task('download')}><Download size={14}/>下载任务 MD</button></div><p className="helper">包括完整题目、已有原解、配图数据与返回规范；网站不发送资料到外部 AI。</p></section>
      <section className="single-ai-return"><h3>回导 AI 补充</h3><p className="helper">读取「*.补充.json」或粘贴 JSON，核对后挂到当前题目。</p><button className="button" disabled={busy} onClick={() => picker.current.click()}><FileUp size={14}/>读取补充 JSON</button><input ref={picker} hidden type="file" accept=".json" aria-label="读取单题补充" onChange={e => { load(e.target.files[0]); e.target.value = ''; }}/><details className="addition-paste"><summary>粘贴 AI 返回内容</summary><textarea aria-label="单题补充 JSON" rows={5} value={raw} onChange={e => { ++run.current; setBusy(false); setRaw(e.target.value); setResult(null); setError(''); }}/><button className="button" disabled={busy || !raw.trim()} onClick={() => validate(raw)}>校验补充</button></details>
      {busy && <p role="status" className="helper">正在处理…</p>}{result && <div className="addition-preview"><p>{result.preview.added} 份新补充，{result.preview.reused} 份可复用。请核对数学内容与图像。</p>{result.payload.additions.map(a => additionView(a, true))}<button className="button primary" disabled={busy} onClick={() => commit(result.payload)}><Check size={14}/>确认挂到本题</button></div>}</section>
      {error && <p className="workflow-error" role="alert">{error}</p>}{manualCopy && <label className="manual-copy">手动复制<textarea readOnly aria-label="手动复制内容" rows={6} value={manualCopy} onFocus={e => e.target.select()}/></label>}
    </div><footer className="modal-footer"><span>补充是待核资料；教师打印包含文字与静态图，学生版排除。</span><button className="button" onClick={close}>完成</button></footer>
  </Modal>;
}
