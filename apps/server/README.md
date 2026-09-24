# 检测任务服务

这是阶段一的服务端实现，负责检测任务、一次性令牌和检测结果的保存与查询。

## 本地运行

在主仓库根目录执行：

```bash
npm install
npm run dev:server
```

默认监听 `http://127.0.0.1:3001`。SQLite（本地文件数据库）文件默认保存在主仓库的 `data/scan-sessions.sqlite`，也可以通过 `SCAN_DATA_DIR` 指定目录，通过 `PORT` 指定端口。

## 接口

```text
POST /api/scan-sessions
POST /api/scan-sessions/:sessionId/result
GET /api/scan-sessions/:sessionId
```

接口字段使用 `packages/scan-contract`（共享协议包）中的校验模型。
