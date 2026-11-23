# 单题 ID 与 AI 补充协议 v0.1

## 用户操作

1. 在题库或讲义题块点击 ID 复制。搜索框支持按完整 ID 定位；原题号仅用于展示。
2. 点击「题目资料」进入教师资料页，选择解析、可视化、方法或备注任务，填写要求，复制完整任务或下载 MD。
3. 把任务交给常用 AI。任务包含完整题干、小问、已有答案解析、来源、配图数据、目标 ID/版本/内容哈希及返回 Schema。只有 ID 时，外部 AI 尚不能自动读取本机题库。
4. 在资料页读取或粘贴 AI 返回的 `*.补充.json`，先校验与预览，再确认挂到本题。也可把单个结果 JSON 拖入网页，自动定位并预览。
5. 补充分页签显示，保留原答案解析。可另存手工修订、保留旧稿、移除及撤销；备份工程保留补充。

学生版编辑正文、Markdown 和打印不输出补充；资料页是教师查看工具。教师 Markdown 输出补充文字与静态参数说明，教师打印包含文字、公式和图像的初始静态状态。交互图在网页资料页使用，暂未纳入独立课堂 HTML。题包 v0.1 未改变：题包仍交换原题与建议题序，补充单独交换或通过工程备份携带。

## 身份与匹配

- 标准包题目沿用 `protocol.questionId` 和 `revision`；普通 MD 题沿用首次导入产生的 UUID 与默认版本 1。讲义副本保留原题 ID，`instanceId` 单独标记每次插入。重新导入同一普通 MD 会成为新的导入，不自动判定为同一道题；稳定身份跨工程通过题包或备份保存。
- 返回的 `target` 必须匹配 **ID + revision + content_sha256**。哈希按当前 `questionBasis(q, assets)` 的 UTF-8 JSON 字节计算，包含题型、题干、已有答案解析和引用图片字节。不要让 AI 重新计算或猜测，直接复制任务提供的值。
- 同 ID 同版但已改写的副本依据不同快照：只在内容相同的题目上显示补充，不修改原题。改写后不再适用的补充仍保留在工程，恢复原内容后可以再次匹配。分组备注和考点标签不改变问题快照。
- `addition_id` 在工作区唯一。同 ID 相同补充重复回导复用；内容冲突拒绝，修订须用新补充 ID。回导先准备完整下一状态，再一次应用；应用前重查当前题目，支持撤销。
- 旧工程没有 `questionAdditions` 时仍可读取。新工程恢复和 IndexedDB 打开时检查结构及 `SHA256(basis)` 与 target 是否一致；正确但过期的补充允许保留。工程含旧版、答案与配图，不作为学生资料分享。

## 返回结构

```json
{
  "format": "question-studio-additions",
  "schema_version": "0.1",
  "target": {
    "question_id": "从任务原样复制",
    "question_revision": 1,
    "content_sha256": "从任务原样复制64位SHA256"
  },
  "additions": [
    {
      "addition_id": "a-unique-id",
      "kind": "analysis",
      "title": "配方法求最小值",
      "markdown": "完整答案、推导、边界检查和未解决事项。",
      "author": "实际使用的AI或作者名称"
    }
  ]
}
```

`kind` 可为 `analysis`、`method`、`notes`、`visualization`。所有内容都标为待核，作者字段只表示声明的来源，不能作为审校证明。禁止未知字段或自我认证字段。每次最多 20 份补充，5 MB；每份正文最多 100000 字符，工作区最多 2000 份。图片仅使用题目已有本地图片地址或 raster data URI，不从外部加载新图片。

`visualization` 类型须额外提供：

```json
{
  "kind": "quadratic",
  "parameters": { "a": 1, "h": 1, "k": 2 },
  "x_range": [-5, 7],
  "y_range": [-2, 12]
}
```

将此对象放入单份补充的 `visualization` 字段，表示 $y=a(x-h)^2+k$。参数取 -10 到 10，坐标端点在 -100 到 100，必须递增且跨度为 1–100。网页提供 a/h/k 滑块和重置；滑块用于临时探究，不改 AI 返回的初始配置。a=0 会明确标记为常函数。只有当前这一种模板，不支持任意函数表达式、HTML、脚本或外部演示链接。AI 应先确认图像与题目相关，不适用时给文字方案。

形式与数值范围通过只表明可以安全呈现，不证明题解正确或图像选用恰当。

## 项目接口与样例

- [JSON Schema](../schemas/question-additions.schema.json)
- `questionIdentity` / `questionBasis` / `additionsFor`：身份、内容快照及适用补充。
- `questionTarget` / `buildQuestionTask`：目标信息与完整外部 AI 任务。
- `prepareAdditionImport`：只准备下一状态，不写存储；可传当前题目以限定目标。
- `validateProject` 验证同步结构，`validateAdditionSnapshotHashes` 验证异步快照哈希。调用恢复流程必须两者都通过。
- [合成补充样例](../examples/ai-question-demo.补充.json)：先在标准包入口导入三道演示题，再拖入此文件，可对 `demo-q3` 预览解析与二次函数图。样例不包含外部 AI 运行或数学审校声明。

后续可版本化扩展其他函数、解题步骤与几何模板，接 API/MCP 按 ID 读取和提案。章节分组与题序编辑仍是单独待办，未混入本次身份与补充实现。
