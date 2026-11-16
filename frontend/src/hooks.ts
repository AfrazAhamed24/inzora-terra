/**
 * INZORA TERRA — shared hooks
 * useAsyncData: abortable, stale-proof data fetching with manual refresh.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  /** depsKey of the last COMPLETED fetch — lets callers detect stale data. */
  loadedKey: string | null;
}

export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: Array<string | number | boolean>
): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);

    fetcherRef
      .current(ctrl.signal)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError(null);
        setLoadedKey(depsKey);
      })
      .catch((err: unknown) => {
        // Aborted requests (navigation / newer fetch) must never overwrite state.
        if (!alive) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Request failed');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [depsKey, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, refresh, loadedKey };
}
