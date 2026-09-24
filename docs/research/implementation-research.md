# 设计体系护栏实现研究

## 结论

产品应采用“输入适配器 → 规范化令牌模型 → 产物生成器 → 项目侧检查 → 报告模型”的链路。Tailwind CSS、`@shadcn/lint`、ESLint/Oxlint 和 Style Dictionary 都有成熟实现，应通过适配层组合，不应在第一阶段重写它们。

## 一手资料核对

| 结论 | 依据 |
| --- | --- |
| Tailwind v4 的主题变量会生成对应的工具类，`@theme` 是适合的生成目标 | [Tailwind CSS Theme variables](https://tailwindcss.com/docs/theme) |
| shadcn 组件主题使用 CSS 变量，并需要同时处理明暗主题语义 | [shadcn/ui Theming](https://ui.shadcn.com/docs/theming) |
| `@shadcn/lint` 以 ESLint 或 Oxlint 插件方式运行，提供任意值、原始颜色、未知类、组件重设样式等规则，并支持 contracts（组件约定）和面向代理的诊断消息 | [shadcn-ui/lint README](https://github.com/shadcn-ui/lint/blob/main/README.md)、[rules](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md) |
| `@shadcn/lint` 当前要求 Node.js 20.19+，ESLint 9.30+ 或 Oxlint 1.80+；因此运行环境和版本应由产品锁定并在样例仓库回归 | [shadcn-ui/lint README](https://github.com/shadcn-ui/lint/blob/main/README.md) |
| Style Dictionary 的职责是把设计令牌转换为不同平台的输出格式，适合用作转换器或参考实现 | [Style Dictionary](https://styledictionary.com/)、[Tokens and formats](https://styledictionary.com/reference/tokens/)、[Formats](https://styledictionary.com/reference/hooks/formats/) |
| Design Tokens Community Group 的格式定义了跨工具的令牌交换结构，但实际来源仍可能带有工具扩展，因此需要源格式适配器 | [Design Tokens Format Module](https://www.designtokens.org/tr/drafts/format/) |
| ESLint 官方建议在已有规则不足、且规则确实属于项目约束时编写自定义规则；这支持把产品规则优先映射给 `@shadcn/lint`，把自定义规则限制在产品特有诊断上 | [ESLint Custom Rule Tutorial](https://eslint.org/docs/latest/extend/custom-rule-tutorial) |

## 对实现的影响

1. 内部保存自己的规范化令牌模型，保留来源路径、原始值、解析后的值、别名关系和生成名称。不能把 Tailwind 类名当作真实数据，因为一个令牌可能需要同时生成 Tailwind 主题变量、shadcn 语义变量和其他平台输出。
2. 第一阶段只承诺有限输入范围：DTCG（设计令牌社区格式）JSON、Tokens Studio 常见 JSON 和简化 Style Dictionary JSON。输入来源通过适配器接入，后续增加 Figma API 或其他工具时不改核心模型。
3. 规则生成器输出 `@shadcn/lint` 配置、组件 contracts（组件约定）和 AI 项目规则片段。产品自有规则与报告模型不能直接暴露上游配置结构，以便未来替换检查引擎。
4. 需要锁定 Tailwind、`@shadcn/lint`、ESLint/Oxlint 和 Node 版本，维护一个最小 React + Tailwind v4 回归仓库，验证生成文件、检查结果和版本升级。
