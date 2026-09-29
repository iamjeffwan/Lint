import { Command, CommanderError, InvalidArgumentError } from 'commander'
import { CliError } from './errors.js'
import { demoDetector } from './demo.js'
import { runScan, runRetry } from './runner.js'
import { createProjectDetector } from './detect/index.js'

declare const __CLI_VERSION__: string
const program = new Command()
  .name('design-guardrails')
  .description('本地样式框架检查、官方主题定位与结果回传。')
  .version(__CLI_VERSION__)
  .exitOverride()
  // 参数中可能带有令牌，不回显解析器生成的原始错误。
  .configureOutput({ outputError: () => {} })

function timeout(value: string) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 100 || n > 120_000) throw new InvalidArgumentError('无效超时')
  return n
}
const log = (message: string) => process.stderr.write(`${message}\n`)
program.command('scan')
  .description('检查实际样式框架版本，查询主题路径并回传')
  .requiredOption('--session <id>', '检测任务编号')
  .requiredOption('--token <token>', '一次性上传令牌，不写入快照')
  .option('--server <url>', '服务地址', 'http://127.0.0.1:3001')
  .option('--cwd <directory>', '项目目录，默认当前目录')
  .option('--cache-dir <directory>', '本地结果快照目录')
  .option('--timeout <ms>', '单次网络请求超时毫秒数', timeout, 15_000)
  .option('--demo', '只验证通信，不读取项目源码或配置')
  .action(async (options) => {
    if (options.demo) log('通信演示模式：上传的是测试数据，不代表真实项目检测结论。')
    await runScan({
      sessionId: options.session, token: options.token, server: options.server,
      directory: options.cwd, cacheDirectory: options.cacheDir, timeoutMs: options.timeout,
    }, { log, detector: options.demo ? demoDetector : createProjectDetector(__CLI_VERSION__) })
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
