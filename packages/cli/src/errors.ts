export class CliError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export const requestFailure = () => new CliError(
  'NETWORK_ERROR', '无法连接服务端或请求超时。结果已保留，可稍后重试。',
)
