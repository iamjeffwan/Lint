import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createScanSessionRequestSchema,
  createScanSessionResponseSchema,
  getScanSessionResponseSchema,
  scanResultSchema,
  type CreateScanSessionRequest,
  type CreateScanSessionResponse,
  type GetScanSessionResponse,
  type ScanResult,
  type ScanSessionStatus,
  type UploadScanResultResponse,
} from '@design-system-guardrails/scan-contract'
import type { ScanSessionStore, StoredScanSession } from './store.js'

const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000
const DEFAULT_CLI_PACKAGE = '@design-guardrails/cli'

export type ScanServiceOptions = {
  store: ScanSessionStore
  now?: () => Date
  tokenTtlMs?: number
  cliPackageName?: string
}

export class ScanServiceError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'ScanServiceError'
  }
}

export class ScanService {
  private readonly now: () => Date
  private readonly tokenTtlMs: number
  private readonly cliPackageName: string

  constructor(private readonly options: ScanServiceOptions) {
    this.now = options.now ?? (() => new Date())
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS
    this.cliPackageName = options.cliPackageName ?? DEFAULT_CLI_PACKAGE
  }

  createSession(input: CreateScanSessionRequest): CreateScanSessionResponse {
    const request = createScanSessionRequestSchema.parse(input)
    const createdAt = this.now()
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(createdAt.getTime() + this.tokenTtlMs)
    const sessionId = `scan_${randomBytes(12).toString('hex')}`

    const session: StoredScanSession = {
      id: sessionId,
      projectId: request.projectId,
      tokenHash: hashToken(token),
      tokenExpiresAt: expiresAt.toISOString(),
      status: 'waiting_cli',
      createdAt: createdAt.toISOString(),
      tokenUsedAt: null,
      result: null,
      error: null,
    }
    this.options.store.create(session)

    return createScanSessionResponseSchema.parse({
      sessionId,
      token,
      expiresAt: expiresAt.toISOString(),
      command: `npx ${this.cliPackageName} scan --project ${sessionId} --token ${token}`,
    })
  }

  getSession(sessionId: string): GetScanSessionResponse {
    const session = this.getRequiredSession(sessionId)
    this.expireIfNeeded(session)
    return getScanSessionResponseSchema.parse({
      sessionId: session.id,
      status: session.status,
      result: session.result,
      error: session.error,
    })
  }

  uploadResult(
    sessionId: string,
    token: string,
    result: unknown,
  ): UploadScanResultResponse {
    const session = this.getRequiredSession(sessionId)
    const now = this.now()

    if (new Date(session.tokenExpiresAt).getTime() <= now.getTime()) {
      this.expireIfNeeded(session)
      throw new ScanServiceError(
        'SCAN_SESSION_EXPIRED',
        410,
        'The scan session or upload token has expired.',
      )
    }

    if (session.tokenUsedAt) {
      throw new ScanServiceError(
        'SCAN_TOKEN_ALREADY_USED',
        409,
        'The upload token has already been used.',
      )
    }

    if (!safeEqual(hashToken(token), session.tokenHash)) {
      throw new ScanServiceError(
        'SCAN_TOKEN_INVALID',
        401,
        'The upload token is invalid.',
      )
    }

    const parsedResult = scanResultSchema.safeParse(result)
    if (!parsedResult.success) {
      throw new ScanServiceError(
        'SCAN_RESULT_INVALID',
        400,
        'The scan result does not match the scan contract.',
      )
    }

    session.status = 'completed'
    session.tokenUsedAt = now.toISOString()
    session.result = parsedResult.data
    session.error = null
    this.options.store.update(session)

    return { accepted: true, status: 'completed' }
  }

  failSession(sessionId: string, code: string, message: string) {
    const session = this.getRequiredSession(sessionId)
    if (session.status === 'completed' || session.status === 'expired') {
      return
    }
    session.status = 'failed'
    session.error = { code, message }
    this.options.store.update(session)
  }

  private getRequiredSession(sessionId: string) {
    const session = this.options.store.get(sessionId)
    if (!session) {
      throw new ScanServiceError(
        'SCAN_SESSION_NOT_FOUND',
        404,
        'The scan session was not found.',
      )
    }
    return session
  }

  private expireIfNeeded(session: StoredScanSession) {
    if (
      session.status !== 'completed' &&
      session.status !== 'failed' &&
      new Date(session.tokenExpiresAt).getTime() <= this.now().getTime()
    ) {
      session.status = 'expired'
      session.error = {
        code: 'SCAN_SESSION_EXPIRED',
        message: 'The scan session or upload token has expired.',
      }
      this.options.store.update(session)
    }
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export type { ScanResult, ScanSessionStatus }
