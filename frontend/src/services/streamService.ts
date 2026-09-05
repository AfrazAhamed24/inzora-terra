/**
 * SSE Stream Service - Real-time mission event streaming.
 *
 * The backend emits Server-Sent Events with the event type embedded in the JSON
 * payload (`{"type": "agent", ...}`), delivered through the default `message`
 * event. We parse `event.data` directly and normalize into a typed StreamEvent.
 * Handles reconnection, parsing, and cleanup automatically.
 */

import type { StreamEvent, StreamEventType, ConnectionStatus } from '@/types/api'

/** SSE stream connection configuration */
interface StreamConfig {
  missionId: string
  onEvent: (event: StreamEvent) => void
  onStatus: (status: ConnectionStatus) => void
  onError?: (error: Event) => void
}

/** Normalize a raw backend SSE payload into the typed StreamEvent shape. */
function toStreamEvent(raw: Record<string, unknown>): StreamEvent | null {
  const type = raw.type as StreamEventType
  if (!type) return null
  return {
    event: type,
    mission_id: (raw.mission_id as string) || '',
    data: raw,
  }
}

/** Create and manage SSE stream connection */
export function createStreamConnection(config: StreamConfig): () => void {
  const { missionId, onEvent, onStatus, onError } = config

  let eventSource: EventSource | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let isCleanedUp = false

  const url = `/api/v1/missions/${missionId}/stream`

  function connect() {
    if (isCleanedUp) return

    onStatus('connecting')

    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      if (!isCleanedUp) {
        onStatus('connected')
      }
    }

    eventSource.onmessage = (event) => {
      if (isCleanedUp) return

      try {
        const raw = JSON.parse(event.data) as Record<string, unknown>
        const streamEvent = toStreamEvent(raw)
        if (streamEvent) {
          onEvent(streamEvent)
        }
      } catch {
        // Ignore parse errors for malformed events
      }
    }

    eventSource.onerror = (error) => {
      if (isCleanedUp) return

      onStatus('error')
      onError?.(error)

      // Close current connection
      eventSource?.close()
      eventSource = null

      // Reconnect after delay
      reconnectTimeout = setTimeout(() => {
        connect()
      }, 3000)
    }
  }

  function cleanup() {
    isCleanedUp = true

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    if (eventSource) {
      eventSource.close()
      eventSource = null
    }

    onStatus('disconnected')
  }

  connect()

  return cleanup
}

export default { createStreamConnection }
