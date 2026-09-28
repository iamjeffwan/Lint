import cors from '@fastify/cors'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import {
  createScanSessionRequestSchema,
  uploadScanResultRequestSchema,
} from '@design-system-guardrails/scan-contract'
import { ScanService, ScanServiceError } from './service.js'

export type CreateScanHttpAppOptions = {
  service: ScanService
  corsOrigin?: string | boolean
  logger?: boolean
  bodyLimitBytes?: number
  publicOrigin?: string
}

export async function createScanHttpApp(
  options: CreateScanHttpAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.bodyLimitBytes ?? 256 * 1024,
  })
  await app.register(cors, { origin: options.corsOrigin ?? false })
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store') })

  app.post('/api/scan-sessions', async (request, reply) => {
    try {
      const body = createScanSessionRequestSchema.parse(request.body)
      // 公开部署需配置 PUBLIC_ORIGIN；本地直接使用实际监听端口，不信任 Host 头。
      const port = request.raw.socket.localPort
      const origin = options.publicOrigin ?? `http://127.0.0.1:${port ?? 3001}`
      const url = new URL(origin)
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (url.origin !== origin || url.username || url.password ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
        throw new Error('Invalid public origin')
      }
      return reply.code(201).send(options.service.createSession(body, origin))
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

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ScanServiceError) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message },
    })
  }

  if (error instanceof ZodError) return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
  })
  reply.log.error({ code: 'SCAN_INTERNAL_ERROR' }, 'Scan request failed internally')
  return reply.code(500).send({ error: { code: 'SCAN_INTERNAL_ERROR', message: 'The service could not complete the request.' } })
}
