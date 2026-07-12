"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "@/lib/rpc";
import { humanizeError } from "@/lib/errors";

// Keyset-paginated list over an admin_list_* RPC. The RPC orders by (created_at, id) DESC and takes
// p_before_created / p_before_id as the cursor; we accumulate pages and stop when a short page returns.
// `filters` holds the RPC's own p_* params (nulls when unset); changing them resets and reloads.
export function useKeysetList<T extends { created_at: string; id: string | number }>(
  fn: string,
  filters: Record<string, unknown>,
  limit = 50
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const cursorRef = useRef<{ created_at: string; id: string | number } | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters; // always read the latest filters inside load()
  const filtersKey = JSON.stringify(filters);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const cursor = reset ? null : cursorRef.current;
        const page = await rpc<T[]>(fn, {
          ...filtersRef.current,
          p_before_created: cursor?.created_at ?? null,
          p_before_id: cursor?.id ?? null,
          p_limit: limit
        });
        const last = page.at(-1);
        if (last) {
          cursorRef.current = { created_at: last.created_at, id: last.id };
        }
        setDone(page.length < limit);
        setRows((prev) => (reset ? page : [...prev, ...page]));
      } catch (e) {
        setError(humanizeError(e));
      } finally {
        setLoading(false);
      }
    },
    [fn, limit]
  );

  useEffect(() => {
    cursorRef.current = null;
    setRows([]);
    setDone(false);
    void load(true);
  }, [filtersKey, load]);

  return { rows, loading, error, done, loadMore: () => load(false), reload: () => load(true) };
}
