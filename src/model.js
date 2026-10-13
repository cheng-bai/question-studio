import { questionImageReferences, rewriteImageDestinations } from './question-package.js';
import { resolveAsset, additionsFor } from './question-identity.js';
import { validateStoredAdditions } from './question-addition-format.js';
export { normalizePath, resolveAsset } from './question-identity.js';
import { isVisual, validParameters, parameterSummary } from './visualizations.js';
import { suggestTags } from './tagging.js';
export { suggestTags } from './tagging.js';
export const uid = () => crypto.randomUUID();
export const VERSION = 1;

// A source question is immutable. Every insertion creates a separate editable instance.
export function instanceOf(q) {
  return { ...structuredClone(q), instanceId: uid(), questionId: q.id };
}

function boundary(line) {
  // Indented lists and parenthesized subquestions are never top-level questions.
  if (/^(?:\t| {2,})/.test(line)) return null;
  const clean = line.trim();
  const m = clean.match(/^(?:(#{1,6})\s+)?(\*\*)?(?:第\s*)?(Q?\d{1,5})(?:\s*题|[.．、](?!\d)|[）)])(?:\*\*)?\s*(.*)$/i);
  if (!m) return null;
  return { number: m[3].replace(/^Q/i, ''), body: m[4], strong: !!m[1] || !!m[2], numberedDot: /^ ?\d{1,5}[.．](?!\d)/.test(line), style: m[1] ? `heading${m[1].length}` : m[2] ? 'bold' : 'plain' };
}
function fieldMarker(line) {
  const clean = line.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');
  const labels = '参考答案与解析|参考答案及解析|答案与解析|答案解析|参考答案|答案|解析|解答|解题过程|考点|知识点|核心考点|提示|教学备注';
  const m = clean.match(new RegExp(`^(?:【(${labels})(?:[：:]([^】]*))?】|\\[(${labels})(?:[：:]([^\\]]*))?\\]|(${labels})(?=\\s*[:：]|\\s*$))\\s*[:：]?\\s*(.*)$`));
  if (!m) return null;
  const label = m[1] || m[3] || m[5], text = [m[2] || m[4], m[6]].filter(Boolean).join(' ');
  return { field: /答案/.test(label) ? 'answer' : /解析|解答|过程/.test(label) ? 'analysis' : /考点|知识点/.test(label) ? 'tags' : 'notes', text };
}

const answerHeading = line => /^(?:#{1,6}\s+)?(?:\*\*)?(?:参考答案(?:及解析|与解析)?|答案与解析|答案解析|解答与解析|试题答案)(?:\*\*)?\s*[:：]?\s*$/.test(line.trim()) || /^#{1,3}\s+答案\s*[:：]?\s*$/.test(line.trim());
const appendixHeading = line => /^#{1,3}\s+(?:附[：:录]|考点分布)/.test(line.trim());
const cleanField = parts => parts.join('\n').replace(/\n?---\s*$/, '').trim();

// Mark fenced code, display math, and frontmatter before interpreting any question IDs.
// Delimiters are included, so a marker-shaped math/code line cannot become a question.
function protectedSourceLines(lines) {
  let front = lines[0]?.trim() === '---', fence = null, math = null;
  return lines.map((line, i) => {
    const t = line.trim();
    if (front) { if (i > 0 && t === '---') front = false; return true; }
    const fm = t.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length && t.slice(fm[1].length).trim() === '') fence = null;
      return true;
    }
    if (fm) { fence = fm[1]; return true; }
    if (math) {
      if (math === '$$' && (t.match(/\$\$/g) || []).length % 2 || math === '\\[' && /\\\]/.test(t) || math.startsWith('env:') && t.includes(`\\end{${math.slice(4)}}`)) math = null;
      return true;
    }
    if (/^\$\$/.test(t)) { if ((t.match(/\$\$/g) || []).length % 2) math = '$$'; return true; }
    if (/^\\\[/.test(t)) { if (!/\\\]/.test(t)) math = '\\['; return true; }
    const env = t.match(/^\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath)\}/)?.[1];
    if (env) { if (!t.includes(`\\end{${env}}`)) math = `env:${env}`; return true; }
    return false;
  });
}

export function parseExam(raw, fileName = '未命名试卷.md', options = {}) {
  const splitMode = options?.splitMode ?? 'auto';
  if (!['auto', 'numbered'].includes(splitMode)) throw new RangeError('拆题模式必须是 auto 或 numbered。');
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const protectedLines = protectedSourceLines(lines);
  let centralStart = -1, questionDepth = 0, haveQuestion = false;
  for (let i = 0; i < lines.length; i++) {
    if (protectedLines[i]) continue;
    const t = lines[i].trim(), question = boundary(lines[i]);
    if (question) { haveQuestion = true; questionDepth = question.style.startsWith('heading') ? Number(question.style.slice(7)) : 0; }
    const headingDepth = t.match(/^(#{1,6})\s/)?.[1].length || 0;
    const internalField = haveQuestion && headingDepth >= 3 && (!questionDepth || headingDepth > questionDepth);
    if (answerHeading(t) && !internalField) { centralStart = i; break; }
  }
  const sourceLines = centralStart < 0 ? lines : lines.slice(0, centralStart);
  let title = fileName.replace(/\.md$/i, ''), section = '', current = null;
  let field = 'stem', appendix = false, terminal = false;
  const questions = [], warnings = [], splitDiagnostics = [];
  const diagnose = (line, b, action, reason) => splitDiagnostics.push({ line: line + 1, number: b.number, action, reason, field });
  const finish = end => {
    if (!current) return;
    current.raw = lines.slice(current.source.line - 1, end).join('\n').trim();
    for (const k of ['stem', 'answer', 'analysis', 'notes', 'tags']) current[k] = cleanField(current[k]);
    if (current.stem) questions.push(current);
    else warnings.push(`第 ${current.number} 题题干为空，已跳过。`);
    current = null;
  };
  sourceLines.forEach((line, i) => {
    if (terminal) return;
    const t = line.trim();
    if (!protectedLines[i]) {
      if (/^#\s+/.test(t) && !questions.length && !current) title = t.replace(/^#\s+/, '');
      if (appendixHeading(t)) { finish(i); terminal = true; return; }
      if (/^#{1,3}\s+(?:本卷)?考点结构/.test(t)) { finish(i); appendix = true; return; }
      const b = boundary(line);
      // Auto accepts mixed styles and increasing (possibly skipped) plain IDs outside
      // solutions. Explicit numbered mode treats every top-level N. as a boundary,
      // including IDs after solutions; that choice is diagnosed rather than hidden.
      const forcedNumber = splitMode === 'numbered' && b?.numberedDot;
      const deeperSolutionHeading = current && field === 'analysis' && b?.style.startsWith('heading') && current.boundaryStyle.startsWith('heading') && Number(b.style.slice(7)) > Number(current.boundaryStyle.slice(7));
      const strongBoundary = b?.strong && !deeperSolutionHeading;
      const plainBoundary = splitMode === 'auto' && b && !b.strong && (!current || Number(b.number) > Number(current.number) && field !== 'analysis');
      if (b && (strongBoundary || forcedNumber || plainBoundary)) {
        const reason = strongBoundary ? 'marked-question' : forcedNumber ? 'explicit-numbered-line' : 'increasing-plain-number';
        diagnose(i, b, 'split', reason);
        if (forcedNumber && current && field === 'analysis') warnings.push(`第 ${i + 1} 行「${b.number}.」按数字加点模式拆为新题；它位于解析之后，也可能是解析步骤，请核对预览。`);
        if (current && Number(b.number) > Number(current.number) + 1) warnings.push(`第 ${i + 1} 行题号从 ${current.number} 跳到 ${b.number}，保留原题号并拆为新题，请核对是否缺题。`);
        finish(i); appendix = false; field = 'stem';
        const typeText = b.body.replace(/\*\*/g, '').trim();
        const justType = /^(填空题|选择题|单选题|多选题|解答题|证明题)(?:[（(].*[)）])?$/.test(typeText);
        current = { id: uid(), boundaryStyle: b.style, splitReason: reason, number: b.number, type: justType ? /选/.test(typeText) ? '选择题' : /填空/.test(typeText) ? '填空题' : '解答题' : section.includes('选择') ? '选择题' : section.includes('填空') ? '填空题' : '解答题', stem: justType ? [] : [b.body], answer: [], analysis: [], notes: [], tags: [], source: { file: fileName, title, line: i + 1, originalNumber: b.number }, raw: '' };
        return;
      }
      if (b && current) {
        const reason = field === 'analysis' ? 'possible-solution-step' : 'non-increasing-plain-number';
        diagnose(i, b, 'kept', reason);
        if (field === 'analysis') warnings.push(`第 ${i + 1} 行普通编号 ${b.number} 可能是题号或解析步骤，自动模式保留在解析中；可选「数字加点」模式或改用题号标题。`);
        else if (!b.strong) warnings.push(`第 ${i + 1} 行编号 ${b.number} 未递增，保留在当前题中；若它是新题，可选「数字加点」模式。`);
      }
      const mark = current && fieldMarker(line);
      if (mark) { field = mark.field; current[field].push(mark.text); return; }
      if (/^#{1,2}\s+/.test(t) && !b) { finish(i); section = t.replace(/^#{1,2}\s+/, ''); return; }
      if (appendix || !current) return;
      if (/^---+$/.test(t)) return;
      if (/^>\s*(难度|来源|分值)[：:]/.test(t)) { current.notes.push(line); return; }
    }
    if (current && !appendix) current[field].push(line);
  });
  finish(sourceLines.length);
  if (centralStart >= 0) matchCentralAnswers(lines, centralStart, questions, warnings, fileName);
  if (questions.some(q => q.boundaryStyle === 'plain')) warnings.push(splitMode === 'numbered' ? '数字加点模式：顶格数字加半角点或全角点会拆为新题，解析中的同类编号也会拆开；缩进小问、代码、行间公式及卷末答案区除外。' : '本稿使用普通数字题号：自动模式允许混合题号及跳号；解析内的同类编号保留，请核对预览。');
  if (!questions.length) warnings.push('未识别到题目。请使用「## 1. 题干」或「**1.** 题干」标记每道题。');
  const seen = new Set();
  for (const q of questions) {
    if (seen.has(q.number)) warnings.push(`原题号 ${q.number} 重复，请核对题目边界。`);
    seen.add(q.number);
    if (/答案|解析|解答|提示/.test(q.stem)) warnings.push(`第 ${q.number} 题题干含解答相关字样，请检查学生版是否需要删去。`);
    if (q.tags) { q.tagOrigin = 'source'; q.tagsConfirmed = true; }
    else { q.tags = suggestTags(q.stem).join('；'); q.tagOrigin = 'suggested'; q.tagsConfirmed = false; }
  }
  return { id: uid(), title, fileName, raw, splitMode, splitDiagnostics, questions, warnings };
}

function matchCentralAnswers(lines, start, questions, warnings, fileName) {
  const entries = [], byNumber = new Map();
  let entry = null, field = 'answer';
  const protectedLines = protectedSourceLines(lines);
  // Use marked question IDs when available; plain numbered analysis steps then remain content.
  const hasMarkedEntries = lines.slice(start + 1).some((line, offset) => !protectedLines[start + 1 + offset] && boundary(line)?.strong);
  const finish = end => {
    if (!entry) return;
    for (const key of ['answer', 'analysis', 'tags', 'notes']) entry[key] = cleanField(entry[key]);
    entry.raw = lines.slice(entry.line - 1, end).join('\n').trim();
    entries.push(entry); entry = null;
  };
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i], t = line.trim();
    if (!protectedLines[i]) {
      if (appendixHeading(t)) { finish(i); break; }
      const b = boundary(line), explicitField = b && fieldMarker(b.body);
      const candidate = b && (b.strong || !hasMarkedEntries && (field !== 'analysis' || explicitField));
      if (candidate) {
        finish(i); field = explicitField?.field || 'answer';
        entry = { number: b.number, line: i + 1, answer: [], analysis: [], tags: [], notes: [] };
        entry[field].push(explicitField ? explicitField.text : b.body); continue;
      }
      if (b && !hasMarkedEntries && field === 'analysis') warnings.push(`集中答案第 ${i + 1} 行编号 ${b.number} 与解析步骤有歧义，未作为新答案匹配；请用粗体题号或「${b.number}. 答案：」标记。`);
      if (answerHeading(t) || /^#{1,3}\s+(?:一|二|三|四|五|填空题|选择题|解答题)/.test(t)) continue;
      if (!entry) { if (t && !/^---+$/.test(t)) warnings.push(`集中答案第 ${i + 1} 行缺少明确题号，未匹配。`); continue; }
      if (/^---+$/.test(t)) continue;
      const mark = fieldMarker(line);
      if (mark) { field = mark.field; entry[field].push(mark.text); continue; }
    }
    if (entry) entry[field].push(line);
  }
  finish(lines.length);
  for (const e of entries) byNumber.set(e.number, [...(byNumber.get(e.number) || []), e]);
  let matched = 0;
  for (const [number, candidates] of byNumber) {
    const targets = questions.filter(q => q.number === number);
    if (candidates.length !== 1) { warnings.push(`集中答案原题号 ${number} 重复或有歧义，未匹配，请人工核对。`); continue; }
    if (targets.length !== 1) { warnings.push(`集中答案原题号 ${number} ${targets.length ? '对应多个原题' : '没有对应原题'}，未匹配。`); continue; }
    const e = candidates[0], q = targets[0];
    if (!e.answer && !e.analysis) { warnings.push(`集中答案第 ${number} 题没有答案或解析，未匹配。`); continue; }
    const conflicts = ['answer', 'analysis', 'tags', 'notes'].filter(k => q[k] && e[k] && q[k].replace(/\s/g, '') !== e[k].replace(/\s/g, ''));
    if (conflicts.length) { warnings.push(`集中答案第 ${number} 题与题后${conflicts.map(k => ({ answer: '答案', analysis: '解析', tags: '考点', notes: '备注' }[k])).join('、')}冲突，保留题后内容，未覆盖。`); continue; }
    for (const k of ['answer', 'analysis', 'tags', 'notes']) if (!q[k] && e[k]) q[k] = e[k];
    q.answerSource = { file: fileName, line: e.line, raw: e.raw }; matched++;
  }
  warnings.push(`检测到卷末集中答案：已按原题号匹配 ${matched} 题；答案区不会进入题干。`);
  for (const q of questions) if (!q.answer && !q.analysis && !byNumber.has(q.number)) warnings.push(`集中答案未提供第 ${q.number} 题的可匹配答案。`);
}

export function exportMarkdown(state, teacher = false) {
  const withImages = (text, q) => { const replacements = new Map(); for (const ref of questionImageReferences(text)) { const image = resolveAsset(ref, q.source.assetFile || q.source.file, state.assets); if (image) replacements.set(ref, image); } return rewriteImageDestinations(text, replacements); };
  let questionNumber = 0, visualNumber = 0;
  return `# ${state.title || '未命名讲义'}\n\n${state.subtitle || ''}\n\n` + state.blocks.map(q => {
    if (isVisual(q)) return `## 互动探究 ${++visualNumber}：${q.visualization.title}\n\n${q.stem}\n\n> 演示参数：${parameterSummary(q)}\n> 交互内容请使用编辑器或导出的课堂 HTML。本 Markdown 为静态探究任务。\n${teacher && q.notes ? `\n**教学备注：** ${q.notes}\n` : ''}`;
    let text = `## ${++questionNumber}.\n\n${withImages(q.stem, q)}\n`;
    if (teacher) {
      text += `\n> 来源：${q.source.title} · 原第 ${q.source.originalNumber} 题 · ${q.source.file}:${q.source.line}\n`;
      if (q.tags) text += `\n**${q.tagOrigin === 'suggested' ? '建议考点（待确认）' : '考点'}：** ${q.tags}\n`;
      if (q.answer) text += `\n**答案：** ${withImages(q.answer, q)}\n`;
      if (q.analysis) text += `\n**解析：**\n\n${withImages(q.analysis, q)}\n`;
      if (q.notes) text += `\n**教学备注：**\n\n${q.notes}\n`;
      for (const a of additionsFor(state, q)) text += `\n**AI 补充（待核）：${a.title}**\n\n${withImages(a.markdown, q)}\n${a.visualization ? `\n> 交互图：y = a(x-h)^2+k，初始 a=${a.visualization.parameters.a}, h=${a.visualization.parameters.h}, k=${a.visualization.parameters.k}。动态演示请在题目资料页查看。\n` : ''}`;
    }
    return text;
  }).join('\n---\n\n');
}
export function validateProject(value) {
  if (!value || value.version !== VERSION || !Array.isArray(value.blocks) || !Array.isArray(value.exams) || typeof value.assets !== 'object' || !value.assets) throw new Error('不是有效的题序工程文件（版本 1）。');
  const validQ = q => q && ['id', 'number', 'type', 'stem', 'answer', 'analysis', 'notes', 'tags'].every(k => typeof q[k] === 'string') && q.source && ['file', 'title', 'originalNumber'].every(k => typeof q.source[k] === 'string') && Number.isInteger(q.source.line) && (q.tagOrigin === undefined || ['source', 'suggested', 'manual'].includes(q.tagOrigin)) && (q.tagsConfirmed === undefined || typeof q.tagsConfirmed === 'boolean') && (q.kind === undefined || q.kind === 'question' || isVisual(q) && q.visualization && typeof q.visualization.title === 'string' && q.visualization.title.trim().length > 0 && validParameters(q.visualization.scene, q.visualization.parameters));
  if (value.blocks.some(q => !validQ(q) || typeof q.instanceId !== 'string') || value.exams.some(e => !e || typeof e.id !== 'string' || typeof e.title !== 'string' || !Array.isArray(e.questions) || e.questions.some(q => !validQ(q)))) throw new Error('工程文件中的题目数据不完整。');
  if (new Set(value.blocks.map(q => q.instanceId)).size !== value.blocks.length || new Set(value.exams.flatMap(e => e.questions.map(q => q.id))).size !== value.exams.flatMap(e => e.questions).length) throw new Error('工程文件包含重复 ID。');
  const allQuestions = [...value.blocks, ...value.exams.flatMap(e => e.questions)];
  if (allQuestions.some(q => q.protocol !== undefined && (!q.protocol || typeof q.protocol.questionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(q.protocol.questionId) || !Number.isInteger(q.protocol.revision) || q.protocol.revision < 1))) throw new Error('工程文件包含无效的题包身份或版本。');
  const identities = value.exams.flatMap(e => e.questions).filter(q => q.protocol).map(q => `${q.protocol.questionId}@${q.protocol.revision}`);
  if (new Set(identities).size !== identities.length) throw new Error('工程文件包含重复的题目版本。');
  if (typeof value.title !== 'string' || typeof value.subtitle !== 'string' || Object.values(value.assets).some(v => typeof v !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v))) throw new Error('工程文件格式错误或图片格式不受支持。');
  validateStoredAdditions(value.questionAdditions);
  return value;
}
