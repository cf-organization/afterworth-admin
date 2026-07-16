"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "@/lib/rpc";
import { humanizeError } from "@/lib/errors";

// Keyset-paginated list over an admin_list_* RPC. The RPC orders by (created_at, id) DESC and takes
// p_before_created / p_before_id as the cursor; we accumulate pages and stop when a short page returns.
// `filters` holds the RPC's own p_* params (nulls when unset); changing them resets and reloads.
export function useKeysetList<T extends { id: string | number }>(
  fn: string,
  filters: Record<string, unknown>,
  limit = 50,
  opts?: { cursorField?: string; beforeParam?: string }
) {
  // The RPC's keyset column + its matching "p_before_*" cursor param. Defaults match admin_list_invitations
  // (created_at / p_before_created); admin_list_claim_packets_enriched uses submitted_at / p_before_submitted.
  const cursorField = opts?.cursorField ?? "created_at";
  const beforeParam = opts?.beforeParam ?? "p_before_created";
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const cursorRef = useRef<{ cv: string; id: string | number } | null>(null);
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
          [beforeParam]: cursor?.cv ?? null,
          p_before_id: cursor?.id ?? null,
          p_limit: limit
        });
        const last = page.at(-1);
        if (last) {
          cursorRef.current = { cv: String((last as Record<string, unknown>)[cursorField] ?? ""), id: last.id };
        }
        setDone(page.length < limit);
        setRows((prev) => (reset ? page : [...prev, ...page]));
      } catch (e) {
        setError(humanizeError(e));
      } finally {
        setLoading(false);
      }
    },
    [fn, limit, cursorField, beforeParam]
  );

  useEffect(() => {
    cursorRef.current = null;
    setRows([]);
    setDone(false);
    void load(true);
  }, [filtersKey, load]);

  return { rows, loading, error, done, loadMore: () => load(false), reload: () => load(true) };
}
