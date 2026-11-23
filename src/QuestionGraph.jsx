import React, { useState } from 'react';
import Markdown from './Markdown';

export function quadraticSVG(config) {
  const { a, h, k } = config.parameters, [xmin, xmax] = config.x_range, [ymin, ymax] = config.y_range;
  const w = 520, height = 280, x = n => (n - xmin) / (xmax - xmin) * w, y = n => height - (n - ymin) / (ymax - ymin) * height;
  const n = value => Number(value.toFixed(3));
  const grid = Array.from({ length: 11 }, (_, i) => `<path d="M${i*w/10} 0V${height} M0 ${i*height/10}H${w}" stroke="#e1e8dc" stroke-width="1"/>`).join('');
  const axes = `${xmin <= 0 && xmax >= 0 ? `<path d="M${n(x(0))} 0V${height}" stroke="#839784"/>` : ''}${ymin <= 0 && ymax >= 0 ? `<path d="M0 ${n(y(0))}H${w}" stroke="#839784"/>` : ''}`;
  const points = Array.from({ length: 401 }, (_, i) => { const v = xmin + i*(xmax-xmin)/400; return `${n(x(v))},${n(y(a*(v-h)**2+k))}`; }).join(' ');
  const vertex = a !== 0 && h >= xmin && h <= xmax && k >= ymin && k <= ymax ? `<circle cx="${n(x(h))}" cy="${n(y(k))}" r="4" fill="#b98043"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="question-function-graph" viewBox="0 0 580 330" role="img" aria-label="二次函数图像"><rect width="580" height="330" fill="#fbfcf7"/><svg x="40" y="15" width="520" height="280" viewBox="0 0 520 280" overflow="hidden">${grid}${axes}<polyline points="${points}" fill="none" stroke="#205747" stroke-width="2.5"/>${vertex}</svg><g fill="#708069" font-size="12"><text x="40" y="316">${xmin}</text><text x="540" y="316">${xmax}</text><text x="7" y="25">${ymax}</text><text x="7" y="290">${ymin}</text><text x="565" y="316">x</text><text x="7" y="12">y</text></g></svg>`;
}
export default function QuestionGraph({ config }) {
  const [parameters, setParameters] = useState({ ...config.parameters });
  const { a, h, k } = parameters;
  return <div className="question-graph"><Markdown text={`$y=${a}(x${h < 0 ? '+' : '-'}${Math.abs(h)})^2${k < 0 ? '-' : '+'}${Math.abs(k)}$`}/><div dangerouslySetInnerHTML={{ __html: quadraticSVG({ ...config, parameters }) }}/><div className="graph-sliders">{['a', 'h', 'k'].map(key => <label key={key}>{key}<input aria-label={`图像参数 ${key}`} type="range" min="-10" max="10" step="0.1" value={parameters[key]} onChange={e => setParameters(p => ({ ...p, [key]: Number(e.target.value) }))}/><output>{parameters[key]}</output></label>)}</div><div className="graph-caption"><span>{a === 0 ? 'a = 0，此时退化为常函数。' : `顶点 (${h}, ${k}) · ${a > 0 ? '开口向上' : '开口向下'}`}</span><button type="button" className="text-button" onClick={() => setParameters({ ...config.parameters })}>重置参数</button></div><p className="helper">滑块用于临时探究；重新打开时使用 AI 返回的初始参数。</p></div>;
}
