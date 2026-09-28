import type { Detector } from './runner.js'

export const demoDetector: Detector = async () => ({
  schemaVersion: 2,
  cliVersion: '0.1.0',
  tailwind: { status: 'not_checked', version: null },
  theme: { status: 'not_checked', path: null, source: null },
  shadcn: { status: 'not_checked' },
  componentLibraries: [],
  support: { status: 'needs_action', blockingIssues: ['仅通信演示，尚未检测真实项目。'], warnings: [] },
  warnings: [{ code: 'DEMO_ONLY', message: '此结果为测试数据，不能判断项目是否受支持。', severity: 'warning' }],
})
