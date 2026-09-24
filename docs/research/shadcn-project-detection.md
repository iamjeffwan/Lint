# shadcn/ui 项目识别研究

- 研究日期：2026-09-24
- 资料范围：shadcn/ui 官方文档、官方 GitHub 源码和官方 CLI 行为。
- 目标：确定识别项目是否采用 shadcn/ui 的可靠依据。

## 1. 官方 CLI 提供了项目查询命令

官方 CLI 提供 `shadcn info`，并支持 `--json` 输出。该命令的源码会调用项目检测、配置读取和已安装组件读取逻辑，然后返回项目、配置、预设、组件和解析路径等结构化信息。

来源：

- CLI 文档：https://ui.shadcn.com/docs/cli
- 官方 `info` 命令源码：https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/info.ts

官方源码中的 JSON 结果包含：

- 项目框架和框架版本；
- Tailwind 版本、配置文件和 CSS 文件；
- TypeScript、React Server Components 和别名信息；
- `components.json` 配置解析结果；
- 组件目录和已安装组件；
- shadcn 预设信息。

## 2. `components.json` 是官方配置，不只是社区约定

官方 CLI 使用 `cosmiconfig`（配置发现工具）查找项目根目录下的 `components.json`，再通过官方 schema（配置结构校验）解析。初始化流程会询问样式、Tailwind CSS 文件、CSS 变量、别名、TypeScript 和 React Server Components 等信息，并写入该配置文件。

来源：

- `components.json` 文档：https://ui.shadcn.com/docs/components-json
- 官方配置读取源码：https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/utils/get-config.ts
- 官方初始化源码：https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/init.ts

因此，单纯“文件存在”确实不够；但“文件存在 + 官方 schema 校验通过 + 官方 CLI 能解析”是有意义的强证据。

## 3. 官方组件识别逻辑

官方 `info` 命令不是通过 npm 依赖判断 shadcn，而是：

1. 读取并校验 `components.json`；
2. 根据 aliases（路径别名）解析组件目录和 `ui` 目录；
3. 读取解析后的 UI 目录；
4. 将文件名与 shadcn 官方 registry index（组件注册表索引）中的组件名匹配；
5. 输出已安装的官方组件名称。

来源：

- 官方项目检测源码：https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/utils/get-project-info.ts
- 官方配置读取源码：https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/utils/get-config.ts
- 官方 `info` 命令源码：https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/info.ts

这说明 shadcn 项目识别的核心不是 `components/ui` 目录名称，而是官方配置解析、路径别名解析和官方组件名称匹配。

## 4. 对本产品的实现建议

### 首选方案：调用官方 CLI

CLI 在用户项目目录中尝试运行固定版本的：

```bash
npx shadcn@<pinned-version> info --json --cwd <project-root>
```

产品读取 JSON 结果并转换成自己的检测模型。

优点：

- 使用官方识别逻辑；
- 自动处理配置 schema、别名和组件目录；
- 不需要复制 shadcn 内部实现；
- 后续可以随上游版本升级。

缺点：

- `npx` 可能需要网络；
- CLI 版本必须锁定；
- 上游命令输出格式变化需要回归测试；
- 运行时间比直接读取文件更长。

### 备用方案：调用官方源码逻辑的本地适配器

只在官方 CLI 不可用时，读取 `components.json`，使用官方 schema 校验配置，并复刻官方的路径解析和组件名称匹配逻辑。

备用识别结果应标记为“兼容识别”，不能与官方 CLI 的“官方识别”混为一谈。

## 5. 识别结论的分级

产品不要只返回“使用/未使用”，而应返回证据等级：

| 等级 | 条件 | 处理 |
| --- | --- | --- |
| `official`（官方识别） | 固定版本官方 CLI `info --json` 成功，配置和组件均可解析 | 可以选择 shadcn 作为主要组件库 |
| `compatible`（兼容识别） | 配置 schema 有效，能解析路径和组件，但未能运行官方 CLI | 允许用户确认后继续 |
| `partial`（部分识别） | 发现部分 shadcn 组件特征，但缺少官方配置或组件无法匹配 | 只允许选择“仅使用 Tailwind”，提示用户确认 |
| `unknown`（未知） | 没有足够证据 | 不自动选择 shadcn |

用户可以在页面上确认主要组件库，但系统不能因为目录名或某个依赖包就自动宣布项目使用 shadcn。

## 6. MVP 推荐结论

MVP 使用“官方 CLI 优先、只读扫描、固定版本、结果归一化”的方案：

1. 先完成 React、Tailwind v4、ESLint 检查；
2. 再调用固定版本的 shadcn CLI `info --json`；
3. 将其 JSON 结果转换成产品自己的组件库检测模型；
4. 如果官方 CLI 无法运行，明确显示原因，不自动使用目录特征代替；
5. 用户可以确认“仅使用 Tailwind”，但不能把未知项目自动标记为 shadcn。
