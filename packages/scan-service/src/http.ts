import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  createScanSessionRequestSchema,
  uploadScanResultRequestSchema,
} from '@design-system-guardrails/scan-contract'
import { ScanService, ScanServiceError } from './service.js'

export type CreateScanHttpAppOptions = {
  service: ScanService
  corsOrigin?: string | boolean
  logger?: boolean
}

export async function createScanHttpApp(
  options: CreateScanHttpAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false })
  await app.register(cors, { origin: options.corsOrigin ?? true })

  app.post('/api/scan-sessions', async (request, reply) => {
    try {
      const body = createScanSessionRequestSchema.parse(request.body)
      return reply.code(201).send(options.service.createSession(body))
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post<{ Params: { sessionId: string } }>(
    '/api/scan-sessions/:sessionId/result',
    async (request, reply) => {
      try {
        const token = readBearerToken(request.headers.authorization)
        const body = uploadScanResultRequestSchema.parse(request.body)
        return reply
          .code(202)
          .send(options.service.uploadResult(request.params.sessionId, token, body.result))
      } catch (error) {
        return sendError(reply, error)
      }
    },
  )

  app.get<{ Params: { sessionId: string } }>(
    '/api/scan-sessions/:sessionId',
    async (request, reply) => {
      try {
        return reply.send(options.service.getSession(request.params.sessionId))
      } catch (error) {
        return sendError(reply, error)
      }
    },
  )

  return app
}

function readBearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match) {
    throw new ScanServiceError(
      'SCAN_TOKEN_MISSING',
      401,
      'A Bearer upload token is required.',
    )
  }
  return match[1]
}

function sendError(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof ScanServiceError) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message },
    })
  }

  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
  })
}
