import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../services/api.js";

/**
 * Runs an async loader and tracks data/loading/error. `deps` works like
 * useEffect dependencies. The latest request wins, so rapid filter changes
 * cannot overwrite a newer response.
 */
export function useApi(loader, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (id === requestId.current) setData(result);
      return result;
    } catch (err) {
      if (id === requestId.current) setError(getErrorMessage(err));
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return { data, setData, loading, error, refresh: run };
}
