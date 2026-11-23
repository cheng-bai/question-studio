import Ajv from 'ajv';
import { parseDocument, stringify as yamlStringify, visit } from 'yaml';
import MarkdownIt from 'markdown-it';
import imageRule from 'markdown-it/lib/rules_inline/image.mjs';
import backtickRule from 'markdown-it/lib/rules_inline/backticks.mjs';
import { normalizeReference } from 'markdown-it/lib/common/utils.mjs';
import schema from '../schemas/question-package.schema.json' with { type: 'json' };
import { resolveAsset, uid } from './model.js';
import { imageReferences } from './import-files.js';

export { schema as questionPackageSchema };
const validateSchema = new Ajv({ allErrors: true, strict: true }).compile(schema);
const LIMIT = 50 * 1024 * 1024;
const encoder = new TextEncoder();
const types = ['填空题', '选择题', '解答题'];
const origins = ['suggested', 'source', 'manual'];
const sections = { 题干: 'stem', 答案: 'answer', 解析: 'analysis', 教学备注: 'notes' };
const own = (o, key) => Object.hasOwn(o, key);
function fail(location, message) { throw new Error(`${location}: ${message}`); }
export async function sha256(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function safePath(path, location) {
  let decoded; try { decoded = decodeURIComponent(path); } catch { fail(location, '路径包含无效编码'); }
  if (!path || path.includes('\\') || decoded.includes('\\') || /^[\/]|^[a-z][a-z\d+.-]*:/i.test(decoded) || /[\u0000-\u001f\u007f?#]/.test(decoded) || decoded.split('/').some(p => !p || p === '.' || p === '..')) fail(location, '仅允许无遍历、无协议的相对路径');
  return decoded;
}
function string(value, location, { empty = false, max = 2000000 } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(location, '需要有效字符串');
  return value;
}
function keys(object, allowed, location) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) fail(location, '需要对象');
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${location}.${key}`, '未知字段');
}
function imageData(value, location) {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) || value.endsWith(',')) fail(location, '需要 PNG/JPEG/WebP/GIF 的 base64 图片');
}

const environment = '(equation\\*?|align\\*?|gather\\*?|multline\\*?|displaymath)';
const environmentStart = new RegExp('^\\\\begin\\{' + environment + '\\}');
const environmentEnd = new RegExp('^\\\\end\\{' + environment + '\\}');
function protectedQuestionLines(lines, file = 'Markdown', offset = 1) {
  let fence = null, math = null;
  const flags = lines.map((line, index) => {
    const t = line.trim(), fm = t.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length && !t.slice(fm[1].length).trim()) fence = null;
      return true;
    }
    if (!math && fm) { fence = fm[1]; return true; }
    const start = environmentStart.exec(t), end = environmentEnd.exec(t);
    if (math) {
      const close = math === '$$' ? t.includes('$$') : math === '\\[' ? t.includes('\\]') : t.includes(`\\end{${math}}`);
      if (close) math = null;
      else if (t.startsWith('$$') || t.startsWith('\\[') || t.startsWith('\\]') || start || end) fail(`${file}:${offset + index}`, '块公式分隔符不匹配');
      return true;
    }
    if (t.startsWith('\\]') || end) fail(`${file}:${offset + index}`, '块公式结束分隔符没有对应开头');
    if (t.startsWith('$$')) { if ((t.match(/\$\$/g) || []).length % 2) math = '$$'; return true; }
    if (t.startsWith('\\[')) { if (!t.includes('\\]')) math = '\\['; return true; }
    if (start) { if (!t.includes(`\\end{${start[1]}}`)) math = start[1]; return true; }
    return false;
  });
  if (fence || math) fail(file, '代码围栏或块公式未闭合');
  return flags;
}

function parseQuestion(markdown, file, entry) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') fail(file, '必须以 YAML frontmatter 开头');
  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  if (end < 0) fail(file, 'frontmatter 缺少结束分隔线');
  const doc = parseDocument(lines.slice(1, end).join('\n'), { uniqueKeys: true, maxAliasCount: 0, version: '1.2' });
  if (doc.errors.length) fail(`${file}:frontmatter`, doc.errors[0].message);
  visit(doc, { Alias() { fail(`${file}:frontmatter`, '不允许 YAML alias'); } });
  const meta = doc.toJS({ maxAliasCount: 0 });
  keys(meta, ['schema_version', 'question_id', 'revision', 'type', 'tags', 'tag_origin', 'source'], `${file}:frontmatter`);
  if (meta.schema_version !== '0.1' || meta.question_id !== entry.question_id || meta.revision !== entry.revision) fail(file, 'frontmatter 版本或题目身份与清单不一致');
  if (!types.includes(meta.type)) fail(file, 'type 必须为填空题、选择题或解答题');
  if (!Array.isArray(meta.tags) || meta.tags.length > 100 || meta.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 300)) fail(file, 'tags 必须为考点字符串数组');
  if (!origins.includes(meta.tag_origin)) fail(file, 'tag_origin 必须为 suggested/source/manual');
  keys(meta.source, ['title', 'file', 'original_number', 'line'], `${file}:source`);
  for (const field of ['title', 'file', 'original_number']) string(meta.source[field], `${file}:source.${field}`, { max: 1000 });
  if (!Number.isSafeInteger(meta.source.line) || meta.source.line < 1) fail(file, 'source.line 必须为正整数');
  const fields = { stem: '', answer: '', analysis: '', notes: '' }, seen = new Set();
  const protectedLines = protectedQuestionLines(lines.slice(end + 1), file, end + 2);
  let current = null;
  for (let i = end + 1; i < lines.length; i++) {
    const line = lines[i], protectedLine = protectedLines[i - end - 1];
    if (!protectedLine && /^ {0,3}#(?:[ \t]|$)/.test(line)) fail(`${file}:${i + 1}`, '不允许顶层标题，请使用字段标题');
    const heading = !protectedLine && line.match(/^ {0,3}##[ \t]+(.+?)\s*#*\s*$/);
    if (heading) {
      if (!own(sections, heading[1])) fail(`${file}:${i + 1}`, `未知字段标题「${heading[1]}」`);
      current = sections[heading[1]];
      if (seen.has(current)) fail(`${file}:${i + 1}`, '字段标题重复');
      seen.add(current); continue;
    }
    if (!current && line.trim()) fail(`${file}:${i + 1}`, '字段标题外存在内容，避免导入时丢失');
    if (current) fields[current] += line + '\n';
  }
  for (const field of Object.keys(fields)) fields[field] = fields[field].trim();
  if (!fields.stem) fail(file, '缺少非空 ## 题干');
  return { questionId: entry.question_id, revision: entry.revision, file, type: meta.type, ...fields, tags: [...meta.tags], tagOrigin: meta.tag_origin, source: { title: meta.source.title, file: meta.source.file, originalNumber: meta.source.original_number, line: meta.source.line } };
}

export async function validateQuestionPackage(value) {
  if (!validateSchema(value)) fail('题包', validateSchema.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; '));
  let total = 0; const normalized = new Set(), assets = Object.create(null), assetPaths = new Map(), used = new Set(), ids = new Set(), questions = [];
  const declared = new Set(value.questions.map(q => q.file));
  for (const [path, content] of Object.entries(value.files)) {
    const decoded = safePath(path, `files.${path}`);
    if (normalized.has(decoded)) fail(path, '归一化路径重复');
    normalized.add(decoded);
    total += encoder.encode(content).length;
    if (total > LIMIT) fail('files', '题包超过 50 MB');
    if (declared.has(path)) continue;
    if (!/^assets\/.+\.(png|jpe?g|webp|gif)$/i.test(path)) fail(path, '未引用的 Markdown 或不支持的资源文件');
    imageData(content, path); assets[decoded] = content; assetPaths.set(decoded, decoded);
  }
  for (const entry of value.questions) {
    if (ids.has(entry.question_id)) fail(entry.file, '同一题包不允许重复 question_id');
    ids.add(entry.question_id);
    if (entry.file !== `questions/${entry.question_id}.md`) fail(entry.file, '单题文件名必须对应 question_id');
    if (!own(value.files, entry.file)) fail(entry.file, '清单引用的单题文件缺失');
    if (await sha256(value.files[entry.file]) !== entry.sha256) fail(entry.file, 'SHA-256 不匹配，文件已改变');
    const question = parseQuestion(value.files[entry.file], entry.file, entry);
    for (const ref of questionImageReferences([question.stem, question.answer, question.analysis, question.notes].join('\n\n'))) {
      const decoded = safePath(ref, `${entry.file}:图片 ${ref}`);
      // v0.1 uses package-root paths such as assets/hash.png (never ../).
      const direct = assetPaths.get(decoded);
      if (!direct) fail(entry.file, `引用图片缺失：${ref}`);
      used.add(direct);
    }
    questions.push(question);
  }
  for (const path of Object.keys(assets)) if (!used.has(path)) fail(path, '存在未被题目引用的资源');
  let handout = null;
  if (value.handout) {
    handout = { title: value.handout.title, subtitle: value.handout.subtitle, items: value.handout.items.map((item, index) => {
      const question = questions.find(q => q.questionId === item.question_id && q.revision === item.question_revision);
      if (!question) fail(`handout.items[${index}]`, '题目或锁定版本不存在');
      return { questionId: item.question_id, revision: item.question_revision, role: item.role || '', reason: item.reason || '' };
    }) };
  }
  const warnings = questions.filter(q => q.tagOrigin === 'suggested' && q.tags.length).map(q => `${q.questionId}：考点为 AI/规则建议，尚待教师确认`);
  return { packageId: value.package_id, title: value.title, questions, assets: { ...assets }, handout, warnings };
}

// Capture image syntax with markdown-it's own rule, retaining source positions.
// Code blocks, inline code and math are excluded before modifying destinations.
function imageUsages(text) {
  const parser = new MarkdownIt({ html: false });
  const lines = text.split('\n'), flags = protectedQuestionLines(lines);
  let masked = lines.map((line, index) => flags[index] ? line.replace(/[^\n]/g, ' ') : line).join('\n');
  const blockTokens = parser.parse(masked, {});
  for (const token of blockTokens) if (['fence', 'code_block'].includes(token.type) && token.map) {
    for (let i = token.map[0]; i < token.map[1]; i++) flags[i] = true;
  }
  masked = lines.map((line, index) => flags[index] ? line.replace(/[^\n]/g, ' ') : line).join('\n');
  const codeRanges = [], beforeCode = masked;
  parser.inline.ruler.at('backticks', (state, silent) => {
    const start = state.pos, accepted = backtickRule(state, silent);
    if (accepted && !silent && state.src === beforeCode && state.tokens.at(-1)?.type === 'code_inline') codeRanges.push([start, state.pos]);
    return accepted;
  });
  parser.inline.parse(beforeCode, parser, {}, []);
  for (const [from, to] of codeRanges.reverse()) masked = masked.slice(0, from) + masked.slice(from, to).replace(/[^\n]/g, ' ') + masked.slice(to);
  // Preserve length so captured offsets still index the original Markdown.
  masked = masked.replace(/\\\([^\n]*?\\\)|(?<![\\$])\$(?!\$)(?:\\.|[^$\n])*?(?<!\\)\$(?!\$)/g, all => all.replace(/[^\n]/g, ' '));
  const env = {}, usages = [];
  parser.parse(masked, env);
  parser.inline.ruler.at('image', (state, silent) => {
    const start = state.pos;
    const accepted = imageRule(state, silent);
    if (accepted && !silent && state.src === masked) usages.push({ start, end: state.pos, ref: state.tokens.at(-1).attrGet('src') });
    return accepted;
  });
  parser.inline.parse(masked, parser, env, []);
  return { usages, masked, references: env.references || {} };
}
export function questionImageReferences(text) {
  return [...new Set(imageUsages(text || '').usages.map(item => item.ref))];
}
export function rewriteImageDestinations(text, replacements) {
  const { usages, masked } = imageUsages(text || ''), edits = [], imageLabels = new Set();
  const replacementFor = raw => replacements.get(raw) || replacements.get(imageReferences(`![x](<${raw}>)`)[0]);
  for (const usage of usages) {
    let labelEnd = usage.start + 2, depth = 1;
    for (; labelEnd < usage.end; labelEnd++) {
      if (text[labelEnd] === '\\') { labelEnd++; continue; }
      if (text[labelEnd] === '[') depth++;
      if (text[labelEnd] === ']' && !--depth) break;
    }
    const tail = text.slice(labelEnd + 1, usage.end);
    if (tail.startsWith('(')) {
      let from = labelEnd + 2;
      while (/\s/.test(text[from])) from++;
      let to = from, parens = 0;
      if (text[from] === '<') to = text.indexOf('>', from + 1) + 1;
      else for (; to < usage.end; to++) {
        const char = text[to];
        if (char === '\\') { to++; continue; }
        if (char === '(') parens++;
        else if (char === ')') { if (!parens) break; parens--; }
        else if (/\s/.test(char) && !parens) break;
      }
      const replacement = replacements.get(usage.ref);
      if (replacement) edits.push([from, to, replacement]);
    } else {
      const explicit = tail.match(/^\[([^\]]*)\]$/)?.[1];
      imageLabels.add(normalizeReference(explicit || text.slice(usage.start + 2, labelEnd)));
    }
  }
  // A shared reference definition is rewritten only when an actual image uses it.
  const definition = /(^ {0,3}\[([^\]\n]+)\]:[ \t]*)(<[^>\n]+>|\S+)/gm;
  let match;
  while ((match = definition.exec(masked))) {
    if (!imageLabels.has(normalizeReference(match[2]))) continue;
    const dest = match[3], raw = dest.startsWith('<') ? dest.slice(1, -1) : dest;
    const replacement = replacementFor(raw);
    if (replacement) edits.push([match.index + match[1].length, match.index + match[0].length, replacement]);
  }
  let result = text;
  for (const [from, to, replacement] of edits.sort((a, b) => b[0] - a[0])) result = result.slice(0, from) + replacement + result.slice(to);
  return result;
}

export async function makeQuestionPackage({ title, questions, assets = {}, handout }) {
  const value = { format: 'question-studio-package', schema_version: '0.1', package_id: uid(), title: title || '未命名题包', questions: [], files: {} };
  if (!Array.isArray(questions) || !questions.length || questions.length > 200) fail('questions', '需要 1–200 道题目');
  const identities = new Set();
  for (const q of questions) {
    const questionId = q.protocol?.questionId ?? q.id;
    if (identities.has(questionId)) fail(String(questionId), '重复 question_id，导出前需选定唯一版本');
    identities.add(questionId);
  }
  for (const q of questions) {
    const questionId = q.protocol?.questionId ?? q.id, revision = q.protocol?.revision ?? 1;
    const fields = Object.fromEntries(['stem', 'answer', 'analysis', 'notes'].map(field => [field, q[field] || '']));
    const replacements = new Map();
    for (const ref of questionImageReferences(Object.values(fields).join('\n\n'))) {
      const data = resolveAsset(ref, q.source.assetFile || q.source.file, assets);
      if (!data) fail(questionId, `导出图片缺失或网络资源不可打包：${ref}`);
      imageData(data, `${questionId}:图片`);
      const extension = data.match(/^data:image\/(\w+)/)[1].replace('jpeg', 'jpg');
      const path = `assets/${await sha256(data)}.${extension}`;
      value.files[path] = data; replacements.set(ref, path);
    }
    for (const field of Object.keys(fields)) fields[field] = rewriteImageDestinations(fields[field], replacements);
    const tags = Array.isArray(q.tags) ? q.tags : (q.tags || '').split(/[、,，;；]/).map(s => s.trim()).filter(Boolean);
    const meta = { schema_version: '0.1', question_id: questionId, revision, type: q.type, tags, tag_origin: q.protocol?.tagOrigin || q.tagOrigin || 'suggested', source: { title: q.source.title, file: q.source.file, original_number: String(q.source.originalNumber), line: q.source.line } };
    const markdown = `---\n${yamlStringify(meta).trimEnd()}\n---\n\n` + Object.entries(sections).filter(([, field]) => fields[field]).map(([heading, field]) => `## ${heading}\n\n${fields[field]}\n`).join('\n');
    const file = `questions/${questionId}.md`; value.files[file] = markdown;
    value.questions.push({ question_id: questionId, revision, file, sha256: await sha256(markdown) });
  }
  if (handout) value.handout = handout;
  await validateQuestionPackage(value);
  return value;
}
