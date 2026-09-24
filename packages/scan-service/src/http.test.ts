import { afterEach, describe, expect, it } from 'vitest'
import { createScanHttpApp } from './http.js'
import { ScanService } from './service.js'
import { InMemoryScanSessionStore } from './store.js'
import { validScanResult } from './test-utils.js'

const apps: { close: () => Promise<void> }[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('scan HTTP API', () => {
  it('creates, uploads, and reads a scan session', async () => {
    const app = await createScanHttpApp({
      service: new ScanService({ store: new InMemoryScanSessionStore() }),
    })
    apps.push(app)

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/scan-sessions',
      payload: { projectId: 'project_123' },
    })
    expect(createdResponse.statusCode).toBe(201)
    const created = createdResponse.json<{ sessionId: string; token: string }>()

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/scan-sessions/${created.sessionId}/result`,
      headers: { authorization: `Bearer ${created.token}` },
      payload: { result: validScanResult },
    })
    expect(uploadResponse.statusCode).toBe(202)

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/scan-sessions/${created.sessionId}`,
    })
    expect(statusResponse.statusCode).toBe(200)
    expect(statusResponse.json().status).toBe('completed')
  })

  it('rejects missing and reused upload credentials', async () => {
    const app = await createScanHttpApp({
      service: new ScanService({ store: new InMemoryScanSessionStore() }),
    })
    apps.push(app)

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/scan-sessions',
      payload: { projectId: 'project_123' },
    })
    const created = createdResponse.json<{ sessionId: string; token: string }>()

    const missingTokenResponse = await app.inject({
      method: 'POST',
      url: `/api/scan-sessions/${created.sessionId}/result`,
      payload: { result: validScanResult },
    })
    expect(missingTokenResponse.statusCode).toBe(401)

    const firstUpload = await app.inject({
      method: 'POST',
      url: `/api/scan-sessions/${created.sessionId}/result`,
      headers: { authorization: `Bearer ${created.token}` },
      payload: { result: validScanResult },
    })
    expect(firstUpload.statusCode).toBe(202)

    const reusedUpload = await app.inject({
      method: 'POST',
      url: `/api/scan-sessions/${created.sessionId}/result`,
      headers: { authorization: `Bearer ${created.token}` },
      payload: { result: validScanResult },
    })
    expect(reusedUpload.statusCode).toBe(409)
  })
})
