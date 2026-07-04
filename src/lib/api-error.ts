import { NextResponse } from 'next/server'

/**
 * Consistent error response shape:
 * { "error": { "code": "...", "message": "...", "details": {...}, "request_id": "..." } }
 *
 * Never leak internal exception text to the client. The detail is logged server-side.
 */

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error'

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    details?: Record<string, unknown>
    request_id?: string
  }
}

const STATUS_CODES: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  options?: {
    details?: Record<string, unknown>
    requestId?: string
  },
): NextResponse<ApiErrorBody> {
  const status = STATUS_CODES[code]
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: options?.details,
        request_id: options?.requestId,
      },
    },
    { status },
  )
}

/**
 * Wrap an async route handler with consistent error handling.
 * Logs the real error; returns a generic message to the client.
 */
export function withErrorHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (err) {
       
      console.error('[api] unhandled error:', err)
      return apiError('internal_error', 'An unexpected error occurred.', {})
    }
  }
}
