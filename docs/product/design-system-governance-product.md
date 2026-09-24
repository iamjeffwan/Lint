# Design System → Tailwind → Lint 产品梳理

## 1. 一句话定义

这是一个把团队现有设计体系转换成前端可执行规则的工具。

用户导入自己的 Design Tokens（设计变量），产品将其映射成 Tailwind CSS 配置，再生成可供 shadcn/lint 使用的规则；项目侧通过我们的 CLI 接入，运行检查，并把结果同步回网页端展示。

核心链路：

**Design System → Tailwind CSS → Lint Rules → Project Validation**

---

## 2. 我们解决什么问题

AI 可以快速生成页面，但它很容易写出设计体系之外的值，例如：

- `p-[13px]`：13px 不在团队的间距阶梯里
- `text-[#333333]`：直接写了一个体系外颜色
- `text-[15px]`：字号不在团队定义的字体尺度里

团队原本可能有完整的 spacing、color、typography、radius 等规范，但这些规范通常只是设计资源或 Token，并没有直接变成 AI 生成代码时的硬约束。

我们的产品做的事情，就是把这套设计体系转换成机器可以执行的约束。

---

## 3. 产品边界

### 我们负责

1. 导入设计体系
2. 解析和标准化 Design Tokens
3. 将 Tokens 映射成 Tailwind CSS 可用配置
4. 根据设计体系生成 shadcn/lint 规则
5. 提供 CLI，把规则接入用户代码项目
6. 调用 shadcn/lint 执行检查
7. 将检查结果同步回网页端展示

### 我们暂时不负责

- 判断用户的设计体系是否合理
- 判断 spacing 阶梯是否缺少某个值
- 自动替用户补充设计体系
- 自己开发一套新的 Lint 引擎
- 自己做完整的 AI 编程环境
- 第一阶段支持所有 CSS 写法

如果用户的设计体系本身缺少某些尺度，这是设计体系自身的问题。我们只忠实执行用户导入的体系。

---

## 4. 核心产品流程

### 第一步：导入设计体系

用户在网页端创建项目，并导入 Design Tokens。

第一阶段可支持：

- Figma / Tokens Studio 导出的 JSON
- 通用 JSON Token 文件
- Style Dictionary 格式

可读取的内容包括：

- Spacing
- Colors
- Typography
- Radius
- Shadows
- Z-index
- 其他可映射的设计变量

例如用户的 spacing 是：

```text
0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128
```

产品只负责读取和整理，不判断这套尺度是否“够好”。

---

### 第二步：映射成 Tailwind CSS

产品把 Design Tokens 转换成项目可以直接使用的 Tailwind Theme / Tokens。

例如：

| Design Token | Value | Tailwind 使用方式 |
| --- | ---: | --- |
| spacing.4 | 4px | `p-1`, `gap-1` |
| spacing.8 | 8px | `p-2`, `gap-2` |
| spacing.12 | 12px | `p-3`, `gap-3` |
| spacing.16 | 16px | `p-4`, `gap-4` |
| color.text.primary | token value | `text-primary` |
| color.surface.muted | token value | `bg-surface-muted` |

设计体系保存的核心是真实 Token 和真实值，Tailwind 类名是它在代码侧的一种映射结果。

这一层可以基于现有 Token 转换方案实现，不需要从零重新发明 Token Transformer。

---

### 第三步：生成 Lint Rules

根据用户导入的设计体系和 Tailwind 映射，自动生成可供 shadcn/lint 使用的规则。

典型规则：

- spacing 只能使用设计体系允许的尺度
- 禁止任意值，例如 `p-[13px]`
- 颜色必须来自允许的 Color Tokens
- 字号必须来自 Typography Tokens
- radius、shadow 等同样只能使用体系内定义

用户不需要逐个填写所有合法值，这些规则应该从导入的 Token 自动生成。

最终可以生成类似以下产物：

```text
design-tokens.json
tailwind theme/config
lint rules/config
```

---

## 5. 项目如何真正接入

产品形态不是只有一个网页，而是：

**Web Console + CLI / NPM Package + shadcn/lint**

### Web Console

主要负责：

- 导入设计体系
- 查看 Tokens
- 查看 Tailwind 映射
- 查看生成的 Lint Rules
- 管理项目
- 查看检查结果
- 查看历史检查记录

### CLI / NPM Package

安装在用户真实代码项目中，负责连接网页端和本地项目。

主要职责：

1. 关联网页端项目
2. 获取最新 Tokens / Tailwind 配置 / Lint Rules
3. 将规则提供给当前代码项目
4. 调用 shadcn/lint
5. 收集检查结果
6. 将结果同步回网页端

CLI 是我们的“项目接入层”，但不是新的 Lint 引擎。

### shadcn/lint

负责真正扫描代码并判断是否违反规则。

例如项目中出现：

```tsx
<div className="p-[13px] text-[#333333] text-[15px]" />
```

检查结果可能是：

```text
p-[13px]
→ 13px 不在 spacing scale 中
→ 建议使用 p-3

text-[#333333]
→ 不允许使用体系外颜色
→ 建议使用 text-primary

text-[15px]
→ 15px 不在 typography scale 中
→ 使用体系中已有字号
```

我们的网页端可以把这些结果重新组织成更容易阅读的界面。

---

## 6. AI 在这个体系中的位置

我们不需要自己做 AI 页面生成器。

真实使用方式是：

1. 开发者或 Coding Agent 获取项目中的设计规则
2. AI 正常生成页面
3. shadcn/lint 对生成结果进行检查
4. 如果存在错误，Agent 根据错误修改代码
5. 再次运行 Lint
6. 直到通过

因此我们的核心价值不是“帮 AI 写页面”，而是：

**让任何 AI 写出来的页面，都可以被同一套设计体系进行机器验证。**

---

## 7. 一个完整例子

假设一家团队定义的 spacing 是：

```text
0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128
```

产品导入后，将其映射到 Tailwind。

AI 在开发页面时写了：

```tsx
<section className="p-[13px] gap-6">
```

其中：

- `gap-6` 映射到体系内已有值，可以通过
- `p-[13px]` 不属于设计体系，Lint 报错

Agent 收到错误后，将其改成体系内最合适的值，例如：

```tsx
<section className="p-3 gap-6">
```

重新运行后通过。

如果团队长期发现自己的设计经常需要某个体系之外的尺度，那么是否修改设计体系，由团队自己决定，不属于我们的自动判断范围。

---

## 8. 第一版 MVP

第一版可以非常聚焦：

### 输入

- 一套成熟的 Design Tokens
- 第一阶段可以直接选择公开、成熟的设计体系作为实验数据

### 支持范围

- Tailwind CSS
- Spacing
- Color
- Typography
- Radius

### 输出

- 标准化后的 Design Tokens
- Tailwind 配置
- shadcn/lint 规则
- CLI 项目接入
- Lint 检查结果网页展示

### 暂不做

- 普通 CSS / CSS Modules / CSS-in-JS 的统一分析
- 设计体系质量评价
- AI 自动补齐设计规范
- 完整 IDE
- 自研 Lint 引擎

第一版最重要的是把下面这条链路真正跑通：

```text
Import Tokens
    ↓
Normalize
    ↓
Generate Tailwind Config
    ↓
Generate Lint Rules
    ↓
CLI Connects Project
    ↓
Run shadcn/lint
    ↓
Sync Validation Results
```

---

## 9. 产品界面的核心内容

网页端不需要承担代码编辑器的全部职责，重点是三个核心区域：

### 1. Design System Import

显示：

- Token 来源
- Token 类别
- Token 数量
- 实际值
- 导入状态

### 2. Tailwind Mapping

显示：

- Design Token
- 实际值
- 对应 Tailwind Theme / Class
- 生成后的配置预览

### 3. Lint Rules

显示：

- 自动生成的规则
- 当前规则状态
- 输出的规则文件
- shadcn/lint 检查结果

检查结果属于第三部分的运行反馈，不需要把产品扩展成完整 AI 开发工作台。

---

## 10. 产品定位

这个产品不是：

> “另一个 AI 页面生成器”

也不是：

> “另一个 Lint 工具”

更准确的定位是：

> **Design System → Code Rules Compiler**
>
> 把设计体系转换成 AI 和代码工具可以真正执行的开发约束。

最终让设计体系从“文档规范”变成“代码生成时必须遵守的规则”。
