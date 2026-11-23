import Ajv from 'ajv';
import schema from '../schemas/question-additions.schema.json' with { type: 'json' };

export { schema as additionSchema };
const validator = new Ajv({ allErrors: true, strict: true, strictRequired: false }).compile(schema);
export const additionKinds = { analysis: 'AI 解析', visualization: '可视化', method: '解题方法', notes: '教学备注' };
export function validateAdditionPayload(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 5 * 1024 * 1024) throw new Error('补充结果超过 5 MB，请分批导入。');
  if (!validator(value)) throw new Error('补充格式错误：' + validator.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; '));
  const ids = new Set();
  for (const a of value.additions) {
    if (ids.has(a.addition_id)) throw new Error('补充内容包含重复 addition_id。');
    ids.add(a.addition_id);
    if (![a.title, a.markdown, a.author].every(s => s.trim())) throw new Error('补充标题、正文和作者不能为空。');
    if (a.visualization) for (const range of [a.visualization.x_range, a.visualization.y_range]) {
      if (range[1] - range[0] < 1 || range[1] - range[0] > 100) throw new Error('坐标范围必须递增，跨度为 1–100。');
    }
  }
  return value;
}
export function validateStoredAdditions(value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 2000) throw new Error('工程中的题目补充列表无效。');
  const ids = new Set();
  for (const a of value) {
    if (!a || typeof a.basis !== 'string' || a.basis.length > 50 * 1024 * 1024 || typeof a.createdAt !== 'string' || !Number.isFinite(Date.parse(a.createdAt)) || !['ai', 'manual'].includes(a.origin)) throw new Error('工程中的题目补充记录无效。');
    const { target, basis, createdAt, origin, ...entry } = a;
    validateAdditionPayload({ format: 'question-studio-additions', schema_version: '0.1', target, additions: [entry] });
    let parsed; try { parsed = JSON.parse(basis); } catch { throw new Error('补充内容的题目快照无效。'); }
    if (!parsed || !Array.isArray(parsed.fields) || parsed.fields.length !== 4 || parsed.fields.some(x => typeof x !== 'string') || !Array.isArray(parsed.images)) throw new Error('补充内容的题目快照无效。');
    if (ids.has(a.addition_id)) throw new Error('工程中包含重复的补充 ID。');
    ids.add(a.addition_id);
  }
}
