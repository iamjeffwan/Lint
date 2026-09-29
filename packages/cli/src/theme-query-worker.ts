import path from 'node:path'
import { project } from '@shadcn/lint'

// 独立进程清除上次项目查询的缓存；不导入 ESLint、不读取源码进行 lint。
try {
  const root = process.argv[2]
  if (!root || !path.isAbsolute(root)) throw new Error('Root required')
  process.stdout.write(JSON.stringify({ theme: project.themeFileFor(path.join(root, 'package.json')) }))
} catch {
  // 不把插件原始错误或配置正文转发给父进程。
  process.exitCode = 1
}
