import { describe, expect, it } from 'vitest'
import { scanResultSchema, getScanSessionResponseSchema, createScanSessionResponseSchema } from './index.js'

const minimal = {
  schemaVersion: 2,
  cliVersion: '0.1.0',
  tailwind: { status: 'not_installed', version: null },
  theme: { status: 'not_found', path: null, source: null },
  shadcn: { status: 'not_checked' },
  componentLibraries: [],
  support: { status: 'needs_action', blockingIssues: ['样式框架未安装'], warnings: [] },
  warnings: [],
}

describe('scan contract', () => {
  it('accepts missing dependencies and theme without inventing framework or lint facts', () => {
    expect(scanResultSchema.parse(minimal)).toEqual(minimal)
  })
  it('rejects obsolete fields, old schema, and arbitrary uploaded source', () => {
    for (const extra of [{ framework: { name: 'react' } }, { eslint: {} }, { source: 'private' }, { schemaVersion: 1 }]) {
      expect(scanResultSchema.safeParse({ ...minimal, ...extra }).success).toBe(false)
    }
  })
  it.each(['C:\\secret\\index.css', 'C:index.css', '../index.css', 'src/../../index.css', '/tmp/index.css', '//host/file.css', 'src\\..\\file.css'])('rejects out-of-project path %s', (path) => {
    expect(scanResultSchema.safeParse({ ...minimal, theme: { status: 'located', source: 'official_query', path } }).success).toBe(false)
  })
  it('accepts actual theme paths without claiming they are imported everywhere', () => {
    expect(scanResultSchema.safeParse({ ...minimal, theme: { status: 'located', source: 'official_query', path: 'src/theme.css' } }).success).toBe(true)
    expect(scanResultSchema.safeParse({ ...minimal, theme: { status: 'located', source: 'official_query', path: null } }).success).toBe(false)
    expect(scanResultSchema.safeParse({ ...minimal, tailwind: { status: 'installed', version: null } }).success).toBe(false)
  })
  it('accepts waiting tasks, rejects unimplemented running state', () => {
    const task = { sessionId: 'scan_123', status: 'waiting_cli', result: null, error: null }
    expect(getScanSessionResponseSchema.parse(task)).toEqual(task)
    expect(getScanSessionResponseSchema.safeParse({ ...task, status: 'running' }).success).toBe(false)
  })
  it('requires an offset-aware expiration time', () => {
    expect(createScanSessionResponseSchema.safeParse({ sessionId: 'scan_123', token: 'token', expiresAt: '2026-09-24T12:00:00', command: 'example' }).success).toBe(false)
  })
})
