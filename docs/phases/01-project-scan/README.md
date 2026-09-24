# 阶段一：项目导入与本地检测

状态：检测方案已确认，待实现

已确认的交互方案：

- 用户复制 CLI 命令到项目目录执行；
- Web 页面轮询任务状态；
- 使用短期一次性任务令牌上传结果。

## 1. 阶段目标

完成“页面发起任务 + 本地 CLI 执行 + 检测结果回传”的最小闭环。

用户可以：

1. 在 Web 页面创建一次检测任务；
2. 获得一条本地 CLI 命令；
3. 在真实项目目录执行命令；
4. 由 CLI 检测项目技术栈、Tailwind、ESLint 和组件库；
5. 只回传结构化检测结果，不上传源码；
6. 在 Web 页面查看检测状态和结果。

## 2. MVP 检测范围

固定支持：

- React；
- Tailwind CSS v4；
- ESLint；
- 单应用项目。

需要识别：

- 包管理器和 lockfile；
- React 和版本；
- Tailwind CSS 和版本；
- Tailwind 主题入口和 `@theme`；
- ESLint 依赖和配置；
- `shadcn/ui`；
- 其他组件库及其检测依据；
- monorepo（多包仓库）和不支持的项目结构。

## 3. 推荐的基础流程

```text
Web 创建检测任务
    ↓
返回任务 ID、一次性令牌和 CLI 命令
    ↓
用户在项目目录运行 CLI
    ↓
CLI 本地扫描并生成检测结果 JSON
    ↓
CLI 通过 HTTPS 上传结果
    ↓
Web 查询任务状态并显示结果
```

## 4. 待决策方案

### 4.1 CLI 触发方式

#### 方案 A：页面显示命令，用户复制到终端

示例：

```bash
npx design-guardrails scan --project <id> --token <token>
```

优点：实现简单、兼容性好、浏览器不需要访问本地文件系统、容易调试。

缺点：需要用户打开终端并复制命令，体验不是完全一键。

#### 方案 B：安装本地代理，由页面调用代理

页面通过本地端口调用已经安装的代理，由代理启动扫描。

优点：可以实现“选择文件夹 → 点击检测”的体验。

缺点：需要安装常驻服务或本地代理，涉及端口发现、跨域、权限和安全确认，安装和排错成本较高。

#### 方案 C：上传项目压缩包

页面上传压缩包，服务器扫描后返回结果。

优点：页面流程直观，服务器统一执行。

缺点：需要传输源码，隐私风险和文件大小限制明显，不符合本产品默认的本地优先原则。

MVP 建议使用方案 A。方案 B 放到桌面应用或后续体验优化阶段，方案 C 不作为默认方案。

### 4.2 页面获取结果的方式

#### 方案 A：轮询

页面每隔一段时间请求任务状态。

优点：实现最简单，部署要求低，断线后容易恢复。

缺点：结果有短暂延迟，会产生重复请求。

#### 方案 B：SSE（服务器推送）

服务器在任务完成时推送结果。

优点：实现比 WebSocket 简单，适合单向状态更新。

缺点：需要处理连接断开和重连。

#### 方案 C：WebSocket（双向实时连接）

优点：实时性强，后续可以支持更多任务状态。

缺点：基础设施和连接管理复杂，MVP 使用价值不高。

MVP 建议使用方案 A，后续再根据体验改为 SSE。

### 4.3 CLI 认证方式

#### 方案 A：一次性任务令牌

页面创建任务时生成短期令牌，CLI 使用后上传一次结果。

优点：权限范围小，适合项目检测，泄露后的影响有限。

缺点：用户需要从页面复制命令，任务过期后需要重新生成。

#### 方案 B：个人 API Key（接口密钥）

用户长期保存一个密钥。

优点：命令简单，适合后续 CI。

缺点：密钥权限过大，容易被提交到仓库，MVP 不适合。

#### 方案 C：设备授权码

CLI 显示授权码，用户在 Web 页面确认。

优点：体验和安全性较好。

缺点：需要额外的登录和授权流程，适合后续版本。

MVP 建议使用方案 A。

## 5. 检测实现建议

检测分为两条链路：

```text
项目环境检测
  判断项目能否接入、主题在哪里、使用了哪些组件库

代码规则检查
  生成规则包后运行 @shadcn/lint，检查源码是否偏离设计体系
```

项目环境检测不是 `@shadcn/lint` 的职责。它由 CLI 自己完成；`@shadcn/lint` 在项目接入成功后负责真正的源码规则检查。

### 5.1 环境检测流程

#### A. 定位项目根目录

CLI 从当前目录开始查找 `package.json`。MVP 只支持单应用项目：

- 找不到 `package.json`：提示用户在项目根目录执行；
- 找到多个 workspace（工作区）：提示 MVP 暂不支持多包仓库；
- 找到唯一项目根目录：继续检测。

同时识别 npm、pnpm、yarn 或 bun 的 lockfile，并记录包管理器类型。

#### B. 读取项目元数据

读取 `package.json` 的 `dependencies`、`devDependencies` 和 scripts，但不上传完整文件内容。

使用 `semver`（版本比较工具）判断 React、Tailwind CSS 和 ESLint 的版本范围。

#### C. 检测 Tailwind CSS

Tailwind 检测需要同时看依赖和实际 CSS：

1. 检查 `tailwindcss` 依赖版本是否为 v4；
2. 查找 CSS 文件中的 `@import "tailwindcss"`；
3. 查找 `@theme`、`@theme inline` 或共享主题文件；
4. 确认 CSS 文件被项目入口引用；
5. 如果只有 v3 配置文件，标记为“不支持 Tailwind v3”，不把它误判为已接入。

使用 `fast-glob`（文件扫描工具）定位候选 CSS，使用 `PostCSS`（CSS 解析器）读取指令和变量。

#### D. 检测 ESLint

1. 检查 ESLint 依赖和版本；
2. 查找 `eslint.config.js`、`eslint.config.mjs` 等配置；
3. 使用 ESLint 官方 API 加载一个代表性源码文件的配置；
4. 记录配置是否可解析，不在这一步执行完整项目 Lint。

完整 Lint 运行放在规则包生成之后。

#### E. 检测组件库

组件库识别采用官方查询能力，不把目录名称或单个依赖包当作充分证据。

每个识别器输出：

```text
名称
是否检测到
可信度：high / medium / low
检测依据
```

`shadcn/ui` 优先调用固定版本的官方 CLI：

```bash
npx shadcn@<pinned-version> info --json --cwd <project-root>
```

官方命令负责读取并校验 `components.json`，解析 aliases（路径别名），识别项目框架、Tailwind 配置、UI 目录和已安装的官方组件。CLI 返回的 JSON 再转换成产品自己的检测模型。

如果官方 CLI 无法运行，检测任务失败并显示具体原因。MVP 不实现备用配置解析器，也不根据目录名称猜测 shadcn。

其他组件库仍然通过依赖包和源码导入识别，但只用于列出候选和提示支持状态，不能把“安装过依赖”当成“项目实际使用”。源码导入分析使用 `@typescript-eslint/typescript-estree`（TypeScript/JSX 语法解析器），只提取导入路径和组件名称，不上传源码内容。

组件库结果需要分级：

- `official`（官方识别）：官方 CLI 成功返回并完成组件解析；
- `partial`（部分识别）：官方 CLI 返回了项目配置，但组件信息不完整；
- `unknown`（未知）：官方 CLI 无法确认项目使用 shadcn。

只有 `official` 结果可以自动作为 shadcn 主要组件库进入后续流程。`partial` 和 `unknown` 需要用户选择“仅使用 Tailwind”，MVP 不自动启用 shadcn 适配。

#### F. 生成支持性结论

所有检测结果归一化后，生成一份支持性结论：

```text
supported       可以进入主题配置
partially_supported  可以配置基础 Token，但缺少组件适配
unsupported     当前 MVP 无法接入
needs_action    需要用户修复环境后重新检测
```

用户必须先通过 React、Tailwind CSS v4 和 ESLint 的检查，才能进入后续主题配置。检测到其他组件库时，系统列出它们并标记“当前 MVP 暂不支持”，由用户选择 shadcn 或“仅使用 Tailwind”。

### 5.2 代码规则检查流程

项目环境检测通过后，系统生成主题和规则包。CLI 再执行：

1. 将生成的主题文件和规则配置写入临时工作目录或项目配置目录；
2. 调用项目已有的 ESLint；
3. 加载 `@shadcn/lint`；
4. 运行基础 Token 和 Tailwind 类级别规则；
5. 把 ESLint 的诊断结果归一化成产品报告；
6. 只上传文件相对路径、行列位置、规则名、消息和修复建议。

代码内容仍然保留在本地。

CLI 不扫描 `node_modules`、构建产物和环境变量文件。

建议使用成熟工具：

- `semver`（版本比较）判断依赖版本；
- `fast-glob`（文件扫描）查找配置和源码；
- `PostCSS`（CSS 解析）读取 `@import`、`@theme` 和 CSS 变量；
- `@typescript-eslint/typescript-estree`（TypeScript/JSX 语法解析器）解析源码中的组件库导入；
- ESLint 官方 API 验证实际配置是否可运行。

需要产品自己实现：

- 技术栈检测结果模型；
- shadcn 检测规则；
- 组件库识别和可信度；
- 支持矩阵判断；
- 检测结果上传和展示；
- 不支持场景的解释与修复建议。

## 6. 结果回传接口草案

```text
POST /api/scan-sessions
创建检测任务

POST /api/scan-sessions/:id/result
CLI 上传结构化检测结果

GET /api/scan-sessions/:id
Web 查询检测状态和结果
```

结果只包含项目元数据和检测结论，例如：

```json
{
  "project": {
    "framework": "react",
    "tailwindVersion": "4.3.3",
    "eslintVersion": "10.11.0"
  },
  "components": [
    {
      "name": "shadcn/ui",
      "detected": true,
      "confidence": "high"
    }
  ],
  "theme": {
    "entry": "src/index.css",
    "found": true,
    "imported": true
  },
  "status": "supported",
  "warnings": []
}
```

## 7. 阶段验收标准

- Web 可以创建检测任务并显示一次性 CLI 命令；
- CLI 可以在用户项目目录运行；
- CLI 可以识别 React、Tailwind v4、ESLint 和 shadcn；
- CLI 可以识别不支持的组件库并说明依据；
- CLI 不上传源码和环境变量；
- CLI 可以上传结构化检测结果；
- Web 可以显示等待中、检测中、完成和失败状态；
- 用户可以看到支持性结论和修复建议；
- 任务令牌过期后不能继续上传结果；
- 网络失败时 CLI 能保留本地结果并提示重试。

## 8. MVP 边界

组件库识别在 MVP 中只用于：

- 判断项目是否采用 shadcn；
- 加载 shadcn 的项目语义预设；
- 生成组件库兼容的主题变量；
- 展示项目中已安装的官方组件。

MVP 不生成组件 contracts，也不检查组件是否被业务代码重新设置了间距、尺寸、圆角或其他精确样式。组件级约束属于后续阶段，只有在用户确实需要精细设计治理时再加入。
