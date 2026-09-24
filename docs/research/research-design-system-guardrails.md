# 设计体系护栏实现研究

- 研究日期：2026-09-24
- 资料范围：仅使用官方文档、官方仓库、规范维护组织页面和 npm 官方 registry。
- 说明：`事实`（上游明确写出的能力）与 `实现含义`（针对本产品的工程判断）分开记录。

## 1. 版本快照

以下版本来自 npm 官方 registry 的 `latest` 标签，查询日期为 2026-09-24：

| 包 | latest |
|---|---:|
| `tailwindcss` | 4.3.3 |
| `@shadcn/lint` | 0.2.0 |
| `eslint` | 10.11.0 |
| `oxlint` | 1.85.0 |
| `style-dictionary` | 5.5.5 |

来源：<https://registry.npmjs.org/tailwindcss>、<https://registry.npmjs.org/@shadcn%2Flint>、<https://registry.npmjs.org/eslint>、<https://registry.npmjs.org/oxlint>、<https://registry.npmjs.org/style-dictionary>（访问日期：2026-09-24）。版本会继续变化，产品应在适配层锁定兼容范围并用样例项目回归。

## 2. `Tailwind CSS v4`（实用类优先样式框架）主题机制

### 官方事实

1. `@theme`（主题指令）声明的 CSS 变量会影响可用的工具类；例如 `--color-mint-500` 会产生 `bg-mint-500`、`text-mint-500` 等类。普通 `:root` 变量不会自动产生工具类。来源：<https://tailwindcss.com/docs/theme>；官方源码文档：<https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/theme.mdx>（访问日期：2026-09-24）。
2. 主题变量按命名空间映射到工具类或变体。官方列出的命名空间包括 `--color-*`（颜色）、`--font-*`（字体族）、`--text-*`（字号）、`--font-weight-*`（字重）、`--tracking-*`（字距）、`--leading-*`（行高）、`--breakpoint-*`（响应式变体）、`--container-*`（容器查询和最大宽度）、`--spacing-*`（间距和尺寸）、`--radius-*`（圆角）、`--shadow-*`（阴影）、`--blur-*`（模糊）、`--aspect-*`（比例）、`--ease-*`（过渡曲线）、`--animate-*`（动画）等。来源同上。
3. `@theme` 默认只生成最终 CSS 中被使用到的 CSS 变量；`@theme static`（静态主题）可强制生成所有声明变量。来源同上。
4. 当主题变量引用其他变量时，官方建议使用 `@theme inline`；它让工具类直接使用被引用变量的值，避免 CSS 变量作用域导致的意外解析。来源同上。
5. `@theme` 必须在顶层声明，不能嵌套在其他选择器或媒体查询中；普通 `:root` 适用于不需要对应工具类的 CSS 变量。来源同上。
6. `@theme` 支持 `--*: initial` 清空默认命名空间，也支持把主题放在可复用 CSS 文件中，通过 `@import` 在多个项目共享。来源同上。

### 实现含义

- 主题导入器应输出两类数据：可产生工具类的 `@theme` 变量，以及只作为语义值的 `:root/.dark` 变量；不能把所有 token 都机械地塞进 `@theme`。
- 设计 Token 到 `@theme` 的映射应显式维护命名空间表。任意 token 名称并不自动成为合法工具类，只有落入 Tailwind 命名空间或通过 `@utility` 定义时才有对应 API。
- 对 shadcn 语义变量的引用，优先生成 `@theme inline`，例如 `--color-primary: var(--primary)`；这与官方 shadcn 主题模板一致。
- MVP 可将 `static` 作为导出选项，而不是默认值：开发构建通常按使用量生成，主题包或文档预览若要求完整变量再启用静态输出。

## 3. `shadcn/ui`（代码分发式组件）主题约定

### 官方事实

1. shadcn 官方推荐使用 CSS 变量主题；组件使用 `background`、`foreground`、`primary` 等语义 token，覆盖这些 token 即可改变外观，不必重写组件类。来源：<https://ui.shadcn.com/docs/theming>；当前 v4 文档源码：<https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/theming.mdx>（访问日期：2026-09-24）。
2. `components.json` 的 `tailwind.cssVariables` 默认开启；开启时，CLI 生成 CSS 变量并由 Tailwind 映射为 `bg-background`、`text-foreground`、`border-border`、`ring-ring` 等工具类。来源同上。
3. 暗色主题通过在 `.dark` 选择器中覆盖同一批语义变量实现。来源同上。
4. 官方使用背景/前景成对命名：例如 `primary` 与 `primary-foreground`；表格中还定义 `background`、`card`、`popover`、`secondary`、`muted`、`accent`、`destructive`、`border`、`input`、`ring`、`chart-1..5`、`sidebar-*` 和 `radius` 等语义 token。来源同上。
5. 新 token 需要同时写入 `:root` 和 `.dark`，再在 `@theme inline` 中暴露为 `--color-<name>: var(--<name>)`，这样才能使用 `bg-<name>` 等 Tailwind 类。来源同上。
6. `--radius` 是基础圆角 token，官方模板通过 `@theme inline` 的派生变量生成 `radius-sm` 到 `radius-4xl`。来源同上。
7. 不使用 CSS 变量也可初始化项目（`npx shadcn@latest init --no-css-variables`），但官方说明这是安装时选择，已有项目切换需要删除并重新安装组件。来源同上。

### 实现含义

- 本产品应把“原始 token”和“语义 token”分层保存，并为 `:root`、`.dark`、`@theme inline` 生成一份可追溯映射；不要只生成色板值。
- MVP 的主题编辑至少覆盖 `primary`、`secondary` 及其 `foreground`，并保留 shadcn 的基础语义集合，避免导出的组件出现缺变量。
- `--radius` 适合做产品级单一调节项，派生阶梯由模板生成；这比让用户逐个修改圆角档位更稳定。
- `--no-css-variables` 应列为兼容导入场景，而不是默认产品路径，因为它削弱了主题运行时覆盖和暗色模式的一致性。

## 4. `@shadcn/lint`（面向编码代理的 Tailwind 设计系统检查器）

### 官方事实

1. 官方仓库定位为 `agent-first linter for Tailwind design systems`；支持 Tailwind v4 项目，不要求使用 shadcn/ui，同时支持 ESLint 和 Oxlint，框架覆盖 React、Vue、Svelte。来源：<https://github.com/shadcn-ui/lint>、<https://raw.githubusercontent.com/shadcn-ui/lint/main/README.md>（访问日期：2026-09-24）。
2. 官方 README 要求 Node.js 20.19+；ESLint 9.30+；Oxlint 1.80+。当前 README 给出的安装和配置示例分别使用 `eslint.config.mjs` 与 `.oxlintrc.json`。
3. 规则包括：`no-restyle`（限制组件被 `className` 重设样式）、`no-raw-colors`（限制原始颜色）、`no-arbitrary-values`（限制 `p-[13px]` 等任意值）、`no-inline-styles`、`no-unknown-classes`、`require-static-classes`。来源同上。
4. 规则错误信息可以包含设计系统建议；支持自定义 `message`、占位符（如组件名、尺寸列表、主题文件路径）和组件 `contracts`（允许/禁止哪些类别或类）。来源同上。
5. 共享配置放在 `settings.shadcn`，可配置 UI 组件导入前缀、额外组件导入正则、忽略导入、合并类函数、variant 函数和附加说明。内置识别函数包括 `cn`、`cx`、`clsx`、`cva`、`tv`、`twMerge`、`twJoin`、`classNames`。来源同上。
6. 官方说明三种框架共用同一套规则、选项、contracts 和消息；Oxlint 对 Vue/Svelte 目前只读取 `<script>`，不读取模板标记，因此模板相关检查存在已知边界。来源同上。
7. 官方建议把 `eslint .` 或 `oxlint` 放入项目 `lint` 脚本，并在 `AGENTS.md` 中要求修改后运行 `npm run lint`。来源同上。
8. `@shadcn/lint` 的配置是宿主 linter 的插件配置，不是独立的完整扫描服务；其能力依赖 ESLint/Oxlint 能读取的文件、解析器和源码结构。来源：官方 README 与各框架文档链接（访问日期：2026-09-24）。

### 实现含义

- MVP 应调用官方规则并生成配置，不自研同等范围的规则引擎。产品自研部分放在主题导入、规则包生成、报告归一化和可视化。
- 产品内部应建立自己的“规则描述/报告模型”，再映射到 ESLint/Oxlint 配置，降低上游规则名称或配置形状变化带来的耦合。
- Oxlint 的 Vue/Svelte 模板限制必须在产品文案和报告中明确；若需要完整模板检查，MVP 默认使用 ESLint 适配器，Oxlint 作为速度优先的可选执行器。
- `no-arbitrary-values`、`no-raw-colors`、`no-unknown-classes`、`require-static-classes` 可作为基础规则集；`no-restyle` 需要用户提供组件目录和 contracts，适合第二阶段增强。

## 5. W3C Design Tokens Community Group 格式

### 官方事实

1. `Design Tokens Format Module 2025.10` 标注为 `Final Community Group Report`（社区组最终报告），发布日期为 2025-10-28；状态明确说明它“不是 W3C Standard，也不在 W3C Standards Track”，但该版本被认为稳定且可实现。来源：<https://www.designtokens.org/TR/2025.10/format/>（访问日期：2026-09-24）。
2. `https://tr.designtokens.org/format/` 是工作预览，标注为 `Draft Community Group Report`（社区组草案报告），并明确要求不要实现或引用为权威依据。工程应引用 2025.10 稳定版。来源：<https://tr.designtokens.org/format/>（访问日期：2026-09-24）。
3. 稳定格式使用 JSON；含 `$value` 的对象是 token，`$value` 为唯一必需属性，可选 `$description`、`$type`、`$deprecated`、`$extensions`；不含 `$value` 的对象是 group（分组）。类型不能根据值自动推断，必须显式声明或从父组继承。规范覆盖颜色、尺寸、字体、字重、时长、数字以及边框、过渡、阴影、渐变、排版等复合类型，并定义花括号引用与 JSON Pointer `$ref`。来源：<https://www.designtokens.org/TR/2025.10/format/>（访问日期：2026-09-24）。
4. 格式目标是跨工具交换设计令牌；它不规定 Tailwind 工具类命名，也不规定 shadcn 语义变量。来源同上。

### 实现含义

- 产品的导入边界应接受接近 DTCG 的 JSON，同时保留原始 JSON 和规范版本信息；导入后先做版本/字段校验，再进入内部规范化模型。
- DTCG JSON 到 Tailwind/shadcn 的映射必须是产品自己的映射层，尤其是颜色语义、暗色值、圆角基准和命名空间；不能宣称“导入即自动得到正确的工具类”。
- 虽然 2025.10 已标记稳定，但它仍不是 W3C 正式标准；MVP 宜支持常见核心字段和明确报错，对未知字段采用保留/警告策略，并记录所用规范版本。

## 6. `Style Dictionary`（跨平台 token 构建工具）

### 官方事实

1. 官方仓库把 Style Dictionary 定义为“定义一次样式、在多个平台使用”的构建工具，可输出 iOS、Android、CSS、JavaScript、HTML 等格式，也可作为 CLI 或 Node 模块使用。来源：<https://github.com/style-dictionary/style-dictionary>、<https://raw.githubusercontent.com/amzn/style-dictionary/main/README.md>（访问日期：2026-09-24）。
2. CLI 默认使用 `config.json`，可运行 `style-dictionary build`；Node API 可加载配置并调用 `buildAllPlatforms()`。来源同上。
3. 配置包含 `source`、`include`、`platforms`；平台可设置 `transformGroup`/`transforms`、`buildPath` 和输出文件 `format`。内置转换和格式可扩展，也可以注册自定义 transform/format。来源同上。
4. Style Dictionary 官方 DTCG 页面说明：从 v4 起提供 DTCG 一等支持，但 2025.10 最新格式在 v5 中仍未完全支持；旧格式到 DTCG 的转换器也不会自动把 `size` 改成 `dimension` 等语义类型。来源：<https://styledictionary.com/info/dtcg/>（访问日期：2026-09-24）。
5. 官方示例支持 token 别名引用（如 `{size.font.medium}`），并将同一份 token 生成 Sass、Android XML、Objective-C 等多种输出。来源同上。

### 实现含义

- Style Dictionary 适合作为“规范化 token → 多平台文件”的成熟轮子；产品可复用其解析、别名解析、转换和输出扩展能力。仓库当前 `package.json` 要求 Node.js `>=22.0.0`，接入时要与产品运行时统一。来源：<https://github.com/style-dictionary/style-dictionary/blob/main/package.json>（访问日期：2026-09-24）。
- Tailwind `@theme` 与 shadcn `:root/.dark` 的语义映射仍需要自定义 format/transform；Style Dictionary 不会自动理解这些产品语义。
- MVP 若只输出两份 CSS，可先用轻量内部转换器，避免引入完整构建配置；当需要多平台（CSS、JS、移动端）或用户自定义格式时再接入 Style Dictionary。

## 7. `ESLint`（JavaScript/TypeScript 静态检查器）与 `Oxlint`（Rust 实现的 JavaScript 检查器）

### 官方事实

1. ESLint 的现代配置使用 `eslint.config.js`/`eslint.config.mjs` 等 flat config；配置文件导出配置数组，按文件匹配并声明 parser、plugins、rules、settings 等。来源：<https://eslint.org/docs/latest/use/configure/configuration-files>、<https://raw.githubusercontent.com/eslint/eslint/main/docs/src/use/configure/configuration-files.md>（访问日期：2026-09-24）。
2. ESLint CLI 可用 `eslint .` 对项目执行检查；官方命令行文档说明可通过配置文件、命令行参数和忽略规则控制范围。来源：<https://eslint.org/docs/latest/use/command-line-interface>（访问日期：2026-09-24）。
3. ESLint 自定义规则通过插件导出；规则的 `meta` 和 `create` 接口接收 AST 节点并报告诊断。来源：<https://eslint.org/docs/latest/extend/custom-rule-tutorial>（访问日期：2026-09-24）。
4. Oxlint 官方文档说明项目可使用 `.oxlintrc.json`、`.oxlintrc.jsonc`、`oxlint.config.ts` 或 `oxlint.config.mts`；配置包含 `rules`、`categories`、`plugins`、`jsPlugins`、`overrides`、`extends`、`settings` 等字段。来源：<https://oxc.rs/docs/guide/usage/linter/config>（访问日期：2026-09-24）。
5. Oxlint 的 JavaScript 插件兼容 ESLint v9+ API，但官方明确标为 alpha，仍在开发中；插件路径通过 `jsPlugins` 配置。来源：<https://oxc.rs/docs/guide/usage/linter/js-plugins>（访问日期：2026-09-24）。
6. Oxlint 文档说明其目标是支持几乎完整的 ESLint 插件 API，但未升级到 ESLint v9 API 的旧插件可能需要修改；这意味着兼容性不是对所有插件的无条件保证。来源同上。

### 实现含义

- 集成层应把 ESLint 作为兼容性优先的默认执行器，把 Oxlint 作为速度优先的可选执行器，并分别生成官方配置文件。
- CLI/CI 入口统一成产品自己的命令（例如 `check`），内部根据项目选择 `eslint` 或 `oxlint`，同时保留原始退出码和文件/行列信息。
- 由于 Oxlint `jsPlugins` 仍是 alpha，产品升级测试必须覆盖 `@shadcn/lint` 的规则加载、Vue/Svelte 文件读取和 CI 退出码；不能只测试本地成功启动。

## 8. 对 MVP 与扩展阶段的直接建议

### MVP

1. 内置一套完整 shadcn 语义主题，支持 `primary/secondary` 微调和 `:root/.dark` 输出。
2. 支持简化 DTCG 风格 JSON：颜色、字号、间距、圆角、阴影及别名；保留原始输入和导入诊断。
3. 输出 Tailwind `@theme inline`、shadcn CSS 变量和 ESLint 配置；规则先启用 `no-arbitrary-values`、`no-raw-colors`、`no-unknown-classes`、`require-static-classes`。
4. 用官方 ESLint 运行样例项目，归一化诊断并生成偏移报告；Oxlint 作为实验选项。

### 第二阶段

1. 接入 Style Dictionary 作为可选多平台构建后端，加入自定义 `format/transform` 输出。
2. 增加 `no-restyle` contracts、组件目录识别、共享 `settings.shadcn` 和规则包版本管理。
3. 提供 CLI/CI 入口、基线和按目录 overrides；报告支持历史趋势。

### 第三阶段

1. 编辑器实时诊断、代码修复入口和团队策略模板。
2. 完整 DTCG 版本兼容、更多 token 类型和多平台导出。
3. 在有明确需求和测试覆盖后，再考虑自研补充扫描器或替代上游规则；不把自研完整 linter 放进 MVP。

## 9. 主要边界与风险

- `Tailwind @theme`、shadcn 语义 CSS 变量和 DTCG token 是三个不同层次；它们需要映射，不是同义格式。
- `@shadcn/lint` 依赖宿主解析器和源码可读性；动态类名、Vue/Svelte 模板及非标准组件导入会降低检查覆盖率。
- Oxlint 的 JavaScript 插件 API 仍为 alpha；应锁定版本并做回归。
- DTCG 虽有 2025.10 稳定发布版但仍不是 W3C 正式标准；Style Dictionary 对该版本也未完全覆盖，复合类型、类型迁移和平台降级必须做样例回归。
- Style Dictionary 能解决构建和多平台输出，但不会替产品决定语义 token、Tailwind 命名空间或组件 contracts。
