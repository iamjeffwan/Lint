import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { createScanHttpApp, InMemoryScanSessionStore, ScanService } from '@design-system-guardrails/scan-service'
import { createScanSessionResponseSchema } from '@design-system-guardrails/scan-contract'
import { runRetry, runScan } from './runner.js'
import { demoDetector } from './demo.js'
import { serverUrlSchema } from './input.js'
import { loadResult } from './cache.js'
import { uploadResult } from './transport.js'
import { mkdir } from 'node:fs/promises'

const exec = promisify(execFile)
const root = process.cwd()
const binary = path.join(root, 'packages/cli/dist/main.js')
const resources: Array<() => Promise<void>> = []
beforeAll(async () => {
  await mkdir(path.join(root, 'artifacts'), { recursive: true })
  await exec(process.execPath, ['scripts/build.mjs'], { cwd: path.join(root, 'packages/cli') })
})
afterEach(async () => { await Promise.all(resources.splice(0).map((close) => close())) })

async function context(ttl = 600_000) {
  let now = new Date()
  const store = new InMemoryScanSessionStore()
  const service = new ScanService({ store, tokenTtlMs: ttl, now: () => now })
  const app = await createScanHttpApp({ service })
  const server = await app.listen({ host: '127.0.0.1', port: 0 })
  resources.push(() => app.close())
  const directory = await mkdtemp(path.join(root, 'artifacts', 'cli test '))
  const response = await fetch(`${server}/api/scan-sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'cli_test' }),
  })
  const created = createScanSessionResponseSchema.parse(await response.json())
  const options = {
    sessionId: created.sessionId, token: created.token, server, directory,
    cacheDirectory: path.join(directory, 'cache'),
  }
  return { service, app, options, command: created.command, directory, advance: (ms: number) => { now = new Date(now.getTime() + ms) } }
}

describe('CLI delivery', () => {
  it('executes the generated service command options without supplying a missing server address', async () => {
    const ctx = await context()
    const [, , ...args] = ctx.command.split(' ')
    expect(args).toContain(ctx.options.server)
    const output = await exec(process.execPath, [binary, ...args, '--demo', '--cache-dir', ctx.options.cacheDirectory], { cwd: ctx.directory })
    expect(output.stderr).toContain('服务端已接收结果')
    expect(ctx.service.getSession(ctx.options.sessionId).status).toBe('completed')
  })

  it('runs the built entry in a directory with spaces and returns an explicit demo result', async () => {
    const ctx = await context()
    await writeFile(path.join(ctx.directory, '.env'), 'TEST_SENTINEL=must_stay_local')
    const out = await exec(process.execPath, [binary, 'scan', '--demo', '--session', ctx.options.sessionId,
      '--token', ctx.options.token, '--server', ctx.options.server, '--cache-dir', ctx.options.cacheDirectory],
    { cwd: ctx.directory })
    expect(out.stderr).toContain('服务端已接收结果')
    expect(out.stdout + out.stderr).not.toContain(ctx.options.token)
    const session = ctx.service.getSession(ctx.options.sessionId)
    expect(session.status).toBe('completed')
    expect(session.result?.warnings[0]?.code).toBe('DEMO_ONLY')
    expect(session.result?.support.status).toBe('needs_action')
    expect(JSON.stringify(session)).not.toContain('must_stay_local')
    expect(JSON.stringify(session)).not.toContain(ctx.directory)
    expect(await readFile(path.join(ctx.directory, '.env'), 'utf8')).toBe('TEST_SENTINEL=must_stay_local')
    const files = await readdir(ctx.options.cacheDirectory)
    const snapshot = await readFile(path.join(ctx.options.cacheDirectory, files[0]!), 'utf8')
    expect(snapshot).not.toContain(ctx.options.token)
    expect(snapshot).not.toContain(ctx.directory)
    const retry = await exec(process.execPath, [binary, 'retry', '--file', path.join(ctx.options.cacheDirectory, files[0]!),
      '--token', ctx.options.token], { cwd: ctx.directory })
    expect(retry.stderr).toContain('此前已保存相同结果')
  })

  it('passes an explicit project directory to the detector and refuses default fake detection', async () => {
    const ctx = await context()
    let scanned = ''
    await runScan(ctx.options, { detector: async (input) => { scanned = input.projectDirectory; return demoDetector(input) } })
    expect(scanned).toBe(ctx.directory)
    await expect(runScan(ctx.options)).rejects.toMatchObject({ code: 'DETECTOR_NOT_READY' })
  })

  it('keeps a snapshot after a network failure and retries without scanning', async () => {
    const ctx = await context()
    await expect(runScan(ctx.options, { detector: demoDetector, fetch: async () => { throw new Error('offline') } }))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    const [file] = await readdir(ctx.options.cacheDirectory)
    const replay = await runRetry(path.join(ctx.options.cacheDirectory, file!), { token: ctx.options.token })
    expect(replay.status).toBe('uploaded')
    const duplicate = await runRetry(replay.file, { token: ctx.options.token })
    expect(duplicate.status).toBe('already_completed')
  })

  it('reconciles a lost upload acknowledgement and does not send a second upload', async () => {
    const ctx = await context()
    let posts = 0
    const result = await runScan(ctx.options, {
      detector: demoDetector,
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        if (init?.method === 'POST') {
          posts++
          await response.body?.cancel()
          throw new Error('Lost acknowledgement')
        }
        return response
      },
    })
    expect(posts).toBe(1)
    expect(result.status).toBe('already_completed')
  })

  it('reports expiry and reuses the saved result with a new task and token', async () => {
    const ctx = await context(1000)
    ctx.advance(1000)
    await expect(runScan(ctx.options, { detector: demoDetector })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    const [file] = await readdir(ctx.options.cacheDirectory)
    const next = ctx.service.createSession({ projectId: 'cli_test' })
    const retried = await runRetry(path.join(ctx.options.cacheDirectory, file!), {
      token: next.token, sessionId: next.sessionId, cacheDirectory: ctx.options.cacheDirectory,
    })
    expect(retried.status).toBe('uploaded')
    expect((await loadResult(retried.file)).sessionId).toBe(next.sessionId)
  })

  it('distinguishes invalid credentials, unknown task, and conflicting completed results', async () => {
    const ctx = await context()
    await expect(runScan({ ...ctx.options, token: 'incorrect_token_1234567' }, { detector: demoDetector }))
      .rejects.toMatchObject({ code: 'TOKEN_INVALID' })
    await expect(runScan({ ...ctx.options, sessionId: 'scan_missing' }, { detector: demoDetector }))
      .rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' })
    await runScan(ctx.options, { detector: demoDetector })
    await expect(runScan(ctx.options, { detector: async (input) => ({ ...await demoDetector(input), cliVersion: 'different' }) }))
      .rejects.toMatchObject({ code: 'RESULT_CONFLICT' })
  })

  it('stops malformed detection, invalid directories and oversized results before sending', async () => {
    const ctx = await context()
    let requests = 0
    const request: typeof fetch = async () => { requests++; throw new Error('No request expected') }
    await expect(runScan({ ...ctx.options, directory: path.join(ctx.directory, 'missing') }, { detector: demoDetector, fetch: request }))
      .rejects.toMatchObject({ code: 'DIRECTORY_INVALID' })
    await expect(runScan(ctx.options, { detector: async () => { throw new Error('Bad result') }, fetch: request }))
      .rejects.toMatchObject({ code: 'DETECTION_FAILED' })
    await expect(runScan(ctx.options, { detector: async (input) => ({ ...await demoDetector(input), cliVersion: 'x'.repeat(300_000) }), fetch: request }))
      .rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' })
    expect(requests).toBe(0)
  })

  it('handles timeout signals and invalid or oversized server responses', async () => {
    const ctx = await context()
    const result = await demoDetector({ projectDirectory: ctx.directory })
    const record = { cacheVersion: 1 as const, sessionId: ctx.options.sessionId, server: ctx.options.server, result }
    await expect(uploadResult(record, ctx.options.token, { timeoutMs: 100, fetch: async (_url, init) => {
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))
    } })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    for (const body of ['not json', 'x'.repeat(300_000)]) {
      await expect(uploadResult(record, ctx.options.token, { fetch: async () => new Response(body) }))
        .rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
    }
  })

  it('does not expose token text in argument errors', async () => {
    let code: number | string | undefined
    let stderr = ''
    try { await exec(process.execPath, [binary, 'scan', '--token', 'sensitive_test_token', '--secret-option', 'sensitive_test_token']) }
    catch (error) {
      const failed = error as { code: number; stderr: string }
      code = failed.code; stderr = failed.stderr
    }
    expect(code).toBe(2)
    expect(stderr).not.toContain('sensitive_test_token')
    expect(stderr).toContain('命令参数')
    expect((await exec(process.execPath, [binary, '--help'])).stdout).toContain('scan')
  })

  it('never reports success from the executable when no real detector is installed', async () => {
    const ctx = await context()
    await expect(exec(process.execPath, [binary, 'scan', '--session', ctx.options.sessionId,
      '--token', ctx.options.token, '--server', ctx.options.server, '--cwd', ctx.directory]))
      .rejects.toMatchObject({ code: 1 })
    expect(ctx.service.getSession(ctx.options.sessionId).status).toBe('waiting_cli')
  })

  it('only accepts secure origins or loopback and refuses arbitrary files as retry input', async () => {
    for (const server of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=secret']) {
      expect(serverUrlSchema.safeParse(server).success).toBe(false)
    }
    const ctx = await context()
    await writeFile(path.join(ctx.directory, '.env'), 'SECRET=local')
    await expect(runRetry(path.join(ctx.directory, '.env'), { token: ctx.options.token })).rejects.toMatchObject({ code: 'CACHE_INVALID' })
    await writeFile(path.join(ctx.directory, 'source.json'), '{"source":"not a scan snapshot"}')
    await expect(runRetry(path.join(ctx.directory, 'source.json'), { token: ctx.options.token })).rejects.toMatchObject({ code: 'CACHE_INVALID' })
  })
})
