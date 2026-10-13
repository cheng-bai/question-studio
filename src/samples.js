import { parseExam, instanceOf } from './model.js';
const sources = [
  ['函数与方程 · 基础练习.md', String.raw`# 函数与方程 · 基础练习
## 一、填空题
**1.** 已知集合 $A=\{x\mid -1<x<3\}$，$B=\{x\mid x\geq 1\}$，则 $A\cap B=$ ______。
**考点：** 集合运算
**答案：** $[1,3)$
**解析：** 同时满足 $x\geq 1$ 与 $-1<x<3$，故交集为 $[1,3)$。
**2.** 函数 $f(x)=\sqrt{2x-1}+\dfrac{1}{x-2}$ 的定义域为 ______。
**考点：** 函数定义域
**答案：** $[\frac12,2)\cup(2,+\infty)$
**解析：** 由 $2x-1\geq0$ 且 $x\ne2$ 得定义域。
**3.** 已知 $f(x)=x^2-2ax+1$，若 $f(x)$ 在 $[2,+\infty)$ 上严格递增，则实数 $a$ 的取值范围为 ______。
**考点：** 二次函数单调性
**答案：** $(-\infty,2]$
**解析：** 抛物线开口向上，对称轴为 $x=a$。当且仅当 $a\leq2$ 时，给定区间位于递增区间内。
## 二、解答题
**4.** 已知函数 $f(x)=x+\dfrac{4}{x}$，$x>0$。

（1）求 $f(x)$ 的最小值；

（2）解不等式 $f(x)\leq5$。
**考点：** 基本不等式；分式不等式
**答案：** （1）$4$；（2）$x\in[1,4]$。
**解析：** （1）$x+\frac4x\geq2\sqrt{4}=4$，等号当且仅当 $x=2$ 时成立。

（2）由 $x>0$，两边乘 $x$，得 $x^2-5x+4\leq0$，所以 $1\leq x\leq4$。`],
  ['数列与三角 · 巩固练习.md', String.raw`# 数列与三角 · 巩固练习
## 一、填空题
**1.** 等差数列 $\{a_n\}$ 中，$a_1=2$，$a_5=14$，则 $a_{10}=$ ______。
**考点：** 等差数列通项
**答案：** $29$
**解析：** 公差 $d=(14-2)/4=3$，所以 $a_{10}=2+9\times3=29$。
**2.** 若 $\sin\alpha=\dfrac35$，且 $\alpha\in(\dfrac\pi2,\pi)$，则 $\cos2\alpha=$ ______。
**考点：** 二倍角公式
**答案：** $\dfrac7{25}$
**解析：** $\cos2\alpha=1-2\sin^2\alpha=1-\frac{18}{25}=\frac7{25}$。
## 二、解答题
**3.** 已知等比数列 $\{a_n\}$ 的首项为 $1$，公比为 $2$。

（1）求通项公式 $a_n$；

（2）求前 $n$ 项和 $S_n$，并求使 $S_n>100$ 的最小正整数 $n$。
**考点：** 等比数列求和
**答案：** $a_n=2^{n-1}$，$S_n=2^n-1$；$n=7$。
**解析：** 由等比数列公式得 $S_n=\frac{1-2^n}{1-2}=2^n-1$。因为 $S_6=63$、$S_7=127$ 且 $S_n$ 随 $n$ 增大，所以最小正整数为 $7$。`],
  ['平面向量 · 方法练习.md', String.raw`# 平面向量 · 方法练习
## 一、填空题
**1.** 已知向量 $\vec a=(1,2)$，$\vec b=(3,-1)$，则 $\vec a\cdot\vec b=$ ______。
**考点：** 向量数量积
**答案：** $1$
**解析：** $\vec a\cdot\vec b=1\times3+2\times(-1)=1$。
**2.** 已知 $|\vec a|=2$，$|\vec b|=3$，且两向量的夹角为 $60^\circ$，则 $|\vec a+\vec b|=$ ______。
**考点：** 向量模的计算
**答案：** $\sqrt{19}$
**解析：** $|\vec a+\vec b|^2=4+9+2\times2\times3\times\frac12=19$。
## 二、解答题
**3.** 已知 $A(0,0)$，$B(4,0)$，$C(1,3)$，点 $D$ 为线段 $BC$ 的中点。

（1）求 $\overrightarrow{AD}$ 的坐标；

（2）求 $\overrightarrow{AB}\cdot\overrightarrow{AC}$。
**考点：** 中点坐标；数量积
**答案：** （1）$(\frac52,\frac32)$；（2）$4$。
**解析：** 中点 $D(\frac{4+1}{2},\frac{0+3}{2})$，所以 $\overrightarrow{AD}=(\frac52,\frac32)$。又 $\overrightarrow{AB}=(4,0)$，$\overrightarrow{AC}=(1,3)$，数量积为 $4$。`],
];
export function initialState() {
  const exams = sources.map(([name, raw]) => ({ ...parseExam(raw, name), demo: true }));
  return { version: 1, title: '函数专题 · 从基础到综合', subtitle: '高三数学 / 专题练习', exams, blocks: [instanceOf(exams[0].questions[1]), instanceOf(exams[0].questions[3])], assets: {} };
}
