import MarkdownIt from 'markdown-it';
import { parseExam, uid, normalizePath, resolveAsset } from './model.js';
const parser = new MarkdownIt({ html: false });
const imageFile = name => /\.(png|jpe?g|webp|gif)$/i.test(name);
export const importFiles = files => [...files].map(file => ({ file, path: file.webkitRelativePath || file.name }));

// Capture entries synchronously: drag data is no longer readable after the event.
export function droppedFiles(transfer) {
  const entries = [...(transfer.items || [])].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Promise.resolve(importFiles(transfer.files || []));
  const result = []; let scanned = 0;
  async function visit(entry, parent = '') {
    if (++scanned > 5000) throw new Error('文件夹项目过多，请选择更小的试卷资料文件夹。');
    const path = parent + entry.name;
    if (entry.isFile) {
      if (/\.md$/i.test(path) || imageFile(path)) result.push({ path, file: await new Promise((yes, no) => entry.file(yes, no)) });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const children = await new Promise((yes, no) => reader.readEntries(yes, no));
        if (!children.length) break;
        for (const child of children) await visit(child, path + '/');
      }
    }
  }
  return (async () => { for (const entry of entries) await visit(entry); return result; })();
}
export function imageReferences(text) {
  const found = [];
  function visit(tokens) { for (const token of tokens) { if (token.type === 'image') found.push(token.attrGet('src')); if (token.children) visit(token.children); } }
  visit(parser.parse(text || '', {}));
  return [...new Set(found)];
}
function localReference(ref) { return !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref); }
function decodePath(ref) { try { return decodeURIComponent(ref); } catch { return ref; } }
export function missingImages(drafts, assets) {
  const missing = [];
  for (const exam of drafts) for (const q of exam.questions) {
    const source = q.source.assetFile || q.source.file;
    for (const url of imageReferences([q.stem, q.answer, q.analysis].join('\n\n'))) {
      if (!resolveAsset(url, source, assets) && !missing.some(m => m.source === source && m.url === url)) missing.push({ source, url, local: localReference(url) });
    }
  }
  return missing;
}
export async function addImageFiles(drafts, assets, files, prefix, options = {}) {
  const images = files.filter(f => imageFile(f.path));
  if (images.reduce((n, f) => n + f.file.size, 0) + Object.values(assets).reduce((n, v) => n + v.length * .75, 0) > 50 * 1024 * 1024) throw new Error('图片与已读取资料超过 50 MB，请分批导入。');
  const next = { ...assets }, fresh = [], paths = new Set();
  for (const image of images) { const key=normalizePath(`${prefix}/${image.path}`);if(paths.has(key))throw new Error(`本批含同名图片 ${image.path}，无法判断引用关系。请拖入保留目录结构的资料文件夹。`);paths.add(key); }
  for (const {file, path} of images) {
    const value = await new Promise((yes, no) => { const r = new FileReader(); r.onload = () => yes(r.result); r.onerror = () => no(new Error(`无法读取图片：${path}`)); r.readAsDataURL(file); });
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) throw new Error(`图片类型不受支持：${path}`);
    const key = normalizePath(`${prefix}/${path}`); next[key] = value; fresh.push({key, value});
  }
  // Multiple loose files lose their original folder names. Alias only unique names
  // in this import batch; ambiguous names remain visibly unresolved.
  if (options.allowAliases) for (const {source, url, local} of missingImages(drafts, next)) {
    if (!local) continue;
    const path = decodePath(url), name = normalizePath(path).split('/').pop();
    const exact = fresh.filter(f => f.key.endsWith('/' + normalizePath(path)));
    const candidates = exact.length ? exact : fresh.filter(f => f.key.split('/').pop() === name);
    if (candidates.length === 1) {
      const base = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
      const alias=normalizePath(base + path); if(alias.startsWith(prefix + '/')) next[alias] = candidates[0].value;
    }
  }
  return next;
}
export async function readImport(files, options = {}) {
  const md = files.filter(f => /\.md$/i.test(f.path)), supported = files.filter(f => /\.md$/i.test(f.path) || imageFile(f.path));
  if (!md.length) throw new Error('没有找到 .md 文件。可拖入 Markdown、MD 与配图，或整个资料文件夹。');
  if (md.length > 200 || supported.reduce((n, f) => n + f.file.size, 0) > 50 * 1024 * 1024) throw new Error('每批最多 200 个 Markdown、合计 50 MB，请分批导入。');
  const prefix = uid(), drafts = [];
  for (const {file,path} of md) {
    const exam = parseExam(await file.text(), path, options);
    for (const q of exam.questions) q.source.assetFile = `${prefix}/${path}`;
    drafts.push(exam);
  }
  return { drafts, prefix, assets: await addImageFiles(drafts, {}, supported, prefix, { allowAliases: supported.every(f=>!f.path.includes('/')) }) };
}
