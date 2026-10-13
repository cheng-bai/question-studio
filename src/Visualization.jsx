import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Plus, GripVertical, Expand, Play, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { SCENES, visualTemplate, sourceFor, frameDocument, validParameters, defaultParameters, parameterSummary } from './visualizations';
import Markdown from './Markdown';

const sources = new Map();
const liveFrames = new Map(), pendingFlushes = new Map();
let flushInFlight = null;
export async function flushWorkspace(state) {
  // All callers share one frame read, so repeated actions cannot replace replies.
  if (!flushInFlight) {
    flushInFlight = Promise.all([...liveFrames.entries()].map(([token, frame]) => new Promise(resolve => {
      const timer = setTimeout(() => { pendingFlushes.delete(token); resolve(null); }, 1500);
      pendingFlushes.set(token, p => { clearTimeout(timer); resolve(p ? { id: frame.id, parameters: p } : null); });
      frame.ref.current?.contentWindow?.postMessage({ channel: 'tixu-visual', token, type: 'pause' }, '*');
    }))).finally(() => { flushInFlight = null; });
  }
  const snapshots = await flushInFlight;
  const current = typeof state === 'function' ? state() : state;
  if (!current) return;
  return { ...current, blocks: current.blocks.map(q => {
    const snapshot = snapshots.find(s => s && s.id === q.instanceId);
    return snapshot ? { ...q, visualization: { ...q.visualization, parameters: snapshot.parameters } } : q;
  }) };
}
export async function loadVisualSource(scene) {
  const file = sourceFor(scene);
  if (!sources.has(file)) sources.set(file, fetch(`/interactives/${file}`).then(r => { if (!r.ok) throw new Error('演示资源加载失败，请重新启动网站。'); return r.text(); }).catch(e => { sources.delete(file); throw e; }));
  return sources.get(file);
}
export function VisualThumbnail({ scene, ratio = .65 }) {
  return <svg className="visual-thumbnail" viewBox="0 0 220 104" aria-hidden="true"><path d="M18 54H202M110 12V94" stroke="#c9d7c0" strokeWidth="1"/><ellipse cx="110" cy="54" rx="71" ry={36 * ratio + 5} fill="none" stroke="#44785a" strokeWidth="1.8"/><path d={scene === 'string' || scene === 'foci' ? 'M65 54L160 33L155 54' : scene === 'trammel' ? 'M70 54L110 22L160 54' : scene === 'compression' ? 'M110 18L160 33L181 54' : 'M110 54L160 33'} stroke="#c58d50" strokeWidth="1.5" fill="none"/><circle cx="160" cy="33" r="3" fill="#c58d50"/>{['foci', 'string'].includes(scene) && <><circle cx="65" cy="54" r="2" fill="#44785a"/><circle cx="155" cy="54" r="2" fill="#44785a"/></>}</svg>;
}
function VisualCard({ item, add, preview }) {
  const q = visualTemplate(item.id), { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `bank:${q.id}`, data: { q, kind: 'bank' } });
  return <article ref={setNodeRef} className={`visual-library-card ${isDragging ? 'dragging' : ''}`}><div className="visual-card-heading"><span>可拖入讲义</span><button className="drag-grip" aria-label={`拖动演示：${item.title}`} {...attributes} {...listeners}><GripVertical size={17}/></button></div><div className="visual-card-body" {...listeners}><VisualThumbnail scene={item.id}/><h3>{item.title}</h3><p>{item.description}</p></div><footer><button className="text-button" onClick={() => preview(q)}><Play size={13}/>先看演示</button><button className="text-button" onClick={() => add(q)} aria-label={`加入演示：${item.title}`}><Plus size={14}/>加入讲义</button></footer></article>;
}
export function VisualLibrary({ add, preview, search = '' }) {
  const filtered = SCENES.filter(s => (s.title + s.description).includes(search));
  return <div className="visual-library"><div className="visual-library-intro"><span>INTERACTIVE MATHEMATICS</span><h3>把观察和推导放进讲义</h3><p>拖入一个演示，与题目一起编排。每个副本独立保存参数。</p></div>{filtered.map(item => <VisualCard key={item.id} item={item} add={add} preview={preview}/>)}{!filtered.length && <p className="helper">没有匹配的演示，请更换关键词。</p>}</div>;
}
export function VisualizationFrame({ q, onParameters, compact = true, teacher = false }) {
  const ref = useRef(), token = useRef(crypto.randomUUID()), initial = useRef(q.visualization.parameters), lastFromFrame = useRef(''), [html, setHtml] = useState(''), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const latest = useRef(onParameters); latest.current = onParameters;
  useEffect(() => {
    let alive = true; setReady(false);
    loadVisualSource(q.visualization.scene).then(s => { if (alive) setHtml(frameDocument(s, { token: token.current, parameters: initial.current, compact })); }).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [q.visualization.scene, compact]);
  useEffect(() => {
    const listener = e => {
      const d = e.data;
      if (e.source !== ref.current?.contentWindow || d?.channel !== 'tixu-visual' || d.token !== token.current) return;
      if (d.type === 'ready') { liveFrames.set(token.current, { id: q.instanceId, ref }); if(JSON.stringify(q.visualization.parameters)!==JSON.stringify(initial.current)) ref.current.contentWindow.postMessage({ channel: 'tixu-visual', token: token.current, type: 'apply', parameters: q.visualization.parameters }, '*'); setReady(true); }
      if (['state', 'flushed'].includes(d.type) && validParameters(q.visualization.scene, d.parameters)) {
        lastFromFrame.current = JSON.stringify(d.parameters); latest.current?.(d.parameters);
        if (d.type === 'flushed') { pendingFlushes.get(token.current)?.(d.parameters); pendingFlushes.delete(token.current); }
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [q.visualization.scene, q.visualization.parameters]);
  useEffect(() => () => { liveFrames.delete(token.current); pendingFlushes.get(token.current)?.(null); pendingFlushes.delete(token.current); }, []);
  useEffect(() => { if (JSON.stringify(q.visualization.parameters) !== lastFromFrame.current) ref.current?.contentWindow?.postMessage({ channel: 'tixu-visual', token: token.current, type: 'apply', parameters: q.visualization.parameters }, '*'); }, [q.visualization.parameters]);
  return error ? <p className="warning">{error}</p> : html ? <div className="visual-frame-container"><iframe ref={ref} className={`visual-frame ${compact ? 'compact' : 'classroom'}`} aria-busy={!ready} style={{visibility:ready?'visible':'hidden'}} title={`${q.visualization.title}交互演示`} sandbox="allow-scripts" srcDoc={html}/>{!ready && <div className="visual-loading-mask">正在初始化交互演示…</div>}</div> : <div className="visual-loading">正在加载本地交互演示…</div>;
}
export function VisualizationBlock({ q, onParameters, classroom }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="visual-block"><div className="visual-block-heading"><span>互动探究</span><h3>{q.visualization.title}</h3></div><div className="visual-block-summary"><VisualThumbnail scene={q.visualization.scene} ratio={q.visualization.parameters.ratio || .8}/><div><Markdown text={q.stem}/><p>{parameterSummary(q)}</p></div></div><div className="visual-block-actions"><button className="text-button" onClick={async () => { if (expanded) await flushWorkspace(); setExpanded(!expanded); }}>{expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {expanded ? '收起演示' : '展开交互'}</button><button className="text-button" onClick={async () => { await flushWorkspace(); setExpanded(false); classroom(); }}><Expand size={14}/>课堂展开</button><button className="text-button" onClick={() => onParameters(defaultParameters(q.visualization.scene))}><RotateCcw size={13}/>重置参数</button></div>{expanded && <VisualizationFrame q={q} onParameters={onParameters}/>}</section>;
}
