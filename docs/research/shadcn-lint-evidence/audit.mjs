import { ESLint } from 'eslint'
import parser from '@typescript-eslint/parser'
import { plugin, project } from '@shadcn/lint'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import assert from 'node:assert/strict'

// 仅在新建的研究样例目录运行，拒绝覆盖已有项目。
for (const target of ['src', 'components.json']) {
  const exists = await access(target).then(() => true, () => false)
  assert(!exists, `Use a fresh audit directory; ${target} already exists`)
}
await mkdir('src/ui', { recursive: true })
await writeFile('src/theme.css', '@import "tailwindcss";\n@theme { --color-primary: #112233; --radius-card: 10px; }\n.legacy { padding: 13px; color: #123456; }\n')
await writeFile('src/ui/button.tsx', 'export function Button(props) { return <button {...props} /> }')
await writeFile('components.json', JSON.stringify({ tailwind: { css: 'src/theme.css' }, aliases: { ui: './src/ui' } }))
const options = {
  cwd: process.cwd(), overrideConfigFile: true,
  overrideConfig: [{
    files: ['**/*.tsx'], languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { shadcn: plugin },
    settings: { shadcn: { componentImports: ['^./ui/'] } },
    rules: Object.fromEntries(Object.keys(plugin.rules).map(name => ['shadcn/' + name, 'error'])),
  }],
}
const eslint = new ESLint(options)
const cases = {
  legalTheme: '<div className="bg-primary p-4" />',
  arbitrarySpacing: '<div className="p-[13px]" />',
  derivedSpacing: '<div className="p-3.25" />',
  rawPalette: '<div className="bg-blue-500" />',
  undefinedColor: '<div className="bg-notdeclared" />',
  undefinedVariable: '<div className="bg-(--not-declared)" />',
  builtInColor: '<div className="bg-white" />',
  plainCSSClass: '<div className="legacy" />',
  typo: '<div className="flex-cols" />',
  inlinePadding: '<div style={{padding: "13px"}} />',
  customPropPadding: '<div className="p-(--local)" style={{"--local":"13px"}} />',
  dynamicNative: 'export function X({tone}) { return <div className={`bg-${tone}`} /> }',
  dynamicComponent: 'import {Button} from "./ui/button"; export function X({tone}) { return <Button className={`bg-${tone}`} /> }',
  restyle: 'import {Button} from "./ui/button"; <Button className="p-4" />',
  styleElement: '<style>{".thing { padding: 13px }"}</style>',
}
const results = []
for (const [name, text] of Object.entries(cases)) {
  const [result] = await eslint.lintText(text, { filePath: resolve('src/check.tsx') })
  results.push({ name, text, messages: result.messages.map(m => ({ rule: m.ruleId, message: m.message, suggestions: m.suggestions?.length ?? 0 })) })
}
const fixed = new ESLint({ ...options, fix: true })
const [fixResult] = await fixed.lintText(cases.arbitrarySpacing, { filePath: resolve('src/check.tsx') })
const strict = new ESLint({ ...options, overrideConfig: [{ ...options.overrideConfig[0], rules: {
  ...options.overrideConfig[0].rules, 'shadcn/no-inline-styles': ['error', { allow: [], deny: ['--*'] }],
} }] })
const [strictResult] = await strict.lintText(cases.customPropPadding, { filePath: resolve('src/check.tsx') })
const api = {
  keys: Object.keys(project),
  themeFile: project.themeFileFor(resolve('src/check.tsx')),
  colors: [...(project.colorTokensFor(resolve('src/check.tsx')) ?? [])],
}
assert.equal(api.themeFile, resolve('src/theme.css'))
assert(api.colors.includes('primary'))
api.themeFile = relative(process.cwd(), api.themeFile).replaceAll('\\', '/')
const report = {
  packageVersion: '0.2.0', nodeVersion: process.version, rules: Object.keys(plugin.rules),
  ruleMetadata: Object.fromEntries(Object.entries(plugin.rules).map(([k, r]) => [k, { fixable: r.meta.fixable ?? null, hasSuggestions: r.meta.hasSuggestions ?? false }])),
  api, results,
  autoFix: { output: fixResult.output ?? null, errors: fixResult.errorCount },
  strictCustomProperties: strictResult.messages.map(m => ({ rule: m.ruleId, message: m.message })),
}
await writeFile('../results.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
