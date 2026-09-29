import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { minimatch } from 'minimatch'
import { parseDocument } from 'yaml'

export class ProjectIssue extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export async function exists(file: string) {
  try { await lstat(file); return true }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function readMetadata(file: string): Promise<Record<string, unknown>> {
  const info = await lstat(file)
  if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Invalid metadata file')
  const value: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata object')
  return value as Record<string, unknown>
}

export function isInside(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function patterns(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(p => typeof p === 'string')) {
    throw new ProjectIssue('WORKSPACE_CONFIG_INVALID', '工作区配置无法确认，请检查声明。')
  }
  return value
}

async function workspacePatterns(directory: string, metadata: Record<string, unknown> | null) {
  let result: string[] = []
  if (metadata?.workspaces !== undefined) {
    const entry = metadata.workspaces
    result = patterns(entry && typeof entry === 'object' && !Array.isArray(entry)
      ? (entry as Record<string, unknown>).packages : entry)
  }
  const pnpmFile = path.join(directory, 'pnpm-workspace.yaml')
  if (await exists(pnpmFile)) {
    const info = await lstat(pnpmFile)
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Invalid workspace metadata')
    const document = parseDocument(await readFile(pnpmFile, 'utf8'))
    if (document.errors.length) throw new ProjectIssue('WORKSPACE_CONFIG_INVALID', '工作区配置无法确认，请检查声明。')
    const value = document.toJS() as Record<string, unknown> | null
    if (value?.packages !== undefined) result.push(...patterns(value.packages))
  }
  return result
}

function isMember(relative: string, entries: string[]) {
  const included = entries.filter(p => !p.startsWith('!')).some(p => minimatch(relative, p, { dot: true }))
  return included && !entries.filter(p => p.startsWith('!')).some(p => minimatch(relative, p.slice(1), { dot: true }))
}

export async function locateProject(input: string): Promise<string> {
  let current = await realpath(input)
  let root: string | null = null
  for (;;) {
    if (path.basename(current) === 'node_modules') {
      throw new ProjectIssue('DEPENDENCY_DIRECTORY', '请在用户项目中执行，不要在依赖目录中执行。')
    }
    const manifest = path.join(current, 'package.json')
    let metadata: Record<string, unknown> | null = null
    if (await exists(manifest)) {
      try { metadata = await readMetadata(manifest) }
      catch { throw new ProjectIssue('PACKAGE_INVALID', '项目包清单无效或不可读取。') }
      root ??= current
    }
    const entries = await workspacePatterns(current, metadata)
    if (root && ((root === current && entries.some(p => !p.startsWith('!') && p !== '.')) ||
      isMember(path.relative(current, root).split(path.sep).join('/'), entries))) {
      throw new ProjectIssue('MONOREPO_UNSUPPORTED', '检测到多包仓库，当前阶段暂不支持，已停止后续查询。')
    }
    // 仓库边界内检查父工作区；不会跨越独立嵌套仓库去继承无关配置。
    if (await exists(path.join(current, '.git'))) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  if (!root) throw new ProjectIssue('PROJECT_NOT_FOUND', '未找到项目包清单，请指定项目目录。')
  return root
}
