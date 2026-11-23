# 第三方许可

本项目原创部分采用 MIT；下列依赖与嵌入资源按各自许可证使用。用户导入的试卷、配图和其他材料不在本项目代码许可证的授权范围内。

## 直接运行依赖

版本以 `package-lock.json` 为准。随附许可证原文见 `third_party/licenses/`；完整依赖树可用 `npm ls --all` 检查，各依赖的许可证也随 npm 包提供。

| 依赖 | 许可 |
| --- | --- |
| React / React DOM | MIT |
| @dnd-kit/core、sortable、utilities | MIT |
| markdown-it | MIT |
| markdown-it-texmath | MIT |
| KaTeX | MIT |
| DOMPurify | MPL-2.0 OR Apache-2.0 |
| Ajv | MIT |
| YAML | ISC |
| lucide-react | ISC |

构建工具 Vite 使用 MIT 许可证，其传递依赖保留各自许可。DOMPurify 为双重许可，随附包内许可证列明两种选项。

## 嵌入的交互资源

- Anatomy 交互资源：MIT，Copyright (c) 2026 Ryan。许可原文：[Anatomy-LICENSE.txt](public/interactives/Anatomy-LICENSE.txt)。
- 离线 KaTeX 代码与字体：MIT，Copyright (c) 2013–2020 Khan Academy and other contributors。许可原文：[KaTeX-LICENSE.txt](public/interactives/KaTeX-LICENSE.txt)。

交互 HTML 保留原许可声明；适配信息及内容校验值见 [SOURCE.json](public/interactives/SOURCE.json)。上述作品的作者署名不因本项目许可证而改变。
