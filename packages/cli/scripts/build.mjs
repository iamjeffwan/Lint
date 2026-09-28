import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(await readFile('package.json', 'utf8'))

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  define: { __CLI_VERSION__: JSON.stringify(manifest.version) },
})

// 打包进可执行文件的第三方库保留其许可文本。
const notices = await Promise.all(['commander', 'zod'].map(async (name) => {
  const entry = require.resolve(name)
  const license = await readFile(path.join(path.dirname(entry), 'LICENSE'), 'utf8')
  return `${name}\n${license}`
}))
await writeFile('dist/THIRD_PARTY_LICENSES.txt', notices.join('\n\n'), 'utf8')
