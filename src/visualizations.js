export const SCENES = [
  ['foci', '双焦点距离和', '拖动动点，观察两段距离怎样变化，距离和怎样保持不变。'],
  ['directrix', '焦点与准线', '改变轴比，观察焦点距离与到准线距离的比值。'],
  ['compression', '圆的压缩', '沿一个方向压缩圆，比较圆上点与椭圆上点的坐标。'],
  ['circles', '同心圆参数构造', '用同一参数角连接两个同心圆，观察横纵坐标的来源。'],
  ['trammel', '双滑块绘图', '移动相互垂直轨道上的滑块，观察杆上定点的轨迹。'],
  ['projection', '圆的正投影', '改变倾斜程度与观察方向，比较空间示意和真实投影。'],
  ['cone', '圆锥截线', '旋转空间视图，观察斜截平面与圆锥的交线。'],
  ['equidistance', '定圆与定点等距', '比较到定点与定圆的距离，并探索定点落在圆周上的边界。'],
  ['string', 'Anatomy 椭圆拉绳仪', '固定绳长 10，改变焦距，比较椭圆、圆、闭线段和无解情形。'],
].map(([id, title, description]) => ({ id, title, description }));
export const isVisual = q => q.kind === 'visualization';
export const sourceFor = scene => scene === 'string' ? 'ellipse-string-instrument.html' : 'ellipse-definitions.html';
export function defaultParameters(scene) {
  return scene === 'string' ? { c: 3, degrees: 40 } : { mode: scene, a: 5, ratio: .8, degrees: 35, blend: 1, yaw: 32, boundary: false };
}
export function validParameters(scene, p) {
  if (!SCENES.some(s => s.id === scene) || !p || typeof p !== 'object') return false;
  const specs = scene === 'string' ? [['c', 0, 6], ['degrees', 0, 360]] : [['a', 3, 7], ['ratio', .2, 1], ['degrees', 0, 360], ['blend', 0, 1], ['yaw', -80, 80]];
  return specs.every(([k, min, max]) => Number.isFinite(p[k]) && p[k] >= min && p[k] <= max) && (scene === 'string' || p.mode === scene && typeof p.boundary === 'boolean');
}
export function visualTemplate(scene) {
  const item = SCENES.find(s => s.id === scene);
  if (!item) throw new Error('未知的演示模板');
  return { id: `visual:${scene}`, kind: 'visualization', number: '—', type: '交互演示', stem: item.description, answer: '', analysis: '', tags: '椭圆；可视化探究', notes: '', source: { title: '椭圆交互实验室', file: '内置可视化模板', line: 1, originalNumber: scene }, visualization: { scene, title: item.title, parameters: defaultParameters(scene) } };
}
export function parameterSummary(q) {
  const p = q.visualization.parameters;
  return q.visualization.scene === 'string' ? `总绳长 10 · 半焦距 c=${p.c.toFixed(2)} · 参数角 ${p.degrees.toFixed(0)}°` : `a=${p.a.toFixed(1)} · b/a=${p.ratio.toFixed(2)} · 参数角 ${p.degrees.toFixed(0)}°`;
}

// This function is also serialized into offline exports: keep it self-contained.
export function frameDocument(html, config) {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  const style = `<style>
    body.tixu-embed{background:#fffefa!important;padding:0!important;margin:0!important}
    body.tixu-embed main{padding:8px 12px!important;max-width:1400px!important}
    body.tixu-embed .masthead,body.tixu-embed .intro,body.tixu-embed .mode-nav,body.tixu-embed .shared,body.tixu-embed #instrument,body.tixu-embed main>footer,body.tixu-embed main>header{display:none!important}
    body.tixu-compact .lesson-grid,body.tixu-compact #proof,body.tixu-compact .teacher,body.tixu-compact .experiment{display:none!important}
    body.tixu-compact .experiment-grid{display:block!important}
    body.tixu-compact .explanation{padding:10px!important}
    body.tixu-compact .explanation>:not(.metrics):not(#status){display:none!important}
    body.tixu-compact .sliders{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    body.tixu-compact #diagram{max-height:330px!important}
    body.tixu-compact .iso{margin:0!important}
  </style>`;
  const bridge = `<script>(()=>{const boot=()=>{
    const cfg=${json}; const api=window.__tixuApi;
    document.body.classList.add('tixu-embed');if(cfg.compact)document.body.classList.add('tixu-compact');
    let applying=false,timer=null,last='';
    function apply(p){if(!api)return;applying=true;api.applyState(p);applying=false;last=JSON.stringify(api.getState());}
    function send(){if(!api||applying)return;const p=api.getState();const key=JSON.stringify(p);if(key!==last){last=key;parent.postMessage({channel:'tixu-visual',token:cfg.token,type:'state',parameters:p},'*');}}
    function schedule(){clearTimeout(timer);timer=setTimeout(send,300);}
    apply(cfg.parameters);
    window.addEventListener('message',e=>{const d=e.data;if(e.source!==parent||!d||d.channel!=='tixu-visual'||d.token!==cfg.token)return;if(d.type==='apply')apply(d.parameters);if(d.type==='pause'){clearTimeout(timer);api.pause();send();parent.postMessage({channel:'tixu-visual',token:cfg.token,type:'flushed',parameters:api.getState()},'*');}});
    for(const name of ['input','change','pointerup','click','keyup'])document.addEventListener(name,schedule);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){api.pause();send();}});
    parent.postMessage({channel:'tixu-visual',token:cfg.token,type:'ready'},'*');
  };if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();})();<\/script>`;
  const document = html.replace('</head>', style + '</head>');
  const end = document.lastIndexOf('</body>');
  return end < 0 ? document + bridge : document.slice(0, end) + bridge + document.slice(end);
}
