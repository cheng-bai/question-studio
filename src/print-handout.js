import { renderMarkdown } from './Markdown';
import { isVisual, parameterSummary } from './visualizations';
import { imageReferences } from './import-files';
import { resolveAsset } from './model';
const escape = v => String(v || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const defaultPrintSettings = { version:'student', fontSize:12, lineHeight:1.8, allowSplit:false, gap:6, space:'auto' };
export const printPresets = {
  compact: { fontSize:11, lineHeight:1.6, gap:3 },
  relaxed: { fontSize:12, lineHeight:1.8, gap:6 },
};
export function printSettings(value = {}) {
  const number = (key,min,max) => typeof value[key]==='number'&&Number.isFinite(value[key])?Math.min(max,Math.max(min,value[key])):defaultPrintSettings[key];
  return { version:value.version==='teacher'?'teacher':'student',fontSize:number('fontSize',10,16),lineHeight:number('lineHeight',1.4,2.6),allowSplit:value.allowSplit===true,gap:number('gap',0,20),space:['auto','none','20'].includes(value.space)?value.space:'auto' };
}
let fontCSS;
async function offlineCSS() {
  if (!fontCSS) fontCSS=fetch('/interactives/katex-offline.css').then(r=>{if(!r.ok)throw new Error('打印公式字体未加载，请重试。');return r.text();}).catch(e=>{fontCSS=null;throw e;});
  return fontCSS;
}
function diagram(q) {
  const p=q.visualization.parameters;
  if(q.visualization.scene==='equidistance'&&p.boundary)return '<svg class="static-visual" viewBox="0 0 200 100" aria-label="定点在定圆上时的半射线边界"><path d="M40 50H170L160 44M170 50L160 56" fill="none" stroke="#344e45"/><circle cx="40" cy="50" r="3" fill="#344e45"/><text x="100" y="80" text-anchor="middle" font-size="11">定点在圆周上：半射线</text></svg>';
  const string=q.visualization.scene==='string',a=string?5:p.a,c=string?p.c:a*Math.sqrt(1-p.ratio**2),b=string?Math.sqrt(Math.max(0,a*a-c*c)):a*p.ratio;
  const x=Number((100+65*Math.cos(p.degrees*Math.PI/180)).toFixed(2)),y=Number((52-65*b/a*Math.sin(p.degrees*Math.PI/180)).toFixed(2));
  const curve=string&&c>a?'<text x="100" y="56" text-anchor="middle" font-size="12">绳长小于两焦点距离：无解</text>':b===0?'<path d="M35 52H165" stroke="#344e45"/>':`<ellipse cx="100" cy="52" rx="65" ry="${65*b/a}" fill="none" stroke="#344e45"/>`;
  const lines=c<=a?`<path d="M${100-65*c/a} 52L${x} ${y}L${100+65*c/a} 52" fill="none" stroke="#987744"/><circle cx="${x}" cy="${y}" r="2.5" fill="#344e45"/>`:'';
  return `<svg class="static-visual" viewBox="0 -20 200 145" aria-label="目标椭圆轨迹示意">${curve}${lines}</svg>`;
}
export async function printDocument(state,options) {
  const opts=printSettings(options),teacher=opts.version==='teacher',css=await offlineCSS();let number=0,visual=0,missing=0;
  const markdown=(text,q)=>renderMarkdown(text,q.source.assetFile||q.source.file,state.assets).replace(/loading="lazy"/g,'loading="eager"');
  const blocks=state.blocks.map(q=>{
    const fields=isVisual(q)?[q.stem,...(teacher?[q.notes]:[])]:[q.stem,...(teacher?[q.answer,q.analysis,q.tags,q.notes]:[])];
    for(const url of imageReferences(fields.join('\n\n')))if(!resolveAsset(url,q.source.assetFile||q.source.file,state.assets))missing++;
    if(isVisual(q))return `<section class="print-module interactive"><h2>互动探究 ${++visual} · ${escape(q.visualization.title)}</h2>${markdown(q.stem,q)}${diagram(q)}<p class="visual-note">${escape(parameterSummary(q))} · 静态目标轨迹示意；动态构造请使用课堂 HTML。</p>${teacher&&q.notes?`<div class="solution"><strong>教学备注</strong>${markdown(q.notes,q)}</div>`:''}</section>`;
    const space=teacher||opts.space==='none'?0:opts.space==='20'?20:q.type==='解答题'?30:8;
    return `<section class="print-module question"><div class="question-stem"><span class="question-number">${++number}.</span><div>${markdown(q.stem,q)}</div></div>${teacher?`<p class="source">来源：${escape(q.source.title)} · 原第 ${escape(q.source.originalNumber)} 题</p>${q.tags?`<div class="tags"><strong>${q.tagOrigin==='suggested'?'建议考点（待确认）':'考点'}</strong>${markdown(q.tags,q)}</div>`:''}${[['answer','答案'],['analysis','解析'],['notes','教学备注']].map(([key,label])=>q[key]?`<div class="solution"><strong>${label}</strong>${markdown(q[key],q)}</div>`:'').join('')}`:`<div class="writing-space" style="height:${space}mm"></div>`}</section>`;
  }).join('\n');
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="author" content="chengbai"><title>${escape(state.title)} · ${teacher?'教师版':'学生版'}</title><style>${css}
  @page{size:A4;margin:15mm 16mm 17mm}*{box-sizing:border-box}html{background:#edf0e9}body{margin:0;color:#172c25;font-family:"Songti SC","SimSun",serif;font-size:${opts.fontSize}pt;line-height:${opts.lineHeight}}main{width:178mm;max-width:calc(100% - 28px);margin:18px auto;background:white;padding:15mm 0}header{border-bottom:1px solid #567363;margin-bottom:7mm;padding-bottom:4mm}header h1{font-size:20pt;line-height:1.35;margin:0 0 3mm;font-weight:600}header p{margin:0;font-size:10pt;color:#576359}header span{font-size:9pt;display:block;margin-top:2mm;color:#737b71}.print-module{margin:0 0 ${opts.gap}mm;break-inside:${opts.allowSplit?'auto':'avoid'};page-break-inside:${opts.allowSplit?'auto':'avoid'}}.question-stem{display:grid;grid-template-columns:7mm minmax(0,1fr);gap:1mm}.question-number{font-weight:bold}.question-stem>div{min-width:0}p{margin:0 0 2.4mm;overflow-wrap:anywhere}img{display:block;max-width:100%;max-height:65mm;object-fit:contain;margin:3mm auto}h2{font-size:13pt;line-height:1.5;margin:0 0 3mm;break-after:avoid}ul,ol{padding-left:7mm;margin:2mm 0}pre{white-space:pre-wrap;font-size:10pt}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #bdc5bc;padding:2mm}.katex{font-size:1.08em}.katex-display{margin:3mm 0;max-width:100%;overflow-x:auto;overflow-y:hidden}.katex-display>.katex{white-space:normal}.source,.tags,.visual-note{font-size:9pt;color:#58675d;margin:2mm 0}.solution{background:#f5f6f2;border-left:1px solid #8c9f8f;padding:2.5mm 3mm;margin:2.5mm 0;font-size:${Math.max(10,opts.fontSize-1)}pt;break-inside:auto}.solution>strong{display:block;font-size:10pt;margin-bottom:1mm}.missing-image{display:block;border:1px dashed #9a7d56;padding:2mm;font-size:10pt;color:#7f562d}.static-visual{display:block;width:65mm;max-width:100%;height:40mm;margin:3mm auto}.writing-space{break-inside:auto}@media print{html,body{background:white}main{width:auto;max-width:none;margin:0;padding:0}body{color:#111}a{color:inherit;text-decoration:none}.solution{-webkit-print-color-adjust:exact;print-color-adjust:exact}.katex-display{overflow:visible}}
  </style></head><body><main><header><h1>${escape(state.title||'未命名讲义')}</h1><p>${escape(state.subtitle)}</p><span>${teacher?'教师版 · 含已有答案与解析':'学生版 · 题目与练习留白'}</span></header>${blocks}</main></body></html>`;
  return {html,missing};
}
