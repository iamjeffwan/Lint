import { isDeepStrictEqual } from 'node:util'
import {
  getScanSessionResponseSchema,
  uploadScanResultRequestSchema,
  uploadScanResultResponseSchema,
} from '@design-system-guardrails/scan-contract'
import { MAX_RESULT_BYTES, type SavedResult } from './cache.js'
import { CliError, requestFailure } from './errors.js'

export type Fetch = typeof fetch

async function readJson(response: Response) {
  if (!response.body) throw new Error('Empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.length
      if (size > MAX_RESULT_BYTES + 4096) throw new Error('Oversized response')
      chunks.push(chunk.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function uploadResult(
  record: SavedResult,
  token: string,
  options: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<'uploaded' | 'already_completed'> {
  const request = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const body = JSON.stringify(uploadScanResultRequestSchema.parse({ result: record.result }))
  if (Buffer.byteLength(body) > MAX_RESULT_BYTES) {
    throw new CliError('RESULT_TOO_LARGE', '结果超过服务端的 256 千字节限制，未发送。')
  }
  const sessionUrl = `${record.server}/api/scan-sessions/${encodeURIComponent(record.sessionId)}`

  const reconcile = async () => {
    try {
      const response = await request(sessionUrl, {
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) { await response.body?.cancel(); return false }
      const session = getScanSessionResponseSchema.parse(await readJson(response))
      return session.sessionId === record.sessionId && session.status === 'completed' &&
        isDeepStrictEqual(session.result, record.result)
    } catch { return false }
  }

  let response: Response
  try {
    response = await request(`${sessionUrl}/result`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body,
    })
  } catch {
    if (await reconcile()) return 'already_completed'
    throw requestFailure()
  }

  if (response.ok) {
    try {
      uploadScanResultResponseSchema.parse(await readJson(response))
      return 'uploaded'
    } catch {
      if (await reconcile()) return 'already_completed'
      throw new CliError('RESPONSE_INVALID', '服务端确认信息无效，尚不能确认结果已接收。')
    }
  }
  const status = response.status
  await response.body?.cancel()
  if ([408, 409, 410].includes(status) || status >= 500) {
    if (await reconcile()) return 'already_completed'
  }
  const errors: Record<number, [string, string]> = {
    400: ['RESULT_REJECTED', '服务端拒绝了结果，请检查协议版本。'],
    401: ['TOKEN_INVALID', '上传令牌无效，请核对网页命令。'],
    403: ['ACCESS_DENIED', '没有上传权限。'],
    404: ['SESSION_NOT_FOUND', '检测任务不存在，请核对任务编号和服务地址。'],
    409: ['RESULT_CONFLICT', '任务已使用，但无法确认结果一致，请回网页查看。'],
    410: ['SESSION_EXPIRED', '任务已过期。请在网页新建任务，使用新编号和令牌重试已保存的结果。'],
    413: ['RESULT_TOO_LARGE', '结果超过服务端大小限制。'],
    429: ['RATE_LIMITED', '请求过于频繁，请稍后重试。'],
  }
  const [code, message] = errors[status] ?? ['UPLOAD_FAILED', '服务暂不可用或返回非预期状态，请稍后重试。']
  throw new CliError(code, message)
}
