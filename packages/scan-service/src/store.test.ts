import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteScanSessionStore } from './store.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('SqliteScanSessionStore', () => {
  it('keeps a task after opening a new store for the same database', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'scan-service-'))
    temporaryDirectories.push(directory)
    const databasePath = path.join(directory, 'sessions.sqlite')
    const first = new SqliteScanSessionStore(databasePath)

    first.create({
      id: 'scan_persisted',
      projectId: 'project_123',
      tokenHash: 'hash',
      tokenExpiresAt: '2026-09-24T12:10:00.000Z',
      status: 'waiting_cli',
      createdAt: '2026-09-24T12:00:00.000Z',
      tokenUsedAt: null,
      result: null,
      error: null,
    })
    first.close()

    const second = new SqliteScanSessionStore(databasePath)
    expect(second.get('scan_persisted')?.projectId).toBe('project_123')
    second.close()
  })
})
