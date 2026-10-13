# 开源版本验证

日期：2026-10-13。版本：0.3.1。以下为本次公开源码副本的实际检查，不沿用旧原型的历史统计。

## 环境与结果

本机 macOS、Node.js 26.3.0、npm 11.16.0、Python 3.14.6，浏览器为 Playwright 驱动的 Google Chrome。

| 检查 | 实际结果 |
| --- | --- |
| `npm ci` | 成功，锁文件可安装 |
| `npm test` | 41 项通过 |
| `npm run build` | 成功 |
| `tests/browser_smoke.py` | 25 项通过 |
| `tests/import-print-browser.py` | 26 项通过 |
| `tests/numbered-density-browser.py` | 12 项通过，未启用真实资料分支 |
| `tests/visual-browser.py` | 33 项通过 |
| `tests/visual-state.py` | 5 项通过 |
| `tests/visual-layout.py` | 4 项通过 |
| `tests/print-pagination.py` | 3 项通过，生成 7 页 A4 压力测试 PDF |

合计 41 项模型测试、105 项浏览器检查、3 项分页检查。检查包括真实指针拖拽、独立副本、导入配图与集中答案、数字拆题歧义、移动端、公式渲染、学生教师版隔离、留白、离线交互与工程恢复。记录请求的检查未发现浏览器未捕获错误或离开本机的内容请求。

本次从新目录的 `dist/` 启动独立 5175 服务，保留用户原有 5174 实例。测试运行时仅将源代码中的本机测试地址替换为 5175，测试断言未改动；可复现命令如下（另一个终端先运行 `python3 -m http.server 5175 --bind 127.0.0.1 --directory dist`）：

```bash
python3 - <<'PY'
from pathlib import Path
for name in ['browser_smoke.py', 'import-print-browser.py',
             'print-pagination.py', 'numbered-density-browser.py',
             'visual-browser.py', 'visual-state.py', 'visual-layout.py']:
    file = Path('tests') / name
    source = file.read_text().replace('http://127.0.0.1:5174',
                                      'http://127.0.0.1:5175')
    exec(compile(source, str(file), 'exec'),
         {'__name__': '__main__', '__file__': str(file.resolve())})
PY
```

输出的 PDF、截图、备份和 JSON 验收记录均为本机临时产物，未提交。仓库展示截图使用内置合成题。此次没有运行私有真实试卷测试；不能据此保证任意 Markdown 都可无误拆题或答案数学正确。

独立复核后补齐了交互 HTML 与离线 KaTeX 字体 CSS 的许可证注释，并更新适配文件哈希；重新构建及复跑导入/打印和课堂交互检查后，另行确认学生、教师打印 HTML 与课堂 HTML 均携带 KaTeX 署名和许可正文。第三方许可证原文保留上游换行与空白。

## 已知限制

- `npm audit` 报告 1 项低风险 KaTeX 公告：[GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)，涉及已有原型污染条件下绕过 trust 限制。当前锁定 KaTeX 0.16.47；上游修复需跨版本升级，尚未实施。交互 HTML 的内嵌渲染器也需单独评估，不能仅升级 npm 包即宣称全部更新。
- Vite 提示主 JS 压缩后约 1 MB；构建成功，后续可按功能拆包。
- GitHub CI 仅执行 Node.js 22 模型测试和构建，不执行上述浏览器/PDF 验收。运行结果以仓库 Actions 为准。
- PDF 依赖浏览器打印，自动验收不代替不同系统上的打印窗口人工检查。
