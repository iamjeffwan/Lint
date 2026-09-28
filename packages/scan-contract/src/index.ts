import { z } from 'zod'

const relativePath = z.string().min(1).refine((value) =>
  !/^[\\/]/.test(value) && !/[:\u0000-\u001f]/.test(value) &&
  !value.split(/[\\/]/).some((part) => part === '..' || part === '' || part === '.'),
  { message: 'Path must be relative to the detected project root.' },
)

// 只保留现有三个接口真正能够产生的任务状态。
export const scanSessionStatusSchema = z.enum(['waiting_cli', 'completed', 'expired'])
export const supportStatusSchema = z.enum(['supported', 'partially_supported', 'unsupported', 'needs_action'])

export const tailwindResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('installed'), version: z.string().min(1) }),
  z.strictObject({ status: z.enum(['not_installed', 'unknown', 'not_checked']), version: z.null() }),
])
export const themeResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('located'), path: relativePath, source: z.enum(['official_query', 'user_confirmed']) }),
  z.strictObject({ status: z.enum(['not_found', 'query_failed', 'not_checked']), path: z.null(), source: z.null() }),
])
export const shadcnResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('configured'), cssEntry: relativePath.nullable(),
    components: z.array(z.string().min(1)), preset: z.string().min(1).nullable(),
  }),
  z.strictObject({ status: z.enum(['not_configured', 'query_failed', 'not_checked']) }),
])
export const componentLibrarySchema = z.strictObject({
  name: z.string().min(1),
  status: z.enum(['detected', 'candidate', 'unsupported']),
  evidence: z.array(z.string().min(1)).min(1),
})
export const supportResultSchema = z.strictObject({
  status: supportStatusSchema,
  blockingIssues: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
})
export const scanWarningSchema = z.strictObject({
  code: z.string().min(1), message: z.string().min(1), severity: z.enum(['warning', 'error']),
})
export const scanResultSchema = z.strictObject({
  schemaVersion: z.literal(2),
  cliVersion: z.string().min(1),
  tailwind: tailwindResultSchema,
  theme: themeResultSchema,
  shadcn: shadcnResultSchema,
  componentLibraries: z.array(componentLibrarySchema),
  support: supportResultSchema,
  warnings: z.array(scanWarningSchema),
})

export const createScanSessionRequestSchema = z.strictObject({ projectId: z.string().min(1) })
export const createScanSessionResponseSchema = z.strictObject({
  sessionId: z.string().min(1), token: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }), command: z.string().min(1),
})
export const uploadScanResultRequestSchema = z.strictObject({ result: scanResultSchema })
export const uploadScanResultResponseSchema = z.strictObject({ accepted: z.literal(true), status: z.literal('completed') })
export const scanSessionErrorSchema = z.strictObject({ code: z.string().min(1), message: z.string().min(1) })
export const getScanSessionResponseSchema = z.strictObject({
  sessionId: z.string().min(1), status: scanSessionStatusSchema,
  result: scanResultSchema.nullable(), error: scanSessionErrorSchema.nullable(),
})
export type ScanSessionStatus = z.infer<typeof scanSessionStatusSchema>
export type ScanResult = z.infer<typeof scanResultSchema>
export type CreateScanSessionRequest = z.infer<typeof createScanSessionRequestSchema>
export type CreateScanSessionResponse = z.infer<typeof createScanSessionResponseSchema>
export type UploadScanResultRequest = z.infer<typeof uploadScanResultRequestSchema>
export type UploadScanResultResponse = z.infer<typeof uploadScanResultResponseSchema>
export type GetScanSessionResponse = z.infer<typeof getScanSessionResponseSchema>
