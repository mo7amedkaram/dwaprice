// One error shape for every non-2xx answer of the Drug Prices API (docs/API_SPEC.md §8).
export type ApiErrorCode =
  | 'validation_error'
  | 'invalid_cursor'
  | 'since_too_old'
  | 'unauthorized'
  | 'forbidden'
  | 'ip_not_allowed'
  | 'not_found'
  | 'moved'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'internal_error'
  | 'unavailable';

export type ErrorDetails = Record<string, unknown> | Array<Record<string, unknown>> | null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details: ErrorDetails = null,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const errors = {
  validation: (message: string, details: ErrorDetails = null) => new ApiError(400, 'validation_error', message, details),
  invalidCursor: (why = 'cursor is expired, malformed, or does not match the filters') => new ApiError(400, 'invalid_cursor', why),
  sinceTooOld: (windowDays: number) =>
    new ApiError(400, 'since_too_old', `since is outside the ${windowDays}-day window of your plan; reload with /drugs`, { window_days: windowDays }),
  unauthorized: (message = 'Authorization header with a Bearer key is required') => new ApiError(401, 'unauthorized', message),
  forbidden: (message: string, details: ErrorDetails = null) => new ApiError(403, 'forbidden', message, details),
  ipNotAllowed: () => new ApiError(403, 'ip_not_allowed', 'This IP address is not in the allowlist'),
  notFound: (what: string) => new ApiError(404, 'not_found', what),
  moved: (newId: string, location: string) => new ApiError(301, 'moved', `This id was replaced by ${newId}`, { new_id: newId }, { Location: location }),
  rateLimited: (limit: number, retryAfter: number) =>
    new ApiError(429, 'rate_limited', `Rate limit of ${limit} requests per minute exceeded`, { retry_after: retryAfter }, { 'Retry-After': String(retryAfter) }),
  quotaExceeded: (quota: number, resetsAt: Date) =>
    new ApiError(429, 'quota_exceeded', `Monthly quota of ${quota} requests exceeded`, { resets_at: resetsAt.toISOString() }, {
      'Retry-After': String(Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000))),
    }),
  internal: (requestId: string) => new ApiError(500, 'internal_error', 'Unexpected error', { request_id: requestId }),
  unavailable: (requestId: string) => new ApiError(503, 'unavailable', 'The service is temporarily unavailable', { request_id: requestId }, { 'Retry-After': '30' }),
};

export function errorBody(e: ApiError) {
  return { error: { code: e.code, message: e.message, details: e.details } };
}
