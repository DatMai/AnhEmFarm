export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Options = {
  method?: string
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}
let privateRequests = new AbortController()
export function cancelPrivateRequests() {
  privateRequests.abort()
  privateRequests = new AbortController()
}
let csrfToken: string | null = null
let csrfRequest: Promise<string> | null = null
const messages: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'Verify your email before checkout.',
  SALES_DISABLED: 'Ordering is currently unavailable.',
  EMPTY_CART: 'Your cart is empty.',
  VARIANT_UNAVAILABLE: 'An item is unavailable. Please review your cart.',
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  CSRF_REJECTED: 'Your session expired. Please try again.',
  RATE_LIMITED: 'Too many attempts. Please try again later.',
  UNAVAILABLE: 'The service is temporarily unavailable.',
  REQUEST_FAILED: 'We could not complete your request.',
  NOT_FOUND: 'This item could not be found.'
}
export function clearCsrf(): void {
  csrfToken = null
  csrfRequest = null
}
export async function refreshCsrf(): Promise<string> {
  if (!csrfRequest)
    csrfRequest = fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(async (response) => {
        if (!response.ok)
          throw new ApiError(
            response.status,
            'CSRF_UNAVAILABLE',
            'Please try again later.'
          )
        const data = (await response.json()) as { token: string }
        csrfToken = data.token
        return data.token
      })
      .finally(() => {
        csrfRequest = null
      })
  return csrfRequest
}
const fieldMessages: Record<string, Record<string, string>> = {
  email: {
    invalid_format: 'Please enter a valid email address.',
    too_small: 'Please enter your email address.'
  },
  name: { too_small: 'Please enter your name.' },
  password: {
    too_small: 'Please use at least 12 characters.',
    too_big: 'Password is too long.'
  }
}
function safeFields(value: unknown): Record<string, string[]> | undefined {
  if (!Array.isArray(value)) return undefined
  const fields: Record<string, string[]> = {}
  for (const issue of value) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) continue
    const field = 'field' in issue ? issue.field : null
    const code = 'code' in issue ? issue.code : null
    if (typeof field !== 'string' || !Object.hasOwn(fieldMessages, field))
      continue
    if (typeof code !== 'string') continue
    fields[field] ??= []
    fields[field].push(
      Object.hasOwn(fieldMessages[field], code)
        ? fieldMessages[field][code]
        : 'Please check this field.'
    )
  }
  return Object.keys(fields).length ? fields : undefined
}
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('API path must be local')
  const requestSignal = /^\/(?:account|cart|quotes|orders|admin)(?:\/|$)/.test(
    path
  )
    ? privateRequests.signal
    : undefined
  const method = options.method ?? 'GET'
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
  const run = async (renew = false): Promise<T> => {
    if (mutation && (!csrfToken || renew)) await refreshCsrf()
    let response: Response
    try {
      response = await fetch(`/api/v1${path}`, {
        method,
        credentials: 'same-origin',
        signal:
          options.signal && requestSignal
            ? AbortSignal.any([options.signal, requestSignal])
            : (options.signal ?? requestSignal),
        headers: {
          ...(options.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(mutation ? { 'x-csrf-token': csrfToken! } : {}),
          ...options.headers
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body)
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        throw error
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Connection failed. Please try again.'
      )
    }
    if (response.ok)
      return (response.status === 204 ? undefined : await response.json()) as T
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string
      fields?: unknown
    }
    const code =
      typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED'
    if (
      mutation &&
      code === 'CSRF_REJECTED' &&
      !renew &&
      !path.startsWith('/orders') &&
      !path.startsWith('/guest/orders')
    )
      return run(true)
    throw new ApiError(
      response.status,
      code,
      messages[code] ?? messages.REQUEST_FAILED,
      safeFields(payload.fields)
    )
  }
  return run()
}
