import MarkdownIt from 'markdown-it';

export function questionIdentity(q) {
  return { questionId: q.protocol?.questionId || q.questionId || q.id, revision: q.protocol?.revision || 1 };
}
export function normalizePath(path) {
  const parts = [];
  for (const p of path.replace(/\\/g, '/').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop(); else parts.push(p);
  }
  return parts.join('/');
}
export function resolveAsset(url, sourceFile, assets) {
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return url;
  if (/^[a-z]+:|^\/\//i.test(url)) return null;
  let decoded; try { decoded = decodeURIComponent(url); } catch { decoded = url; }
  const base = sourceFile.includes('/') ? sourceFile.slice(0, sourceFile.lastIndexOf('/') + 1) : '';
  return assets[normalizePath(base + decoded)] || assets[normalizePath(decoded)] || null;
}
const parser = new MarkdownIt({ html: false });
// Bind to the actual problem and existing solution, including image bytes. Teacher
// grouping notes and tags do not invalidate an otherwise identical problem.
export function questionBasis(q, assets = {}) {
  const fields = [q.type, q.stem, q.answer, q.analysis], refs = new Set();
  const walk = tokens => { for (const t of tokens) { if (t.type === 'image') refs.add(t.attrGet('src')); if (t.children) walk(t.children); } };
  fields.slice(1).forEach(text => walk(parser.parse(text || '', {})));
  const images = [...refs].sort().map(ref => [ref, resolveAsset(ref, q.source.assetFile || q.source.file, assets)]);
  return JSON.stringify({ fields, images });
}
export function additionsFor(state, q) {
  const id = questionIdentity(q), basis = questionBasis(q, state.assets);
  return (state.questionAdditions || []).filter(a => a.target.question_id === id.questionId && a.target.question_revision === id.revision && a.basis === basis);
}
