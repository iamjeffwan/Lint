import { scanResultSchema } from '@design-system-guardrails/scan-contract'

export const validScanResult = scanResultSchema.parse({
  schemaVersion: 1,
  cliVersion: '0.1.0',
  packageManager: { name: 'npm', lockfile: 'package-lock.json' },
  framework: { name: 'react', version: '19.2.8', status: 'passed' },
  tailwind: {
    version: '4.3.3',
    cssEntry: 'src/index.css',
    themeFound: true,
    themeImported: true,
    status: 'passed',
  },
  eslint: {
    version: '10.11.0',
    configFound: true,
    configLoadable: true,
    status: 'passed',
  },
  shadcn: {
    status: 'official',
    cssEntry: 'src/index.css',
    components: ['button'],
    preset: 'base-nova',
  },
  componentLibraries: [],
  support: { status: 'supported', blockingIssues: [], warnings: [] },
  warnings: [],
})
