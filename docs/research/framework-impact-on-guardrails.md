# 前端框架对设计体系护栏的影响

- 核对日期：2026-09-28。
- 结论范围：Tailwind CSS 主题、ESLint 与 `@shadcn/lint` 规则、组件库样式；不讨论组件级 contracts。
- 资料：官方文档和官方仓库。

## 结论

React、Vue 和 Svelte 对三部分的影响不同：

1. Tailwind 主题和 CSS 变量本身与前端框架基本无关；真正影响接入的是构建工具、CSS 入口和样式导入链。
2. ESLint 规则执行与框架有关，因为 JSX、Vue 模板和 Svelte 标记需要不同解析器。`@shadcn/lint` 官方提供相应配置；使用 ESLint 时可以检查 Vue/Svelte 模板，Oxlint 的 JavaScript 插件目前只能读取它们的脚本块。
3. 基础 Token 和语义 CSS 变量可以跨框架复用。组件库适配才可能依赖框架，因为组件源码、导入方式和主题输出可能不同；当前 MVP 已移除组件级约束，因此不需要为此建立框架规则。

## 对工单五的决定

不把 React 作为独立的基础接入门槛。工单五应该检测“能力”而不是先判断框架名称：

- 是否能找到 Tailwind 入口并确认框架导入和主题来源；
- 是否能用项目自己的 ESLint 加载覆盖目标文件类型的配置；
- 是否能让 `@shadcn/lint` 的规则覆盖这些文件；
- 文件类型无法解析时，标记“无法确认”并说明需要的 parser（解析器），而不是把所有非 React 项目直接判为不支持。

React 可以作为当前测试样例和产品说明中的首个支持框架。只有当后续选择了需要框架特定组件适配的组件库，或需要保证特定模板的 Lint 覆盖时，才增加框架适配器。

## 官方事实

### Tailwind

Tailwind v4 的 `@theme` 变量生成工具类，CSS 入口通过 Tailwind 导入接入。这个机制发生在 CSS 和构建阶段，不依赖 React 或 Vue 组件运行时。官方的 Vite、PostCSS 安装方式分别要求对应构建接入；依赖安装本身不能证明样式入口已经生效。

来源：[Tailwind Theme variables](https://tailwindcss.com/docs/theme)、[Tailwind 官方文档源码](https://github.com/tailwindlabs/tailwindcss.com/tree/main/src/docs/installation)（访问日期：2026-09-28）。

### ESLint 与 `@shadcn/lint`

官方 `@shadcn/lint` 文档分别给出 React、Vue 和 Svelte 的 ESLint 配置，Vue 使用 `vue-eslint-parser`，Svelte 使用 `svelte-eslint-parser`，并要求 TypeScript 解析器处理脚本。它还明确说明：Oxlint 对 Vue/Svelte 只读取 `<script>`，不读取模板；需要模板检查时使用 ESLint。

来源：[官方仓库 README](https://github.com/shadcn-ui/lint/blob/main/README.md)、[Vue 配置](https://github.com/shadcn-ui/lint/blob/main/docs/vue.md)、[Svelte 配置](https://github.com/shadcn-ui/lint/blob/main/docs/svelte.md)、[工作原理](https://github.com/shadcn-ui/lint/blob/main/docs/how-it-works.md)（访问日期：2026-09-28）。

### 组件库样式

`@shadcn/lint` 的主题读取的是 Tailwind 主题 CSS，并能在没有 `components.json` 时通过样式入口和 `componentImports`（组件导入匹配配置）工作。组件文件和模板解析则按 React、Vue、Svelte 使用不同语法入口。基础 Token 规则可以检查各类文件；组件级样式规则的覆盖范围才依赖框架解析器和组件库适配。

来源：[工作原理](https://github.com/shadcn-ui/lint/blob/main/docs/how-it-works.md)、[Vue](https://github.com/shadcn-ui/lint/blob/main/docs/vue.md)、[Svelte](https://github.com/shadcn-ui/lint/blob/main/docs/svelte.md)（访问日期：2026-09-28）。

## 实现含义

工单五不应投入大量成本识别 React/Vue/Svelte 名称。应输出三类能力事实：

```text
Tailwind 主题是否能定位和静态追踪
ESLint 是否能加载，且目标文件是否使用合适解析器
目标文件是否能被规则读取
```

工单六使用官方 shadcn CLI 查询组件方案；工单七根据能力事实和用户选定组件库生成支持性结论。以后加入 Vue/Svelte 时，主要增加 ESLint 配置与文件入口适配，不需要重写 Tailwind Token 模型。
