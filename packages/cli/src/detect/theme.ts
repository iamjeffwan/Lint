import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { ScanResult } from '@design-system-guardrails/scan-contract'
import { isInside } from './project.js'

const execute = promisify(execFile)
const outputSchema = z.strictObject({ theme: z.string().nullable() })
// 构建后的入口和查询进程在同一个目录。
const workerFile = fileURLToPath(new URL('./theme-query-worker.js', import.meta.url))
export type ThemeQuery = (root: string) => Promise<{ theme: string | null; warned: boolean }>
export const officialThemeQuery: ThemeQuery = async root => {
  const { stdout, stderr } = await execute(process.execPath, [workerFile, root], {
    cwd: root, timeout: 15_000, maxBuffer: 256 * 1024, windowsHide: true,
  })
  return { ...outputSchema.parse(JSON.parse(stdout)), warned: stderr.length > 0 }
}

export async function findTheme(root: string, query: ThemeQuery = officialThemeQuery): Promise<{
  theme: ScanResult['theme']; warnings: ScanResult['warnings'];
}> {
  try {
    const found = await query(root)
    const warnings: ScanResult['warnings'] = found.warned
      ? [{ code: 'THEME_QUERY_WARNING', message: '官方主题查询产生警告，可能使用了自动发现路径，请确认选中主题。', severity: 'warning' }]
      : []
    if (!found.theme) return { theme: { status: 'not_found', path: null, source: null }, warnings }
    const file = await realpath(found.theme)
    const actualRoot = await realpath(root)
    if (!path.isAbsolute(found.theme) || !isInside(actualRoot, file) || !(await stat(file)).isFile()) {
      return { theme: { status: 'query_failed', path: null, source: null }, warnings: [
        { code: 'THEME_OUTSIDE_PROJECT', message: '查询到的主题不在当前项目范围内，未采纳该路径。', severity: 'error' },
      ] }
    }
    return { theme: { status: 'located', path: path.relative(actualRoot, file).split(path.sep).join('/'), source: 'official_query' }, warnings }
  } catch {
    return { theme: { status: 'query_failed', path: null, source: null }, warnings: [
      { code: 'THEME_QUERY_FAILED', message: '官方主题查询失败、超时或结果不可读取，请确认项目配置。', severity: 'error' },
    ] }
  }
}
