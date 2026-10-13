// Deliberately conservative, local suggestions. These are labels to confirm, not diagnoses.
const rules = [
  [/椭圆/, '椭圆'], [/双曲线/, '双曲线'], [/抛物线/, '抛物线'],
  [/等差数列/, '等差数列'], [/等比数列/, '等比数列'], [/数列/, '数列'],
  [/二项式|二项展开式/, '二项式定理'], [/复数|虚数单位|虚部|实部/, '复数'],
  [/集合|全集|补集|交集|并集/, '集合'], [/概率|随机变量|分布列|数学期望/, '概率统计'],
  [/三角函数|\\(?:sin|cos|tan)\b/, '三角函数'], [/向量|\\(?:overrightarrow|vec)\b/, '向量'],
  [/导数|切线斜率|瞬时速度/, '导数'], [/对数函数|\\log\b|\\ln\b/, '对数'],
  [/空间|二面角|异面直线|正方体|四面体|棱锥|棱柱/, '立体几何'],
  [/基本不等式/, '基本不等式'], [/函数.*(?:奇偶|奇函数|偶函数)|(?:奇函数|偶函数)/, '函数奇偶性'],
  [/函数.*单调|增函数|减函数/, '函数单调性'],
];
export function suggestTags(stem = '') {
  const found = rules.filter(([pattern]) => pattern.test(stem)).map(([, label]) => label);
  return found.filter(label => label !== '数列' || !found.some(x => /等[差比]数列/.test(x))).slice(0, 3);
}
