import { describe, expect, it } from 'vitest'
import {
  createScanSessionResponseSchema,
  getScanSessionResponseSchema,
  scanResultSchema,
  uploadScanResultRequestSchema,
} from './index.js'

const validResult = {
  schemaVersion: 1 as const,
  cliVersion: '0.1.0',
  packageManager: {
    name: 'npm' as const,
    lockfile: 'package-lock.json',
  },
  framework: {
    name: 'react' as const,
    version: '19.2.8',
    status: 'passed' as const,
  },
  tailwind: {
    version: '4.3.3',
    cssEntry: 'src/index.css',
    themeFound: true,
    themeImported: true,
    status: 'passed' as const,
  },
  eslint: {
    version: '10.11.0',
    configFound: true,
    configLoadable: true,
    status: 'passed' as const,
  },
  shadcn: {
    status: 'official' as const,
    cssEntry: 'src/index.css',
    components: ['button', 'card', 'input'],
    preset: 'base-nova',
  },
  componentLibraries: [
    {
      name: 'shadcn/ui',
      status: 'detected' as const,
      confidence: 'high' as const,
      evidence: ['official shadcn CLI info --json'],
    },
  ],
  support: {
    status: 'supported' as const,
    blockingIssues: [],
    warnings: [],
  },
  warnings: [],
}

describe('scan contract', () => {
  it('accepts a complete environment result', () => {
    expect(scanResultSchema.parse(validResult)).toEqual(validResult)
    expect(
      uploadScanResultRequestSchema.parse({ result: validResult }).result,
    ).toEqual(validResult)
  })

  it('rejects absolute paths so local paths do not leave the project', () => {
    expect(() =>
      scanResultSchema.parse({
        ...validResult,
        tailwind: { ...validResult.tailwind, cssEntry: 'C:\\secret\\index.css' },
      }),
    ).toThrow(/relative to the detected project root/)
  })

  it('accepts a nullable result while a task is waiting', () => {
    expect(
      getScanSessionResponseSchema.parse({
        sessionId: 'scan_123',
        status: 'waiting_cli',
        result: null,
        error: null,
      }),
    ).toEqual({
      sessionId: 'scan_123',
      status: 'waiting_cli',
      result: null,
      error: null,
    })
  })

  it('requires an offset-aware expiration time', () => {
    expect(() =>
      createScanSessionResponseSchema.parse({
        sessionId: 'scan_123',
        token: 'token',
        expiresAt: '2026-09-24T12:00:00',
        command: 'npx @design-guardrails/cli scan',
      }),
    ).toThrow()
  })
})
