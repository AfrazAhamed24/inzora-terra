/**
 * API Client - Clean HTTP layer for backend communication.
 *
 * Architectural decision: Centralizes all HTTP calls through a single client
 * with typed methods, error handling, and base URL configuration.
 * No widget should directly call fetch() - always use this client.
 */

import type { ErrorResponse } from '@/types/api'

const API_BASE = '/api/v1'

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
