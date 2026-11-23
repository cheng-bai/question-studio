import { uid, instanceOf, resolveAsset } from './model.js';
import { questionImageReferences, rewriteImageDestinations } from './question-package.js';

const keyOf = q => `${q.questionId}@${q.revision}`;
function comparable(q, assets) {
  const fields = ['stem', 'answer', 'analysis', 'notes'].map(field => {
    const text = q[field] || '', replacements = new Map();
    for (const ref of questionImageReferences(text)) {
      const image = resolveAsset(ref, q.source.assetFile || q.source.file, assets);
      if (image) replacements.set(ref, image);
    }
    return rewriteImageDestinations(text, replacements);
  });
  const tags = (q.tags || '').split(/[、,，;；]/).map(t => t.trim()).filter(Boolean);
  return JSON.stringify([q.type, ...fields, tags, q.source.title, q.source.file, q.source.originalNumber, q.source.line]);
}

// Prepare the complete next workspace before updating React/IndexedDB. Originals
// and prior revisions are never overwritten by an imported proposal.
export function preparePackageImport(state, validated, { compose = false } = {}) {
  const prefix = uid(), assets = { ...state.assets };
  for (const [path, image] of Object.entries(validated.assets)) assets[`${prefix}/${path}`] = image;
  const existing = new Map(state.exams.flatMap(e => e.questions)
    .map(q => [keyOf(q.protocol || {questionId: q.id, revision: 1}), q]));
  const resolved = new Map(), fresh = [], reused = [];
  for (const item of validated.questions) {
    const question = {
      id: uid(), number: item.source.originalNumber, type: item.type,
      stem: item.stem, answer: item.answer, analysis: item.analysis, notes: item.notes,
      tags: item.tags.join('；'), tagOrigin: 'suggested', tagsConfirmed: false,
      source: { ...item.source, assetFile: `${prefix}/package.md` },
      protocol: { questionId: item.questionId, revision: item.revision },
    };
    const key = keyOf(item), prior = existing.get(key);
    if (prior) {
      if (comparable(prior, state.assets) !== comparable(question, assets)) {
        throw new Error(`${item.questionId} 第 ${item.revision} 版与题库已有内容冲突。请保留原版本，为修改后的题目增加 revision。`);
      }
      resolved.set(key, prior); reused.push(prior);
    } else { resolved.set(key, question); fresh.push(question); }
  }
  const blocks = compose && validated.handout ? validated.handout.items.map(item => {
    const source = resolved.get(keyOf(item));
    if (!source) throw new Error(`编排引用不存在：${keyOf(item)}`);
    const block = instanceOf(source);
    const rationale = [item.role && `训练角色：${item.role}`, item.reason && `选题依据：${item.reason}`].filter(Boolean).join('\n\n');
    if (rationale) block.notes = [block.notes, rationale].filter(Boolean).join('\n\n');
    return block;
  }) : [];
  const exam = fresh.length ? { id: uid(), title: validated.title, packageId: validated.packageId, questions: fresh } : null;
  // Re-imports without new questions must not accumulate unreachable image copies.
  const committedAssets = fresh.length ? assets : state.assets;
  return {
    state: {
      ...state, exams: exam ? [...state.exams, exam] : state.exams, assets: committedAssets,
      ...(compose && validated.handout && !state.blocks.length ? { title: validated.handout.title, subtitle: validated.handout.subtitle } : {}),
      blocks: [...state.blocks, ...blocks],
    },
    added: fresh.length, reused: reused.length, appended: blocks.length,
    examId: exam?.id || null,
  };
}
