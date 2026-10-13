import React, { useState } from 'react';
import { ArrowDownToLine, FileCheck2, ArrowRight, BookOpen } from 'lucide-react';
import { workflows, taskMarkdown, latestQuestions } from './workflows';
import { makeQuestionPackage } from './question-package';
import specification from '../docs/题包协议-v0.1.md?raw';

export default function WorkflowPanel({ questions, allQuestions, assets, openImport, download, notify }) {
  const [templateId, setTemplateId] = useState('classification'), [goal, setGoal] = useState(''),
    [level, setLevel] = useState(''), [count, setCount] = useState(6), [scope, setScope] = useState('filtered'),
    [busy, setBusy] = useState(false), [error, setError] = useState('');
  const template = workflows.find(w => w.id === templateId);
  const imported = latestQuestions(allQuestions.filter(q => !q.demo));
  const filtered = latestQuestions(questions);
  const selected = scope === 'filtered' ? filtered : imported;
  async function exportSources() {
    setBusy(true); setError('');
    try {
      const pack = await makeQuestionPackage({ title: '汇编候选题目', questions: selected, assets });
      download('候选题目.题包.json', JSON.stringify(pack, null, 2), 'application/json');
      notify(`已下载 ${selected.length} 道完整候选题；材料包含答案解析，仅在你选择的 AI 中使用。`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function exportTask() {
    setError('');
    try {
      const text = taskMarkdown({ templateId, goal, count, level, sourceCount: selected.length, specification });
      download(`${template.title}-AI任务.md`, text);
      notify('任务说明已下载；将它与候选题目包一起交给任意 AI。');
    } catch (e) { setError(e.message); }
  }
  return <section className="workflow-panel" aria-label="AI 汇编工作台">
    <div className="workflow-intro"><span className="eyebrow">A WORKFLOW, YOUR AI</span><h3>把教学方法变成汇编流程</h3><p>选流程与材料 → 交给你常用的 AI → 回导核对。网站不发送资料到外部服务。</p></div>
    <div className="workflow-cards">{workflows.map(w => <button className={`workflow-card ${templateId === w.id ? 'selected' : ''}`} key={w.id} aria-pressed={templateId === w.id} onClick={() => { setTemplateId(w.id); setError(''); }}><span>{w.number}</span><div><strong>{w.title}</strong><small>{w.label}</small></div><ArrowRight size={15}/></button>)}</div>
    <div className="workflow-form"><p className="workflow-description">{template.description}</p>
      <label>教学目标<textarea aria-label="AI 任务教学目标" rows={3} placeholder="如：为高三学生编一份函数单调性练习，先直接判断，再处理参数与端点。" value={goal} onChange={e => setGoal(e.target.value)}/></label>
      <div className="workflow-fields"><label>学生基础<input aria-label="学生基础" value={level} placeholder="可留空，不推测学情" onChange={e => setLevel(e.target.value)}/></label><label>目标题量<input type="number" aria-label="目标题量" min="1" max="200" value={count} onChange={e => setCount(e.target.value === '' ? '' : Number(e.target.value))}/></label></div>
      <label>候选范围<select aria-label="AI 候选范围" value={scope} onChange={e => setScope(e.target.value)}><option value="filtered">题库当前筛选 · {filtered.length} 道</option><option value="imported">全部已导入题 · {imported.length} 道</option></select></label>
      <p className="workflow-help">回到「试卷题库」可先缩小范围。同题默认导出该范围内最新版本，旧版本保留；材料包含教师字段与配图。</p>
      {error && <p role="alert" className="workflow-error">{error}</p>}
      <div className="workflow-downloads"><button className="button" disabled={!selected.length || busy} onClick={exportSources}><BookOpen size={15}/>1. 下载候选题包</button><button className="button primary" disabled={!goal.trim() || !selected.length || busy} onClick={exportTask}><ArrowDownToLine size={15}/>2. 下载 AI 任务</button></div>
    </div>
    <button className="workflow-import" onClick={openImport}><FileCheck2 size={21}/><div><strong>3. 回导 AI 结果</strong><small>检查题目、配图与建议题序，再确认加入</small></div><ArrowRight size={17}/></button>
    <div className="workflow-review"><strong>教师验收</strong><p>{template.review}</p><small>流程参考：{template.skill}。格式校验不代表数学审校。</small></div>
    <p className="workflow-future">后续：课堂反馈 → 卡点备课 → 复测任务。真实学生证据需要单独的私有工作区，暂不混入公开题库。</p>
  </section>;
}
