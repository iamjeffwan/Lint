import { describe, expect, it } from 'vitest'
import { ScanService, ScanServiceError } from './service.js'
import { InMemoryScanSessionStore } from './store.js'
import { validScanResult as result } from './test-utils.js'

describe('ScanService', () => {
  it('creates a waiting task with an expiring upload token', () => {
    const service = new ScanService({
      store: new InMemoryScanSessionStore(),
      now: () => new Date('2026-09-24T12:00:00.000Z'),
    })

    const created = service.createSession({ projectId: 'project_123' })

    expect(created.sessionId).toMatch(/^scan_[a-f0-9]{24}$/)
    expect(created.command).toContain(created.sessionId)
    expect(created.command).toContain(created.token)
    expect(created.expiresAt).toBe('2026-09-24T12:10:00.000Z')
    expect(service.getSession(created.sessionId).status).toBe('waiting_cli')
  })

  it('accepts a valid result once and rejects reuse of the token', () => {
    const service = new ScanService({ store: new InMemoryScanSessionStore() })
    const created = service.createSession({ projectId: 'project_123' })

    expect(service.uploadResult(created.sessionId, created.token, result)).toEqual({
      accepted: true,
      status: 'completed',
    })
    expect(service.getSession(created.sessionId).result).toEqual(result)

    expect(() => service.uploadResult(created.sessionId, created.token, result)).toThrowError(
      new ScanServiceError(
        'SCAN_TOKEN_ALREADY_USED',
        409,
        'The upload token has already been used.',
      ),
    )
  })

  it('rejects invalid tokens and invalid results', () => {
    const service = new ScanService({ store: new InMemoryScanSessionStore() })
    const created = service.createSession({ projectId: 'project_123' })

    expect(() => service.uploadResult(created.sessionId, 'wrong', result)).toThrowError(
      /upload token is invalid/,
    )
    expect(() => service.uploadResult(created.sessionId, created.token, {})).toThrowError(
      /scan result does not match/,
    )
  })

  it('expires a task before accepting an upload', () => {
    let current = new Date('2026-09-24T12:00:00.000Z')
    const service = new ScanService({
      store: new InMemoryScanSessionStore(),
      now: () => current,
      tokenTtlMs: 1_000,
    })
    const created = service.createSession({ projectId: 'project_123' })
    current = new Date('2026-09-24T12:00:02.000Z')

    expect(() => service.uploadResult(created.sessionId, created.token, result)).toThrowError(
      /expired/,
    )
    expect(service.getSession(created.sessionId).status).toBe('expired')
  })
})
