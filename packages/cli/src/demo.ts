import type { Detector } from './runner.js'

export const demoDetector: Detector = async () => ({
  schemaVersion: 1,
  cliVersion: '0.1.0',
  packageManager: { name: 'npm', lockfile: 'demo/package-lock.json' },
  framework: { name: 'react', version: 'demo', status: 'failed' },
  tailwind: { version: 'demo', cssEntry: 'demo/theme.css', themeFound: false, themeImported: false, status: 'failed' },
  eslint: { version: 'demo', configFound: false, configLoadable: false, status: 'failed' },
  shadcn: { status: 'unknown', cssEntry: null, components: [], preset: null },
  componentLibraries: [],
  support: { status: 'needs_action', blockingIssues: ['仅通信演示，尚未检测真实项目。'], warnings: [] },
  warnings: [{ code: 'DEMO_ONLY', message: '此结果为测试数据，不能判断项目是否受支持。', severity: 'warning' }],
})
