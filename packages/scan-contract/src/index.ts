import { z } from 'zod'

const relativePath = z
  .string()
  .min(1)
  .refine((value) => !/^(?:[A-Za-z]:[\\/]|[\\/]{2}|[\\/])/.test(value), {
    message: 'Path must be relative to the detected project root.',
  })

export const scanSessionStatusSchema = z.enum([
  'created',
  'waiting_cli',
  'running',
  'completed',
  'failed',
  'expired',
])

export const scanResultStatusSchema = z.enum(['passed', 'failed'])

export const supportStatusSchema = z.enum([
  'supported',
  'partially_supported',
  'unsupported',
  'needs_action',
])

export const packageManagerSchema = z.object({
  name: z.enum(['npm', 'pnpm', 'yarn', 'bun']),
  lockfile: relativePath,
})

export const frameworkResultSchema = z.object({
  name: z.literal('react'),
  version: z.string().min(1),
  status: scanResultStatusSchema,
})

export const tailwindResultSchema = z.object({
  version: z.string().min(1),
  cssEntry: relativePath,
  themeFound: z.boolean(),
  themeImported: z.boolean(),
  status: scanResultStatusSchema,
})

export const eslintResultSchema = z.object({
  version: z.string().min(1),
  configFound: z.boolean(),
  configLoadable: z.boolean(),
  status: scanResultStatusSchema,
})

export const shadcnResultSchema = z.object({
  status: z.enum(['official', 'partial', 'unknown']),
  cssEntry: relativePath.nullable(),
  components: z.array(z.string().min(1)),
  preset: z.string().min(1).nullable(),
})

export const componentLibrarySchema = z.object({
  name: z.string().min(1),
  status: z.enum(['detected', 'candidate', 'unsupported']),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(z.string().min(1)).min(1),
})

export const supportResultSchema = z.object({
  status: supportStatusSchema,
  blockingIssues: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
})

export const scanWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['warning', 'error']),
})

export const scanResultSchema = z.object({
  schemaVersion: z.literal(1),
  cliVersion: z.string().min(1),
  packageManager: packageManagerSchema,
  framework: frameworkResultSchema,
  tailwind: tailwindResultSchema,
  eslint: eslintResultSchema,
  shadcn: shadcnResultSchema,
  componentLibraries: z.array(componentLibrarySchema),
  support: supportResultSchema,
  warnings: z.array(scanWarningSchema),
})

export const createScanSessionRequestSchema = z.object({
  projectId: z.string().min(1),
})

export const createScanSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  command: z.string().min(1),
})

export const uploadScanResultRequestSchema = z.object({
  result: scanResultSchema,
})

export const uploadScanResultResponseSchema = z.object({
  accepted: z.literal(true),
  status: z.literal('completed'),
})

export const scanSessionErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
})

export const getScanSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  status: scanSessionStatusSchema,
  result: scanResultSchema.nullable(),
  error: scanSessionErrorSchema.nullable(),
})

export type ScanSessionStatus = z.infer<typeof scanSessionStatusSchema>
export type ScanResult = z.infer<typeof scanResultSchema>
export type CreateScanSessionRequest = z.infer<
  typeof createScanSessionRequestSchema
>
export type CreateScanSessionResponse = z.infer<
  typeof createScanSessionResponseSchema
>
export type UploadScanResultRequest = z.infer<
  typeof uploadScanResultRequestSchema
>
export type UploadScanResultResponse = z.infer<
  typeof uploadScanResultResponseSchema
>
export type GetScanSessionResponse = z.infer<
  typeof getScanSessionResponseSchema
>

export const scanContract = {
  createScanSessionRequestSchema,
  createScanSessionResponseSchema,
  getScanSessionResponseSchema,
  scanResultSchema,
  scanSessionStatusSchema,
  uploadScanResultRequestSchema,
  uploadScanResultResponseSchema,
} as const
