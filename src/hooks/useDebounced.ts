import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (Object.is(value, debounced)) return; // nothing pending: no timer, no state churn
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, debounced, delayMs]);
  return debounced;
}
