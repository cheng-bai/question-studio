import { renderMarkdown } from './Markdown';
import { loadVisualSource } from './Visualization';
import { isVisual, frameDocument, sourceFor, parameterSummary } from './visualizations';
const escape = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function downloadClassroom(state) {
  const sources = {};
  for (const q of state.blocks.filter(isVisual)) sources[sourceFor(q.visualization.scene)] = await loadVisualSource(q.visualization.scene);
  const response = await fetch('/interactives/katex-offline.css');
  if (!response.ok) throw new Error('离线公式资源不可用，请重新启动网站。');
  const css = await response.text();
  let qn = 0, vn = 0;
  const blocks = state.blocks.map(q => {
    if (isVisual(q)) return `<section class="module"><div class="module-heading"><span>互动探究 ${++vn}</span><h2>${escape(q.visualization.title)}</h2></div><div class="markdown">${renderMarkdown(q.stem)}</div><p class="parameters">${escape(parameterSummary(q))}</p><iframe sandbox="allow-scripts" title="${escape(q.visualization.title)}交互演示" data-visual="${vn - 1}"></iframe>${q.notes ? `<details><summary>教学备注</summary>${renderMarkdown(q.notes)}</details>` : ''}</section>`;
    return `<section class="module question"><h2>题目 ${++qn}</h2><div class="markdown">${renderMarkdown(q.stem, q.source.assetFile || q.source.file, state.assets)}</div></section>`;
  }).join('\n');
  const data = { sources, visuals: state.blocks.filter(isVisual).map(q => ({ file: sourceFor(q.visualization.scene), parameters: q.visualization.parameters })) };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(state.title)} · 课堂互动</title><style>${css}
  *{box-sizing:border-box}body{margin:0;background:#edf0e7;color:#2b4535;font-family:"PingFang SC",sans-serif}main{max-width:1100px;padding:36px 20px;margin:auto}header{padding:20px 0 30px}header span{font-size:11px;letter-spacing:2px;color:#8e9d7e}h1{font:32px "Songti SC",serif;margin:14px 0}header p,.parameters{font-size:12px;color:#869775;line-height:1.8}.module{background:#fffefa;border:1px solid #dce4d1;border-radius:9px;padding:24px;margin:18px 0}h2{font-size:18px;margin:8px 0 16px}.module-heading>span{font-size:10px;color:#a18c60}.markdown{font:16px/1.9 "Songti SC",serif;overflow-wrap:anywhere}.markdown img{max-width:100%;max-height:400px}.katex-display{overflow-x:auto;overflow-y:hidden}iframe{display:block;width:100%;height:820px;border:1px solid #e0e6d5;border-radius:5px;margin-top:15px;background:white}details{margin-top:18px;font-size:12px}summary{cursor:pointer;color:#8e9c75}@media(max-width:600px){main{padding:16px 10px}.module{padding:16px}h1{font-size:25px}iframe{height:950px}}@media print{iframe{display:none}.module{break-inside:avoid}.module-heading:after{content:'交互内容请在课堂 HTML 中打开';font-size:11px;color:#888}body{background:white}}
  </style></head><body><main><header><span>题序 / CLASSROOM INTERACTIVE</span><h1>${escape(state.title)}</h1><p>${escape(state.subtitle)}</p><p>课堂演示版 · 演示内含数学说明与教师推导。此文件可离线使用；不是无提示的学生试卷。</p></header>${blocks}</main><script>const DATA=${json};const build=${frameDocument.toString()};document.querySelectorAll('[data-visual]').forEach((frame,i)=>{const v=DATA.visuals[i];frame.srcdoc=build(DATA.sources[v.file],{parameters:v.parameters,compact:false,token:'offline-'+i});});<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `${(state.title || '讲义').replace(/[\\/:*?"<>|]/g, '_')}-课堂互动.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
