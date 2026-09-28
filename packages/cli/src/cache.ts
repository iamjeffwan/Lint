import { mkdir, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { scanResultSchema } from '@design-system-guardrails/scan-contract'
import { sessionIdSchema, serverUrlSchema } from './input.js'
import { CliError } from './errors.js'

export const MAX_RESULT_BYTES = 256 * 1024
const envelopeSchema = z.strictObject({
  cacheVersion: z.literal(1),
  sessionId: sessionIdSchema,
  server: serverUrlSchema,
  result: scanResultSchema,
})
export type SavedResult = z.infer<typeof envelopeSchema>
export const defaultCacheDirectory = () => path.join(homedir(), '.cache', 'design-guardrails', 'scans')

export async function saveResult(input: SavedResult, directory: string) {
  const record = envelopeSchema.parse(input)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = path.resolve(directory, `${record.sessionId}-${randomUUID()}.json`)
  const handle = await open(file, 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify(record, null, 2), 'utf8')
  } finally {
    await handle.close()
  }
  return file
}

export async function loadResult(file: string): Promise<SavedResult> {
  // 只读取我们的结果快照，不支持拿任意源码或环境文件作为上传输入。
  if (path.extname(file).toLowerCase() !== '.json') {
    throw new CliError('CACHE_INVALID', '重试只接受本工具生成的结果快照。')
  }
  const handle = await open(file, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_RESULT_BYTES * 2) {
      throw new CliError('CACHE_INVALID', '结果快照无效或过大。')
    }
    const bytes = Buffer.alloc(MAX_RESULT_BYTES * 2 + 1)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead > MAX_RESULT_BYTES * 2) throw new Error('Oversized snapshot')
    return envelopeSchema.parse(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')))
  } catch {
    throw new CliError('CACHE_INVALID', '结果快照无效或与当前协议不兼容。')
  } finally {
    await handle.close()
  }
}
