import { z } from 'zod'

export const sessionIdSchema = z.string().regex(/^scan_[a-zA-Z0-9_-]{1,100}$/)
export const tokenSchema = z.string().regex(/^[a-zA-Z0-9_-]{16,512}$/)
export const serverUrlSchema = z.string().max(2048).transform((value, context) => {
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
      throw new Error('Invalid server origin')
    }
    return url.origin
  } catch {
    context.addIssue({ code: 'custom', message: '请使用无路径、凭据或查询参数的服务地址；明文连接仅允许本机。' })
    return z.NEVER
  }
})
