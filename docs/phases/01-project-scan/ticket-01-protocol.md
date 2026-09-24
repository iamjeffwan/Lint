# 工单一：检测任务与接口协议

## 1. 一张图看完整流程

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant Web as Web 页面
    participant Server as 服务端
    participant CLI as 我们的 CLI
    participant Project as 用户本地项目
    participant Shadcn as 官方 shadcn CLI

    User->>Web: 点击“开始检测”
    Web->>Server: POST /api/scan-sessions
    Server->>Server: 创建检测任务
    Server->>Server: 生成短期一次性令牌
    Server-->>Web: sessionId、token、expiresAt、command
    Web-->>User: 显示复制命令

    User->>CLI: 在项目目录执行 scan 命令
    CLI->>Project: 查找项目根目录和 package.json
    CLI->>Project: 检查 React、Tailwind v4、ESLint
    CLI->>Shadcn: shadcn info --json --cwd 项目目录
    Shadcn-->>CLI: 返回 shadcn 项目和组件信息
    CLI->>CLI: 组合并校验检测结果 JSON

    CLI->>Server: POST /api/scan-sessions/{id}/result
    Note over CLI,Server: 使用 Bearer 一次性令牌
    Server->>Server: 校验任务、令牌和过期时间
    Server->>Server: 保存结果并立即使令牌失效
    Server-->>CLI: 接收成功

    loop 页面轮询任务状态
        Web->>Server: GET /api/scan-sessions/{id}
        Server-->>Web: 当前状态和结果
    end

    Web-->>User: 展示技术栈、组件库和支持性结论
```

## 2. 四个核心对象

```mermaid
flowchart LR
    A[检测任务\nscan session] --> B[一次性令牌\n短期上传凭证]
    A --> C[检测结果\n结构化 JSON]
    C --> D[支持性结论\nsupported / needs action]
    B --> E[CLI 上传结果]
    E --> C
    D --> F[Web 页面展示]
```

### 检测任务

检测任务表示一次具体的项目检测。它不是用户项目本身，同一个项目可以反复创建新的检测任务。

任务状态：

```text
created（已创建）
waiting_cli（等待 CLI）
running（检测中）
completed（已完成）
failed（失败）
expired（已过期）
```

### 一次性令牌

一次性令牌是服务端为单次任务生成的短期上传凭证。它只允许 CLI 上传当前任务的结果，成功上传后立即失效。

```mermaid
stateDiagram-v2
    [*] --> 未使用
    未使用 --> 已使用: CLI 成功上传结果
    未使用 --> 已过期: 超过有效时间
    已使用 --> 拒绝再次上传
    已过期 --> 拒绝上传
```

服务端只保存令牌哈希值，不保存明文令牌。令牌不承担用户登录功能，也不作为长期 API Key（接口密钥）。

## 3. 任务状态变化

```mermaid
stateDiagram-v2
    [*] --> created: Web 创建任务
    created --> waiting_cli: 返回命令和令牌
    waiting_cli --> running: CLI 开始扫描
    running --> completed: 结果校验并保存成功
    running --> failed: 本地检测或上传失败
    waiting_cli --> expired: 令牌过期
    running --> expired: 任务超时
    failed --> waiting_cli: 用户重新生成任务
    completed --> [*]
    expired --> [*]
```

## 4. 结果模型

检测结果只描述项目环境和检测结论，不包含源码正文、环境变量或密钥。

```mermaid
classDiagram
    class ScanResult {
      schemaVersion: number
      cliVersion: string
      packageManager: PackageManager
      framework: FrameworkResult
      tailwind: TailwindResult
      eslint: ESLintResult
      shadcn: ShadcnResult
      support: SupportResult
      warnings: Warning[]
    }

    class PackageManager {
      name: npm | pnpm | yarn | bun
      lockfile: string
    }

    class FrameworkResult {
      name: react
      version: string
      status: passed | failed
    }

    class TailwindResult {
      version: string
      cssEntry: string
      themeFound: boolean
      themeImported: boolean
      status: passed | failed
    }

    class ESLintResult {
      version: string
      configFound: boolean
      configLoadable: boolean
      status: passed | failed
    }

    class ShadcnResult {
      status: official | partial | unknown
      cssEntry: string
      components: string[]
      preset: string
    }

    class SupportResult {
      status: supported | partially_supported | unsupported | needs_action
      blockingIssues: string[]
      warnings: string[]
    }

    ScanResult --> PackageManager
    ScanResult --> FrameworkResult
    ScanResult --> TailwindResult
    ScanResult --> ESLintResult
    ScanResult --> ShadcnResult
    ScanResult --> SupportResult
```

结果示例：

```json
{
  "schemaVersion": 1,
  "cliVersion": "0.1.0",
  "packageManager": {
    "name": "npm",
    "lockfile": "package-lock.json"
  },
  "framework": {
    "name": "react",
    "version": "19.2.8",
    "status": "passed"
  },
  "tailwind": {
    "version": "4.3.3",
    "cssEntry": "src/index.css",
    "themeFound": true,
    "themeImported": true,
    "status": "passed"
  },
  "eslint": {
    "version": "10.11.0",
    "configFound": true,
    "configLoadable": true,
    "status": "passed"
  },
  "shadcn": {
    "status": "official",
    "cssEntry": "src/index.css",
    "components": ["button", "card", "input"],
    "preset": "base-nova"
  },
  "support": {
    "status": "supported",
    "blockingIssues": [],
    "warnings": []
  },
  "warnings": []
}
```

## 5. 接口协议

### 创建检测任务

```text
POST /api/scan-sessions
```

返回：

```json
{
  "sessionId": "scan_123",
  "token": "短期一次性令牌",
  "expiresAt": "2026-09-24T12:00:00Z",
  "command": "npx @design-guardrails/cli scan --project scan_123 --token 短期一次性令牌"
}
```

### CLI 上传结果

```text
POST /api/scan-sessions/{sessionId}/result
Authorization: Bearer <token>
Content-Type: application/json
```

请求体是 `ScanResult`（检测结果模型）。

成功返回：

```json
{
  "accepted": true,
  "status": "completed"
}
```

### Web 查询任务状态

```text
GET /api/scan-sessions/{sessionId}
```

返回：

```json
{
  "sessionId": "scan_123",
  "status": "completed",
  "result": {},
  "error": null
}
```

## 6. 协议边界

服务端负责任务、令牌、状态和结果保存；CLI 负责本地读取和检测；Web 负责创建任务、复制命令、轮询状态和展示结果。

CLI 不上传：

- 源码正文；
- `.env`（环境变量）文件；
- 密钥和令牌；
- 完整配置文件内容；
- `node_modules`（依赖目录）。

工单一完成后，工单二、工单三和工单四可以依据这份文档并行实现服务端、Web 页面和 CLI。
