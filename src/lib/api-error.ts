import { NextResponse } from 'next/server'

export type ApiErrorCode = 'bad_request' | 'validation_error' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'internal_error'

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400, validation_error: 422, unauthorized: 401, forbidden: 403,
  not_found: 404, conflict: 409, rate_limited: 429, internal_error: 500,
}

export function apiError(code: ApiErrorCode, message: string, options?: { details?: Record<string, unknown>; requestId?: string }) {
  return NextResponse.json({ error: { code, message, details: options?.details, request_id: options?.requestId } }, { status: STATUS[code] })
}
