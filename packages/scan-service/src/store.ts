import Database from 'better-sqlite3'
import type { ScanResult, ScanSessionStatus } from '@design-system-guardrails/scan-contract'

export type StoredScanSession = {
  id: string
  projectId: string
  tokenHash: string
  tokenExpiresAt: string
  status: ScanSessionStatus
  createdAt: string
  tokenUsedAt: string | null
  result: ScanResult | null
  error: { code: string; message: string } | null
}

export interface ScanSessionStore {
  create(session: StoredScanSession): void
  get(id: string): StoredScanSession | null
  update(session: StoredScanSession): void
}

export class InMemoryScanSessionStore implements ScanSessionStore {
  private readonly sessions = new Map<string, StoredScanSession>()

  create(session: StoredScanSession) {
    this.sessions.set(session.id, structuredClone(session))
  }

  get(id: string) {
    const session = this.sessions.get(id)
    return session ? structuredClone(session) : null
  }

  update(session: StoredScanSession) {
    if (!this.sessions.has(session.id)) {
      throw new Error(`Unknown scan session: ${session.id}`)
    }
    this.sessions.set(session.id, structuredClone(session))
  }
}

type SessionRow = {
  id: string
  project_id: string
  token_hash: string
  token_expires_at: string
  status: ScanSessionStatus
  created_at: string
  token_used_at: string | null
  result_json: string | null
  error_json: string | null
}

export class SqliteScanSessionStore implements ScanSessionStore {
  private readonly database: Database.Database

  constructor(filePath: string) {
    this.database = new Database(filePath)
    this.database.pragma('journal_mode = WAL')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS scan_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        token_expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        token_used_at TEXT,
        result_json TEXT,
        error_json TEXT
      )
    `)
  }

  create(session: StoredScanSession) {
    this.database
      .prepare(
        `INSERT INTO scan_sessions
          (id, project_id, token_hash, token_expires_at, status, created_at, token_used_at, result_json, error_json)
         VALUES (@id, @projectId, @tokenHash, @tokenExpiresAt, @status, @createdAt, @tokenUsedAt, @resultJson, @errorJson)`,
      )
      .run(this.toRowParams(session))
  }

  get(id: string) {
    const row = this.database
      .prepare('SELECT * FROM scan_sessions WHERE id = ?')
      .get(id) as SessionRow | undefined
    return row ? this.fromRow(row) : null
  }

  update(session: StoredScanSession) {
    const result = this.database
      .prepare(
        `UPDATE scan_sessions SET
          project_id = @projectId,
          token_hash = @tokenHash,
          token_expires_at = @tokenExpiresAt,
          status = @status,
          created_at = @createdAt,
          token_used_at = @tokenUsedAt,
          result_json = @resultJson,
          error_json = @errorJson
         WHERE id = @id`,
      )
      .run(this.toRowParams(session))

    if (result.changes !== 1) {
      throw new Error(`Unknown scan session: ${session.id}`)
    }
  }

  close() {
    this.database.close()
  }

  private toRowParams(session: StoredScanSession) {
    return {
      id: session.id,
      projectId: session.projectId,
      tokenHash: session.tokenHash,
      tokenExpiresAt: session.tokenExpiresAt,
      status: session.status,
      createdAt: session.createdAt,
      tokenUsedAt: session.tokenUsedAt,
      resultJson: session.result ? JSON.stringify(session.result) : null,
      errorJson: session.error ? JSON.stringify(session.error) : null,
    }
  }

  private fromRow(row: SessionRow): StoredScanSession {
    return {
      id: row.id,
      projectId: row.project_id,
      tokenHash: row.token_hash,
      tokenExpiresAt: row.token_expires_at,
      status: row.status,
      createdAt: row.created_at,
      tokenUsedAt: row.token_used_at,
      result: row.result_json ? JSON.parse(row.result_json) as ScanResult : null,
      error: row.error_json
        ? JSON.parse(row.error_json) as StoredScanSession['error']
        : null,
    }
  }
}
