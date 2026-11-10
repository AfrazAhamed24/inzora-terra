/**
 * API Client - Clean HTTP layer for backend communication.
 *
 * Architectural decision: Centralizes all HTTP calls through a single client
 * with typed methods, error handling, base URL configuration, and operator
 * authorization. No widget should directly call fetch() - always use this client.
 *
 * Authorization: state-changing routes require `X-Terra-Operator-Key` when the
 * backend has `TERRA_API_OPERATOR_KEY` configured. The key is read from
 * `VITE_TERRA_OPERATOR_KEY`. This is a shared-secret gate for the demo tier, not
 * real identity/authn — production auth (per-user identity, ACLs, audit) is
 * explicitly post-demo (BLUEPRINT "Future Production").
 */

import type { ErrorResponse } from '@/types/api'

const API_BASE = '/api/v1'

const OPERATOR_KEY = String(import.meta.env.VITE_TERRA_OPERATOR_KEY ?? '').trim()
const OPERATOR_HEADER = 'X-Terra-Operator-Key'

/** Custom error for API failures */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public timestamp?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static fromResponse(data: ErrorResponse, status: number): ApiError {
    return new ApiError(status, data.code, data.detail, data.timestamp)
  }
}

/** HTTP methods */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** Request options */
interface RequestOptions {
  method?: HttpMethod
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

/** Typed fetch wrapper */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, signal } = options

  const url = `${API_BASE}${path}`

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(OPERATOR_KEY ? { [OPERATOR_HEADER]: OPERATOR_KEY } : {}),
      ...headers,
    },
    signal,
  }

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body)
  }

  const response = await fetch(url, fetchOptions)

  if (!response.ok) {
    let errorData: ErrorResponse
    try {
      errorData = await response.json()
    } catch {
      errorData = {
        detail: response.statusText || 'Unknown error',
        code: 'http_error',
        timestamp: new Date().toISOString(),
        status_code: response.status,
      }
    }
    throw ApiError.fromResponse(errorData, response.status)
  }

  return response.json() as Promise<T>
}

/** GET request */
export function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET', signal })
}

/** POST request */
export function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'POST', body, signal })
}

/** PUT request */
export function put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'PUT', body, signal })
}

/** DELETE request */
export function del<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'DELETE', signal })
}

export default { get, post, put, del }
