import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createScanHttpApp, ScanService, SqliteScanSessionStore } from '@design-system-guardrails/scan-service'
import { createScanSessionResponseSchema, getScanSessionResponseSchema } from '@design-system-guardrails/scan-contract'

// 先在独立测试项目安装本地压缩包。本脚本只调用已安装的命令，不从网上找包。
const project = path.resolve(process.argv[2] ?? '../lint-shadcn-tailwind-test')
const npmEntry = process.env.npm_execpath
assert(npmEntry, 'Run this verification using npm run verify:cli-package')
const directory = await mkdtemp(path.resolve('artifacts', 'installed-cli-'))
const database = path.join(directory, 'sessions.sqlite')
const cache = path.join(directory, 'cache')
const beforeManifest = await readFile(path.join(project, 'package.json'), 'utf8')
const installed = JSON.parse(await readFile(path.join(project, 'node_modules/@design-guardrails/cli/package.json'), 'utf8'))
assert.equal(installed.name, '@design-guardrails/cli')
assert.equal(installed.dependencies, undefined, 'Packaged CLI must not fetch private workspace packages')
const store = new SqliteScanSessionStore(database)
const app = await createScanHttpApp({ service: new ScanService({ store }) })
const server = await app.listen({ host: '127.0.0.1', port: 0 })

async function execute(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [npmEntry!, 'exec', '--offline', '--', 'design-guardrails', ...args], {
      cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const timer = setTimeout(() => child.kill(), 30_000)
    child.stdout.on('data', (chunk) => { output += String(chunk) })
    child.stderr.on('data', (chunk) => { output += String(chunk) })
    child.on('error', () => { clearTimeout(timer); reject(new Error('Installed CLI failed to start')) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`Installed CLI failed with exit code ${code}; raw arguments withheld`))
    })
  })
}
try {
  const response = await fetch(`${server}/api/scan-sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'installed_cli_smoke' }),
  })
  assert.equal(response.status, 201)
  const created = createScanSessionResponseSchema.parse(await response.json())
  const output = await execute(['scan', '--demo', '--session', created.sessionId, '--token', created.token,
    '--server', server, '--cache-dir', cache])
  assert(output.includes('服务端已接收结果'))
  assert(!output.includes(created.token), 'CLI output must not contain upload token')
  const queried = await fetch(`${server}/api/scan-sessions/${created.sessionId}`)
  const task = getScanSessionResponseSchema.parse(await queried.json())
  assert.equal(task.status, 'completed')
  assert.equal(task.result?.warnings[0]?.code, 'DEMO_ONLY')
  const [filename] = await readdir(cache)
  assert(filename)
  const file = path.join(cache, filename)
  const cachedText = await readFile(file, 'utf8')
  assert(!cachedText.includes(created.token))
  assert(!cachedText.includes(project))
  const retried = await execute(['retry', '--file', file, '--token', created.token])
  assert(retried.includes('此前已保存相同结果'))
  assert.equal(await readFile(path.join(project, 'package.json'), 'utf8'), beforeManifest)
  await app.close()
  store.close()
  const reopened = new SqliteScanSessionStore(database)
  try { assert.equal(reopened.get(created.sessionId)?.status, 'completed') }
  finally { reopened.close() }
  const report = {
    installedPackage: installed.name, version: installed.version, mode: 'demo',
    createStatus: response.status, finalStatus: task.status,
    duplicateConfirmed: true, persistedAfterReopen: true,
    tokenAbsentFromCacheAndOutput: true, projectManifestUnchanged: true,
    verifiedAt: new Date().toISOString(),
  }
  await writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await app.close()
  try { store.close() } catch { /* 已在重开数据库验证前关闭。 */ }
}
