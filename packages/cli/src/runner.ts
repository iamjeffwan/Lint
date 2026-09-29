import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { scanResultSchema, type ScanResult } from '@design-system-guardrails/scan-contract'
import { defaultCacheDirectory, loadResult, saveResult } from './cache.js'
import { CliError } from './errors.js'
import { serverUrlSchema, sessionIdSchema, tokenSchema } from './input.js'
import { uploadResult, type Fetch } from './transport.js'

export type Detector = (context: { projectDirectory: string }) => Promise<ScanResult>
export type RunnerOptions = {
  sessionId: string
  token: string
  server: string
  directory?: string
  cacheDirectory?: string
  timeoutMs?: number
}
export type RunnerDependencies = {
  detector?: Detector
  fetch?: Fetch
  log?: (message: string) => void
}

function validate(options: RunnerOptions) {
  const parsed = serverUrlSchema.safeParse(options.server)
  if (!parsed.success) throw new CliError('SERVER_INVALID', '服务地址无效；请使用加密连接或本机服务地址。')
  if (!sessionIdSchema.safeParse(options.sessionId).success || !tokenSchema.safeParse(options.token).success) {
    throw new CliError('CREDENTIALS_INVALID', '任务编号或令牌格式无效，请重新复制网页命令。')
  }
  return parsed.data
}

export async function runScan(options: RunnerOptions, dependencies: RunnerDependencies = {}) {
  const server = validate(options)
  const log = dependencies.log ?? (() => {})
  let projectDirectory: string
  try {
    projectDirectory = await realpath(path.resolve(options.directory ?? process.cwd()))
    if (!(await stat(projectDirectory)).isDirectory()) throw new Error('Not a directory')
  } catch { throw new CliError('DIRECTORY_INVALID', '项目目录不存在或不是文件夹。') }
  if (!dependencies.detector) {
    throw new CliError('DETECTOR_NOT_READY', '没有配置检测入口，已停止执行。')
  }
  log('项目目录已确认，开始本地检测。')
  let result: ScanResult
  try {
    result = scanResultSchema.parse(await dependencies.detector({ projectDirectory }))
  } catch { throw new CliError('DETECTION_FAILED', '检测未完成或结果不符合协议，未上传。') }
  if (result.tailwind.status === 'installed') log(`已安装样式框架版本：${result.tailwind.version}`)
  if (result.theme.status === 'located') log(`官方查询选中的主题：${result.theme.path}；此路径未经过全项目引用审计。`)
  for (const warning of result.warnings) log(warning.message)
  const record = { cacheVersion: 1 as const, sessionId: options.sessionId, server, result }
  let file: string
  try {
    file = await saveResult(record, options.cacheDirectory ?? defaultCacheDirectory())
  } catch { throw new CliError('CACHE_WRITE_FAILED', '无法保存结果快照，已停止上传，请检查缓存目录权限。') }
  log(`结果快照已保存：${file}`)
  log('正在上传检测结果。')
  const status = await uploadResult(record, options.token, {
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  })
  log(status === 'uploaded' ? '服务端已接收结果。' : '已核对：服务端此前已保存相同结果。')
  return { status, file }
}

export async function runRetry(
  file: string,
  options: { token: string; sessionId?: string; cacheDirectory?: string; timeoutMs?: number },
  dependencies: Omit<RunnerDependencies, 'detector'> = {},
) {
  const log = dependencies.log ?? (() => {})
  let record
  try { record = await loadResult(file) }
  catch { throw new CliError('CACHE_INVALID', '无法读取有效的结果快照，请检查文件。') }
  const sessionId = options.sessionId ?? record.sessionId
  validate({ sessionId, token: options.token, server: record.server })
  if (sessionId !== record.sessionId) {
    record = { ...record, sessionId }
    try { file = await saveResult(record, options.cacheDirectory ?? defaultCacheDirectory()) }
    catch { throw new CliError('CACHE_WRITE_FAILED', '无法保存新任务的结果快照，已停止上传。') }
  }
  log(`重试快照：${file}`)
  const status = await uploadResult(record, options.token, {
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  })
  log(status === 'uploaded' ? '服务端已接收结果。' : '已核对：服务端此前已保存相同结果。')
  return { status, file }
}
