import { satisfies } from 'semver'
import { scanResultSchema, type ScanResult } from '@design-system-guardrails/scan-contract'
import type { Detector } from '../runner.js'
import { locateProject, ProjectIssue } from './project.js'
import { findTailwind } from './tailwind.js'
import { findTheme } from './theme.js'

export function createProjectDetector(version: string): Detector {
  return async ({ projectDirectory }) => {
    const result: ScanResult = {
      schemaVersion: 2, cliVersion: version,
      tailwind: { status: 'not_checked', version: null },
      theme: { status: 'not_checked', path: null, source: null },
      shadcn: { status: 'not_checked' }, componentLibraries: [],
      support: { status: 'needs_action', blockingIssues: [], warnings: ['组件查询与最终接入判定将在后续工单完成。'] },
      warnings: [],
    }
    let root: string
    try { root = await locateProject(projectDirectory) }
    catch (error) {
      const issue = error instanceof ProjectIssue ? error : new ProjectIssue('PROJECT_UNREADABLE', '无法读取项目范围或工作区配置。')
      result.warnings.push({ code: issue.code, message: issue.message, severity: 'error' })
      result.support.blockingIssues.push(issue.message)
      if (issue.code === 'MONOREPO_UNSUPPORTED') result.support.status = 'unsupported'
      return scanResultSchema.parse(result)
    }
    result.tailwind = await findTailwind(root)
    if (result.tailwind.status !== 'installed') {
      const message = result.tailwind.status === 'not_installed' ? '项目尚未安装样式框架。' : '无法确认项目实际安装的样式框架版本。'
      result.warnings.push({ code: 'TAILWIND_' + result.tailwind.status.toUpperCase(), message, severity: 'error' })
      result.support.blockingIssues.push(message)
    } else if (!satisfies(result.tailwind.version, '>=4.0.0 <5.0.0')) {
      const message = '当前安装版本不属于受支持的第四版稳定版本。'
      result.warnings.push({ code: 'TAILWIND_VERSION_UNSUPPORTED', message, severity: 'error' })
      result.support.blockingIssues.push(message)
    }
    // 定位与版本分别报告；缺依赖也可能已经有主题文件。
    const located = await findTheme(root)
    result.theme = located.theme
    result.warnings.push(...located.warnings)
    if (result.theme.status !== 'located') result.support.blockingIssues.push('未能定位可供确认的项目主题文件。')
    return scanResultSchema.parse(result)
  }
}
