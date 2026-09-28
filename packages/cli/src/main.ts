import { Command, CommanderError, InvalidArgumentError } from 'commander'
import { CliError } from './errors.js'
import { demoDetector } from './demo.js'
import { runScan, runRetry } from './runner.js'

declare const __CLI_VERSION__: string
const program = new Command()
  .name('design-guardrails')
  .description('本地项目检测与结果回传；工单四仅提供显式通信演示。')
  .version(__CLI_VERSION__)
  .exitOverride()
  // 参数中可能带有令牌，不回显解析器生成的原始错误。
  .configureOutput({ outputError: () => {} })

function timeout(value: string) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 100 || n > 120_000) throw new InvalidArgumentError('无效超时')
  return n
}
function session(options: { session?: string; project?: string }) {
  if ((options.session && options.project) || (!options.session && !options.project)) {
    throw new CliError('SESSION_REQUIRED', '请指定 --session（任务编号）；旧命令也可使用 --project，但不能同时传入。')
  }
  return options.session ?? options.project!
}
const log = (message: string) => process.stderr.write(`${message}\n`)
program.command('scan')
  .description('扫描目标目录；真实检测暂未接入，请显式选择通信演示')
  .option('--session <id>', '检测任务编号')
  .option('--project <id>', '旧版任务编号参数，与 --session 二选一')
  .requiredOption('--token <token>', '一次性上传令牌，不写入快照')
  .option('--server <url>', '服务地址', 'http://127.0.0.1:3001')
  .option('--cwd <directory>', '项目目录，默认当前目录')
  .option('--cache-dir <directory>', '本地结果快照目录')
  .option('--timeout <ms>', '单次网络请求超时毫秒数', timeout, 15_000)
  .option('--demo', '只验证通信，不读取项目源码或配置')
  .action(async (options) => {
    if (options.demo) log('通信演示模式：上传的是测试数据，不代表真实项目检测结论。')
    await runScan({
      sessionId: session(options), token: options.token, server: options.server,
      directory: options.cwd, cacheDirectory: options.cacheDir, timeoutMs: options.timeout,
    }, { log, ...(options.demo ? { detector: demoDetector } : {}) })
  })

program.command('retry')
  .description('从本工具生成的快照重试上传，不重新扫描')
  .requiredOption('--file <path>', '结果快照路径')
  .requiredOption('--token <token>', '当前任务的一次性令牌')
  .option('--session <id>', '原任务过期时，指定新任务编号；服务地址沿用快照')
  .option('--cache-dir <directory>', '新任务结果快照目录')
  .option('--timeout <ms>', '单次网络请求超时毫秒数', timeout, 15_000)
  .action(async (options) => {
    await runRetry(options.file, {
      token: options.token, sessionId: options.session,
      cacheDirectory: options.cacheDir, timeoutMs: options.timeout,
    }, { log })
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.exitCode !== 0) log('命令参数不完整或无效，请用 --help（帮助）查看用法。')
    process.exitCode = error.exitCode === 0 ? 0 : 2
  } else if (error instanceof CliError) {
    log(error.message)
    process.exitCode = 1
  } else {
    log('执行失败，未确认上传成功。请检查目录权限和服务连接。')
    process.exitCode = 1
  }
}
