import { createRequire } from 'node:module'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { valid } from 'semver'
import type { ScanResult } from '@design-system-guardrails/scan-contract'
import { exists, isInside, readMetadata } from './project.js'

export async function findTailwind(root: string): Promise<ScanResult['tailwind']> {
  try {
    const local = path.join(root, 'node_modules/tailwindcss/package.json')
    if (await exists(local)) {
      // 只读取目标项目明确链接的包，兼容常见 pnpm 符号链接布局。
      const file = await realpath(local)
      const metadata = await readMetadata(file)
      if (metadata.name !== 'tailwindcss' || typeof metadata.version !== 'string' || !valid(metadata.version)) {
        return { status: 'unknown', version: null }
      }
      return { status: 'installed', version: metadata.version }
    }
    if (await exists(path.join(root, '.pnp.cjs'))) return { status: 'unknown', version: null }
    const resolver = createRequire(path.join(root, 'package.json'))
    try {
      const resolved = resolver.resolve('tailwindcss/package.json')
      if (isInside(root, resolved)) return { status: 'unknown', version: null }
      // 不把父目录或本工具的安装包当成目标项目依赖。
    } catch { /* 未解析到项目本地包。 */ }
    return { status: 'not_installed', version: null }
  } catch { return { status: 'unknown', version: null } }
}
