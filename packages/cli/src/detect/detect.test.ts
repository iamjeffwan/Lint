import { mkdir, mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { locateProject } from './project.js'
import { findTailwind } from './tailwind.js'
import { findTheme, type ThemeQuery } from './theme.js'

const execute = promisify(execFile)
const repo = process.cwd()
const worker = path.join(repo, 'packages/cli/dist/theme-query-worker.js')
beforeAll(async () => {
  await mkdir('artifacts', { recursive: true })
  await execute(process.execPath, ['scripts/build.mjs'], { cwd: path.join(repo, 'packages/cli') })
})
async function fixture(manifest: object = { name: 'test-project' }) {
  const root = await mkdtemp(path.resolve('artifacts', 'detection-'))
  await mkdir(path.join(root, '.git'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest))
  return root
}
async function file(root: string, name: string, text: string) {
  const target = path.join(root, name)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, text)
}
const query: ThemeQuery = async root => {
  const { stdout, stderr } = await execute(process.execPath, [worker, root], { timeout: 15_000, cwd: root })
  return { ...JSON.parse(stdout), warned: !!stderr }
}

describe('project scope', () => {
  it('finds nearest application from a nested directory and stops at the repo boundary', async () => {
    const root = await fixture()
    await mkdir(path.join(root, 'src/pages'), { recursive: true })
    expect(await locateProject(path.join(root, 'src/pages'))).toBe(root)
    const empty = await mkdtemp(path.resolve('artifacts', 'empty-'))
    await mkdir(path.join(empty, '.git'))
    await expect(locateProject(empty)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })
  it('blocks npm workspace root and its child, but not an unrelated nested package', async () => {
    const root = await fixture({ name: 'workspace', workspaces: ['apps/*', '!apps/excluded'] })
    await file(root, 'apps/web/package.json', '{"name":"web"}')
    await expect(locateProject(root)).rejects.toMatchObject({ code: 'MONOREPO_UNSUPPORTED' })
    await expect(locateProject(path.join(root, 'apps/web'))).rejects.toMatchObject({ code: 'MONOREPO_UNSUPPORTED' })
    await file(root, 'samples/plain/package.json', '{"name":"sample"}')
    expect(await locateProject(path.join(root, 'samples/plain'))).toBe(path.join(root, 'samples/plain'))
    await file(root, 'apps/excluded/package.json', '{"name":"excluded"}')
    expect(await locateProject(path.join(root, 'apps/excluded'))).toBe(path.join(root, 'apps/excluded'))
  })
  it('distinguishes pnpm single-package settings from declared workspaces', async () => {
    const root = await fixture()
    await file(root, 'pnpm-workspace.yaml', 'onlyBuiltDependencies:\n  - esbuild\n')
    expect(await locateProject(root)).toBe(root)
    await file(root, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
    await file(root, 'apps/web/package.json', '{"name":"web"}')
    await expect(locateProject(path.join(root, 'apps/web'))).rejects.toMatchObject({ code: 'MONOREPO_UNSUPPORTED' })
  })
  it('does not ignore malformed manifests or workspace declarations', async () => {
    const root = await fixture()
    await file(root, 'package.json', '{broken')
    await expect(locateProject(root)).rejects.toMatchObject({ code: 'PACKAGE_INVALID' })
    await file(root, 'package.json', '{"workspaces":"apps/*"}')
    await expect(locateProject(root)).rejects.toMatchObject({ code: 'WORKSPACE_CONFIG_INVALID' })
  })
})

describe('target Tailwind installation', () => {
  it('does not mistake the declaration or our own ancestor dependency for an installation', async () => {
    const root = await fixture({ name: 'declared', dependencies: { tailwindcss: '^4.0.0' } })
    expect(await findTailwind(root)).toEqual({ status: 'not_installed', version: null })
    await file(root, 'node_modules/tailwindcss/package.json', '{"name":"tailwindcss","version":"3.4.17"}')
    expect(await findTailwind(root)).toEqual({ status: 'installed', version: '3.4.17' })
    await file(root, 'node_modules/tailwindcss/package.json', '{"name":"tailwindcss","version":"4.3.3"}')
    expect(await findTailwind(root)).toEqual({ status: 'installed', version: '4.3.3' })
  })
  it('supports explicit project package links and rejects corrupt version metadata', async () => {
    const root = await fixture()
    await file(root, 'node_modules/.pnpm/tailwindcss@4.3.3/node_modules/tailwindcss/package.json', '{"name":"tailwindcss","version":"4.3.3"}')
    await symlink(path.join(root, 'node_modules/.pnpm/tailwindcss@4.3.3/node_modules/tailwindcss'), path.join(root, 'node_modules/tailwindcss'), 'junction')
    expect((await findTailwind(root)).version).toBe('4.3.3')
    await file(root, 'node_modules/tailwindcss/package.json', '{"name":"tailwindcss","version":"^4"}')
    expect(await findTailwind(root)).toEqual({ status: 'unknown', version: null })
  })
  it('does not treat a plug-and-play install as a confirmed version', async () => {
    const root = await fixture()
    await file(root, '.pnp.cjs', 'module.exports = {}')
    expect(await findTailwind(root)).toEqual({ status: 'unknown', version: null })
  })
})

describe('official theme path queries without rule execution', () => {
  it('honors configured paths and works without any framework, ESLint or parser', async () => {
    const root = await fixture()
    await file(root, 'components.json', '{"tailwind":{"css":"styles/brand.css"}}')
    await file(root, 'styles/brand.css', '@theme { --color-brand: red; }')
    // 若误加载用户检查配置，本样例必然失败。
    await file(root, 'eslint.config.mjs', 'throw new Error("must never execute")')
    const theme = await findTheme(root, query)
    expect(theme.theme).toEqual({ status: 'located', path: 'styles/brand.css', source: 'official_query' })
    expect(await readFile(path.join(root, 'eslint.config.mjs'), 'utf8')).toContain('must never execute')
  })
  it('finds the default theme entry with no custom token declaration', async () => {
    const root = await fixture()
    await file(root, 'src/index.css', '@import "tailwindcss";')
    expect((await findTheme(root, query)).theme).toMatchObject({ status: 'located', path: 'src/index.css' })
  })
  it('follows the official import discovery and multiple-candidate heuristic', async () => {
    const root = await fixture()
    await file(root, 'src/index.css', '@import "./theme.css";')
    await file(root, 'src/theme.css', '@import "tailwindcss"; @theme { --color-brand: red; }')
    await file(root, 'other.css', '@import "tailwindcss"; @theme { --color-a: red; --color-b: blue; }')
    expect((await findTheme(root, query)).theme).toMatchObject({ status: 'located', path: 'other.css' })
  })
  it('returns not-found or a fallback warning instead of pretending configured paths exist', async () => {
    const empty = await fixture()
    expect((await findTheme(empty, query)).theme.status).toBe('not_found')
    await file(empty, 'components.json', '{"tailwind":{"css":"missing.css"}}')
    await file(empty, 'actual.css', '@import "tailwindcss";')
    const result = await findTheme(empty, query)
    expect(result.theme).toMatchObject({ path: 'actual.css' })
    expect(result.warnings.map(w => w.code)).toContain('THEME_QUERY_WARNING')
  })
  it('does not accept out-of-project configured paths or symlink targets', async () => {
    const outer = await fixture()
    await file(outer, 'outside.css', '@theme { --color-a: red; }')
    const root = path.join(outer, 'child')
    await file(root, 'package.json', '{"name":"child"}')
    await file(root, 'components.json', '{"tailwind":{"css":"../outside.css"}}')
    const result = await findTheme(root, query)
    expect(result.theme.status).toBe('query_failed')
    expect(result.warnings[0]?.code).toBe('THEME_OUTSIDE_PROJECT')
    expect(JSON.stringify(result)).not.toContain(outer)
  })
  it('clears official discovery caches between executions and sanitizes failures', async () => {
    const root = await fixture()
    expect((await findTheme(root, query)).theme.status).toBe('not_found')
    await file(root, 'theme.css', '@import "tailwindcss";')
    expect((await findTheme(root, query)).theme.status).toBe('located')
    const failed = await findTheme(root, async () => { throw new Error('secret path or timeout') })
    expect(failed.theme.status).toBe('query_failed')
    expect(JSON.stringify(failed)).not.toContain('secret path')
  })
})
