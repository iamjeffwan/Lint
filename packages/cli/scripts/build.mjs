import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(await readFile('package.json', 'utf8'))

await build({
  entryPoints: ['src/main.ts', 'src/theme-query-worker.ts'],
  outdir: 'dist',
  external: ['@shadcn/lint'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as createBundleRequire } from "node:module"; const require = createBundleRequire(import.meta.url);' },
  define: { __CLI_VERSION__: JSON.stringify(manifest.version) },
})

// 打包进可执行文件的第三方库保留其许可文本。
const notices = await Promise.all(['commander', 'zod', 'semver', 'yaml', 'minimatch', 'brace-expansion', 'balanced-match'].map(async (name) => {
  const entry = require.resolve(name)
  let dir = path.dirname(entry)
  let license
  while (!license) {
    for (const file of ['LICENSE', 'LICENSE.md']) {
      try { license = await readFile(path.join(dir, file), 'utf8'); break } catch {}
    }
    if (license) break
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`License not found: ${name}`)
    dir = parent
  }
  return `${name}\n${license}`
}))
await writeFile('dist/THIRD_PARTY_LICENSES.txt', notices.join('\n\n'), 'utf8')
