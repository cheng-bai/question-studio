import React, { useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, closestCenter, pointerWithin } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookOpen, ArrowDownToLine, Upload, Search, Plus, GripVertical, Pencil, Trash2, Copy, ArrowUp, ArrowDown, Undo2, X, Check, ChevronDown, FolderOpen, FileText, Layers, ShieldCheck, Download, ArrowLeft, Library, CheckCircle2, AlertCircle, Printer, FileUp, FilePlus } from 'lucide-react';
import Markdown from './Markdown';
import { VisualLibrary, VisualizationBlock, VisualizationFrame, flushWorkspace } from './Visualization';
import { isVisual } from './visualizations';
import { downloadClassroom } from './classroom-export';
import { initialState } from './samples';
import { uid, instanceOf, parseExam, exportMarkdown, validateProject } from './model';
import { readWorkspace, writeWorkspace } from './storage';
import ImportDialog from './ImportDialog';
import PrintDialog from './PrintDialog';
import { droppedFiles } from './import-files';

const IconButton = ({ title, children, ...props }) => <button className="icon-button" type="button" title={title} aria-label={title} {...props}>{children}</button>;
function download(name, content, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeName(name) { return (name || '未命名讲义').replace(/[\\/:*?"<>|]/g, '_'); }

function Modal({ title, subtitle, children, close, wide = false }) {
  const ref = useRef(null), closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const prev = document.activeElement;
    const focusables = () => [...ref.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select,[tabindex="0"]')];
    focusables()[0]?.focus();
    const key = e => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const f = focusables(), first = f[0], last = f.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><section ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'wide' : ''}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div><IconButton title="关闭" onClick={close}><X size={20}/></IconButton></header>{children}</section></div>;
}

function QuestionContent({ q, assets, teacher }) {
  return <><Markdown text={q.stem} source={q.source.assetFile || q.source.file} assets={assets}/>{teacher && <div className="teacher-notes">{q.tags && <div><span>{q.tagOrigin==='suggested'?'建议考点（待确认）':'考点'}</span><Markdown text={q.tags}/></div>}{q.answer && <div><span>答案</span><Markdown text={q.answer} source={q.source.assetFile || q.source.file} assets={assets}/></div>}{q.analysis && <div><span>解析</span><Markdown text={q.analysis} source={q.source.assetFile || q.source.file} assets={assets}/></div>}{q.notes && <div><span>备注</span><Markdown text={q.notes}/></div>}{!q.answer && !q.analysis && <p className="muted">本题未提供答案解析</p>}</div>}</>;
}
function BankQuestion({ q, assets, add, used }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `bank:${q.id}`, data: { q, kind: 'bank' } });
  return <article ref={setNodeRef} className={`bank-card ${isDragging ? 'dragging' : ''}`}>
    <div className="bank-card-top"><span className="question-kind">{q.type}</span><span className="original-number">原第 {q.number} 题</span>{used > 0 && <span className="used"><Check size={11}/>已选 {used}</span>}<button className="drag-grip" aria-label={`拖动原第 ${q.number} 题`} {...attributes} {...listeners}><GripVertical size={17}/></button></div>
    <div className="bank-body" {...listeners}><Markdown text={q.stem} source={q.source.assetFile || q.source.file} assets={assets}/></div>
    <footer><span>{q.tagOrigin === 'suggested' && q.tags ? `建议：${q.tags}（待确认）` : q.tags || '未标注考点'}</span><button onClick={() => add(q)} aria-label={`加入原第 ${q.number} 题`}><Plus size={15}/>加入讲义</button></footer>
  </article>;
}
function PaperBlock({ q, index, number, total, assets, teacher, edit, duplicate, remove, move, onParameters, classroom }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: q.instanceId, data: { kind: 'block' } });
  return <article ref={setNodeRef} className={`paper-block ${isVisual(q) ? 'visual-paper-block' : ''} ${isDragging ? 'sorting' : ''} ${isOver ? 'insertion-target' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }} data-question-id={q.questionId}>
    <div className="block-toolbar"><button className="drag-grip" aria-label={`拖动讲义第 ${index + 1} 题`} {...attributes} {...listeners}><GripVertical size={16}/></button><span>{q.type}</span><div className="block-actions"><IconButton title={`编辑第 ${index + 1} 题`} onClick={() => edit(q)}><Pencil size={14}/></IconButton><IconButton title={`复制第 ${index + 1} 题`} onClick={() => duplicate(q)}><Copy size={14}/></IconButton><IconButton title={`上移第 ${index + 1} 题`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={14}/></IconButton><IconButton title={`下移第 ${index + 1} 题`} disabled={index === total - 1} onClick={() => move(index, index + 1)}><ArrowDown size={14}/></IconButton><IconButton title={`移除第 ${index + 1} 题`} onClick={() => remove(q.instanceId)}><Trash2 size={14}/></IconButton></div></div>
    <div className="block-content"><span className="block-number">{isVisual(q) ? '◈' : String(number).padStart(2, '0')}</span><div>{isVisual(q) ? <VisualizationBlock q={q} onParameters={onParameters} classroom={classroom}/> : <QuestionContent q={q} assets={assets} teacher={teacher}/>}<div className="block-source">{q.source.title} <span>{isVisual(q) ? '· 独立参数副本' : `· 原第 ${q.source.originalNumber} 题`}</span></div></div></div>
  </article>;
}

function EditModal({ question, assets, save, close }) {
  const [q, setQ] = useState(structuredClone(question));
  const [previewTeacher, setPreviewTeacher] = useState(false);
  return <Modal title={isVisual(q) ? "编辑演示模块" : "编辑题目副本"} subtitle="本次修改只应用于这道讲义题目，题库原题保持原样。" close={close} wide><div className="edit-columns"><div className="edit-fields">{isVisual(q) && <label>演示名称<input className="visual-title-input" value={q.visualization.title} onChange={e => setQ({ ...q, visualization: { ...q.visualization, title: e.target.value } })}/></label>}{(isVisual(q) ? [['stem', '课堂探究任务'], ['notes', '教学备注']] : [['stem', '题干 Markdown'], ['answer', '答案'], ['analysis', '解析'], ['tags', '考点'], ['notes', '教学备注 / 提示']]).map(([key, label]) => <label key={key}>{label}<textarea value={q[key]} onChange={e => setQ({ ...q, [key]: e.target.value, ...(key==='tags'?{tagOrigin:'manual',tagsConfirmed:true}:{}) })} rows={key === 'stem' ? 8 : key === 'analysis' ? 4 : 2}/></label>)}</div><div className="edit-preview"><div className="preview-heading"><span>实时预览</span><button className="text-button" onClick={() => setPreviewTeacher(!previewTeacher)}>{previewTeacher ? '教师版' : '学生版'}<ChevronDown size={14}/></button></div><QuestionContent q={q} assets={assets} teacher={previewTeacher}/></div></div><footer className="modal-footer"><span>支持 $行内公式$ 与 $$独立公式$$</span><button className="button primary" disabled={!q.stem.trim() || isVisual(q) && !q.visualization.title.trim()} onClick={() => save(q)}><Check size={16}/>保存修改</button></footer></Modal>;
}

function Paper({ children, active }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'paper' });
  return <div ref={setNodeRef} className={`paper ${active ? 'accepting' : ''} ${isOver ? 'over' : ''}`}>{children}</div>;
}

export default function App() {
  const [state, setState] = useState(null), [saveStatus, setSaveStatus] = useState('正在读取'), [teacher, setTeacher] = useState(false), [search, setSearch] = useState(''), [examId, setExamId] = useState('all'), [type, setType] = useState('全部'), [modal, setModal] = useState(null), [drag, setDrag] = useState(null), [toast, setToast] = useState(''), [history, setHistory] = useState([]), [fatal, setFatal] = useState(false), [libraryTab, setLibraryTab] = useState('questions'), [fileDrag, setFileDrag] = useState(false);
  const stateRef = useRef(state); stateRef.current = state;
  const fileDepth = useRef(0);
  const restoreInput = useRef(), toastTimer = useRef(), saveRevision = useRef(0);
  useEffect(() => {
    const isFile = e => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = e => { if (isFile(e)) { e.preventDefault(); fileDepth.current++; setFileDrag(true); } };
    const over = e => { if (isFile(e)) { e.preventDefault(); e.dataTransfer.dropEffect='copy'; } };
    const leave = e => { if (isFile(e) && --fileDepth.current <= 0) { fileDepth.current=0; setFileDrag(false); } };
    const drop = e => { if (!isFile(e)) return; e.preventDefault(); e.stopPropagation(); fileDepth.current=0; setFileDrag(false); setModal({ kind:'import', dropped:droppedFiles(e.dataTransfer), id:uid() }); };
    window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const notify = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4200); };
  useEffect(() => {
    readWorkspace().then(value => { setState(value ? validateProject(value) : initialState()); setSaveStatus('已保存到本机'); }).catch(() => { setFatal(true); setSaveStatus('读取失败'); });
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (!state) return;
    setSaveStatus('保存中…');
    const revision = ++saveRevision.current;
    const timer = setTimeout(() => writeWorkspace(state).then(() => { if (revision === saveRevision.current) setSaveStatus('已保存到本机'); }).catch(() => { setSaveStatus('保存失败，请下载工程'); }), 350);
    return () => clearTimeout(timer);
  }, [state]);
  function update(fn, base = stateRef.current) { setHistory(h => [...h.slice(-29), base]); const next = fn(base); stateRef.current = next; setState(next); }
  function undo() { if (!history.length) return; setState(history.at(-1)); setHistory(history.slice(0, -1)); notify('已撤销上一步'); }
  function add(q, at = state.blocks.length) { update(s => ({ ...s, blocks: [...s.blocks.slice(0, at), instanceOf(q), ...s.blocks.slice(at)] })); notify('已加入讲义，可拖动题目调整顺序'); }
  function patchParameters(id, parameters) { setState(s => ({ ...s, blocks: s.blocks.map(b => b.instanceId === id ? { ...b, visualization: { ...b.visualization, parameters: { ...parameters } } } : b) })); }
  async function editBlock(q) {
    const current = isVisual(q) ? await flushWorkspace(() => stateRef.current) : stateRef.current;
    const fresh = current.blocks.find(b => b.instanceId === q.instanceId);
    if (!fresh) return;
    stateRef.current = current; setState(current); setModal({ kind: 'edit', q: fresh });
  }
  async function duplicateBlock(q) {
    const current = isVisual(q) ? await flushWorkspace(() => stateRef.current) : stateRef.current;
    const fresh = current.blocks.find(b => b.instanceId === q.instanceId);
    if (!fresh) return;
    update(s => { const at = s.blocks.findIndex(b => b.instanceId === fresh.instanceId); return { ...s, blocks: [...s.blocks.slice(0, at + 1), { ...structuredClone(fresh), instanceId: uid() }, ...s.blocks.slice(at + 1)] }; }, current);
    notify(isVisual(q) ? '已复制演示及当前参数' : '已复制题目');
  }
  function preview(q) { setModal({ kind: 'visual', q }); }
  function move(from, to) { if (from !== to) update(s => ({ ...s, blocks: arrayMove(s.blocks, from, to) })); }
  async function restore(file) {
    if (!file) return;
    try { if (file.size > 100 * 1024 * 1024) throw new Error('工程文件超过首版的 100 MB 上限。'); const value = validateProject(JSON.parse(await file.text())); update(() => value); setExamId('all'); setSearch(''); setModal(null); notify('工程已恢复，可用撤销返回之前的讲义'); } catch (e) { notify(`恢复失败：${e.message}`); }
  }
  function dragEnd({ active, over }) {
    setDrag(null); if (!over) return;
    const index = state.blocks.findIndex(q => q.instanceId === over.id);
    if (active.data.current?.kind === 'bank') add(active.data.current.q, index < 0 ? state.blocks.length : index);
    else { const from = state.blocks.findIndex(q => q.instanceId === active.id); if (from >= 0) move(from, index < 0 ? state.blocks.length - 1 : index); }
  }
  if (fatal) return <main className="loading"><h1>本机工程暂时无法读取</h1><p>可能是浏览器存储不可用或旧工程格式不兼容。已有存储未被覆盖。</p><button className="button" onClick={() => { setFatal(false); setState(initialState()); }}>进入演示工作区</button><p>进入演示后，新内容会保存为当前工程。</p></main>;
  if (!state) return <main className="loading">正在打开题序工作室…</main>;
  const all = state.exams.flatMap(e => e.questions.map(q => ({ ...q, examId: e.id })));
  const filtered = all.filter(q => (examId === 'all' || q.examId === examId) && (type === '全部' || q.type === type) && `${q.stem} ${q.tags} ${q.source.title}`.toLowerCase().includes(search.toLowerCase()));
  const questionCount = state.blocks.filter(q => !isVisual(q)).length, visualCount = state.blocks.length - questionCount;
  const counts = state.blocks.reduce((a, q) => ({ ...a, [q.type]: (a[q.type] || 0) + 1 }), {});
  return <DndContext sensors={sensors} collisionDetection={args => { if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => c.id !== 'paper') }); const hits = pointerWithin(args); return hits.length > 1 ? hits.filter(h => h.id !== 'paper') : hits; }} onDragStart={({ active }) => setDrag(active.data.current?.q || state.blocks.find(q => q.instanceId === active.id))} onDragEnd={dragEnd} onDragCancel={() => setDrag(null)}>
    <div className="app-shell"><header className="app-header"><div className="brand"><div className="brand-symbol"><Layers size={22}/></div><strong>题序</strong><span className="brand-divider"/><span className="brand-subtitle">讲义工作室</span><span className="beta">LOCAL BETA</span></div><div className="header-actions"><span className={`save-status ${saveStatus.includes('失败') ? 'failed' : ''}`}><span/>{saveStatus}</span><button className="button" onClick={async () => { download(`${safeName(state.title)}.题序.json`, JSON.stringify(await flushWorkspace(() => stateRef.current), null, 2), 'application/json'); notify('已下载完整工程，包含题库、讲义与配图'); }}><Download size={16}/>备份工程</button><button className="button print-button" aria-label="打印讲义" disabled={!state.blocks.length} onClick={async () => { const current = await flushWorkspace(() => stateRef.current); stateRef.current=current; setState(current); setModal({ kind: 'print' }); }}><Printer size={16}/><span>打印</span></button><button className="button primary" onClick={() => setModal({ kind: 'export' })}><ArrowDownToLine size={16}/>导出讲义</button></div></header>
    <main className="workspace"><section className="editor-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR HANDOUT</span><h1>编排讲义 <span>{questionCount} 题{visualCount ? ` · ${visualCount} 演示` : ''}</span></h1></div><div className="editor-controls"><IconButton title="新建讲义" onClick={() => { update(s => ({...s,title:'未命名讲义',subtitle:'',blocks:[]})); notify('已新建空白讲义，原编排可撤销恢复'); }}><FilePlus size={17}/></IconButton><IconButton title="撤销上一步" disabled={!history.length} onClick={undo}><Undo2 size={17}/></IconButton><div className="segmented"><button className={!teacher ? 'active' : ''} aria-pressed={!teacher} onClick={() => setTeacher(false)}>学生版</button><button className={teacher ? 'active' : ''} aria-pressed={teacher} onClick={() => setTeacher(true)}>教师版</button></div></div></div>
    <div className="editor-hint"><span><span className="live-dot"/>从右侧拖入题目，按你的教学思路自由组合</span><span>副本编辑 · 原题保留</span></div>
    <div className="paper-scroll"><Paper active={!!drag}><div className="paper-masthead"><span>MATHEMATICS / WORKSHEET</span><span>{teacher ? '教师版 · 含解析' : '学生版 · 仅题目'}</span></div><input className="handout-title" aria-label="讲义标题" value={state.title} placeholder="给讲义起个名字" onChange={e => update(s => ({ ...s, title: e.target.value }))}/><input className="handout-subtitle" aria-label="讲义副标题" value={state.subtitle} placeholder="年级 / 专题 / 班级" onChange={e => update(s => ({ ...s, subtitle: e.target.value }))}/><div className="paper-rule"/>
    <SortableContext items={state.blocks.map(q => q.instanceId)} strategy={verticalListSortingStrategy}>{state.blocks.map((q, i) => <PaperBlock key={q.instanceId} q={q} index={i} number={state.blocks.slice(0, i + 1).filter(b => !isVisual(b)).length} onParameters={p => patchParameters(q.instanceId, p)} classroom={() => preview(q)} total={state.blocks.length} assets={state.assets} teacher={teacher} edit={editBlock} duplicate={duplicateBlock} remove={id => { update(s => ({ ...s, blocks: s.blocks.filter(q => q.instanceId !== id) })); notify('已移除题目，可用撤销恢复'); }} move={move}/>)}</SortableContext>
    <div className={`drop-zone ${drag ? 'drag-active' : ''}`}><div><Plus size={23}/></div><strong>{drag ? '松开，将题目放入讲义' : state.blocks.length ? '下一道题，由你决定' : '从第一道题开始'}</strong><p>拖入右侧题目，或点击「加入讲义」</p></div><footer className="paper-footer"><span>题序 · 让好题成为好讲义</span><span>{String(questionCount).padStart(2, '0')} QUESTIONS{visualCount ? ` / ${visualCount} INTERACTIVE` : ''}</span></footer></Paper></div>
    <footer className="editor-footer"><span><Layers size={14}/>{Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') : '讲义还没有题目'}</span><span>{teacher ? '答案解析随题呈现' : '导出时不含答案、解析、考点与备注'}</span></footer></section>
    <aside className="library-panel" aria-label="试卷集合"><div className="panel-heading"><div><span className="eyebrow">QUESTION LIBRARY</span><h2>试卷集合 <span>{state.exams.length} 份</span></h2></div><button className="button dark" onClick={() => setModal({ kind: 'import' })}><Upload size={15}/>导入资料</button></div><div className="library-switch"><button className={libraryTab === 'questions' ? 'active' : ''} onClick={() => setLibraryTab('questions')}>试卷题库</button><button className={libraryTab === 'visuals' ? 'active' : ''} onClick={() => setLibraryTab('visuals')}>交互演示 <span>9</span></button></div><button className="file-drop-invitation" onClick={() => setModal({kind:'import'})}><FileUp size={17}/><span><strong>拖入 MD 或资料文件夹</strong><small>自动拆题 · 配图预览 · 考点核对</small></span><Upload size={14}/></button><div className="library-tools"><label className="search-box"><Search size={17}/><input aria-label="搜索题目" placeholder="搜索题干、考点或试卷名称" value={search} onChange={e => setSearch(e.target.value)}/>{search && <IconButton title="清空搜索" onClick={() => setSearch('')}><X size={14}/></IconButton>}</label>{libraryTab === 'questions' && <><label className="exam-select"><BookOpen size={16}/><select aria-label="选择试卷" value={examId} onChange={e => setExamId(e.target.value)}><option value="all">全部试卷</option>{state.exams.map(e => <option value={e.id} key={e.id}>{e.title}{e.demo ? '（演示）' : ''} · {e.questions.length}题</option>)}</select><ChevronDown size={14}/></label><div className="library-filter"><div className="type-tabs">{['全部', '填空题', '选择题', '解答题'].map(t => <button className={type === t ? 'active' : ''} key={t} aria-pressed={type === t} onClick={() => setType(t)}>{t === '全部' ? '全部题型' : t}</button>)}</div><span>{filtered.length} 题</span></div></>}</div>
    <div className="bank-scroll">{libraryTab === 'visuals' ? <VisualLibrary add={add} preview={preview} search={search}/> : <>{state.exams.filter(e => examId === 'all' || examId === e.id).map(e => { const qs = filtered.filter(q => q.examId === e.id); return qs.length ? <section className="exam-group" key={e.id}><div className="exam-heading"><FileText size={14}/><h3>{e.title}</h3>{e.demo && <span>演示</span>}<small>{qs.length} 题</small></div>{qs.map(q => <BankQuestion key={q.id} q={q} assets={state.assets} used={state.blocks.filter(b => b.questionId === q.id).length} add={add}/>)}</section> : null; })}{!filtered.length && <div className="no-results"><Search size={30}/><h3>没有找到匹配题目</h3><p>试试更短的关键词，或切换试卷与题型。</p><button className="text-button" onClick={() => { setSearch(''); setType('全部'); setExamId('all'); }}>清除筛选</button></div>}</>}</div>
    <footer className="library-footer"><ShieldCheck size={15}/><span>资料留在本机 · Markdown 原文保留</span><button className="text-button" onClick={() => restoreInput.current.click()}>恢复工程</button><input ref={restoreInput} type="file" hidden accept=".json" onChange={e => { restore(e.target.files[0]); e.target.value = ''; }}/></footer></aside></main></div>
    <DragOverlay dropAnimation={null}>{drag && <div className="drag-overlay"><span><GripVertical size={16}/>正在移动题目</span><Markdown text={drag.stem} source={drag.source.assetFile || drag.source.file} assets={state.assets}/></div>}</DragOverlay>
    {fileDrag && <div className="file-drop-overlay" role="status"><div><FileUp size={42}/><h2>松开，读取你的资料</h2><p>支持 MD、MD 与配图，或整个资料文件夹</p><span>只在本机处理 · 原文件保持原样</span></div></div>}
    {toast && <div role="status" className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    {modal?.kind === 'import' && <ImportDialog key={modal.id || 'picker'} Modal={Modal} dropped={modal.dropped} close={() => setModal(null)} notify={notify} commit={(exams, assets) => { update(s => ({ ...s, exams: [...s.exams, ...exams], assets: { ...s.assets, ...assets } })); setExamId(exams[0].id); setSearch(''); setType('全部'); setLibraryTab('questions'); setModal(null); notify(`已导入 ${exams.length} 份试卷、${exams.reduce((n, e) => n + e.questions.length, 0)} 道题`); }}/ >}
    {modal?.kind === 'edit' && <EditModal question={modal.q} assets={state.assets} close={() => setModal(null)} save={q => { update(s => ({ ...s, blocks: s.blocks.map(b => b.instanceId === q.instanceId ? (isVisual(q) ? { ...q, visualization: { ...q.visualization, parameters: b.visualization.parameters } } : q) : b) })); setModal(null); notify('题目副本已更新，题库原题未改动'); }}/ >}
    {modal?.kind === 'visual' && (() => { const q = state.blocks.find(b => b.instanceId === modal.q.instanceId) || modal.q; return <Modal title={q.visualization.title} subtitle="课堂交互演示 · 含数学说明与教师推导。调整参数会保存到当前演示副本。" close={async () => { await flushWorkspace(); setModal(null); }} wide><VisualizationFrame key={q.instanceId || q.id} q={q} compact={false} onParameters={p => q.instanceId ? patchParameters(q.instanceId, p) : setModal(m => ({ ...m, q: { ...m.q, visualization: { ...m.q.visualization, parameters: p } } }))}/></Modal>; })()}
    {modal?.kind === 'print' && <PrintDialog Modal={Modal} workspace={state} persist={options => setState(s => ({...s,printSettings:options}))} close={() => setModal(null)}/> }
    {modal?.kind === 'export' && <Modal title="导出你的讲义" subtitle={`${questionCount} 道题、${visualCount} 个演示。题目按当前顺序编号。已导入的本地配图会内嵌在 Markdown 中。`} close={() => setModal(null)}><div className="export-options"><button onClick={async () => { try { await downloadClassroom(await flushWorkspace(() => stateRef.current)); notify('课堂 HTML 已导出，交互演示与公式可离线使用'); setModal(null); } catch (e) { notify(e.message); } }} disabled={!state.blocks.length}><div><Layers size={24}/><strong>课堂互动 HTML（含推导）</strong><p>保留题目、演示参数、交互控制与数学讲解，可离线打开。</p></div><ArrowDownToLine size={19}/></button><button disabled={!state.blocks.length} onClick={async () => { download(`${safeName(state.title)}-学生版.md`, exportMarkdown(await flushWorkspace(() => stateRef.current))); notify('学生版 Markdown 已导出'); setModal(null); }}><div><FileText size={24}/><strong>学生版 Markdown</strong><p>仅题干和配图，去除独立答案、解析、考点及备注字段。</p></div><ArrowDownToLine size={19}/></button><button disabled={!state.blocks.length} onClick={async () => { download(`${safeName(state.title)}-教师版.md`, exportMarkdown(await flushWorkspace(() => stateRef.current), true)); notify('教师版 Markdown 已导出'); setModal(null); }}><div><BookOpen size={24}/><strong>教师版 Markdown</strong><p>题后答案与解析，保留来源文件、原题号、考点和教学备注。</p></div><ArrowDownToLine size={19}/></button></div><p className="export-note">提醒：原题干中混写的答案或提示，需要先在编辑器中手动检查。工程备份用于继续编辑，包含全部题库内容。</p></Modal>}
  </DndContext>;
}
