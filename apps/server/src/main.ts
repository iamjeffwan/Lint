import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createScanHttpApp, ScanService, SqliteScanSessionStore } from '@design-system-guardrails/scan-service'

const port = Number(process.env.PORT ?? 3001)
const dataDirectory = path.resolve(process.env.SCAN_DATA_DIR ?? 'data')
await mkdir(dataDirectory, { recursive: true })

const store = new SqliteScanSessionStore(path.join(dataDirectory, 'scan-sessions.sqlite'))
const service = new ScanService({ store })
const app = await createScanHttpApp({
  service, logger: true,
  ...(process.env.PUBLIC_ORIGIN ? { publicOrigin: process.env.PUBLIC_ORIGIN } : {}),
  ...(process.env.WEB_ORIGIN ? { corsOrigin: process.env.WEB_ORIGIN } : {}),
})

const close = async () => {
  await app.close()
  store.close()
}

process.once('SIGINT', close)
process.once('SIGTERM', close)

await app.listen({ host: '127.0.0.1', port })
