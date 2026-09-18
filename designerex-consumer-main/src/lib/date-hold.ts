// A renter's resumable checkout selection backed by dx_hold_dates / dx_release_hold.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  supabase,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/integrations/supabase/client";

export const SAVED_CHECKOUT_EXPIRED_MESSAGE =
  "Your saved selection expired. Please pick your dates again.";

export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Fire-and-forget release that survives tab close. */
function releaseBeacon(accessToken: string | null) {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/dx_release_hold`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: "{}",
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

type SavedCheckoutStatus = "idle" | "saving" | "saved" | "expired" | "error";

export function useDateHold(opts: {
  dressId: string | undefined;
  start: string | undefined; // yyyy-MM-dd
  end: string | undefined; // yyyy-MM-dd (same as start for try-ons)
  enabled?: boolean;
}) {
  const { dressId, start, end, enabled = true } = opts;
  const [status, setStatus] = useState<SavedCheckoutStatus>("idle");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [msLeft, setMsLeft] = useState<number>(0);

  const tokenRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const activeRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token ?? null;
    });
  }, []);

  const release = useCallback(() => {
    if (!activeRef.current || completedRef.current) return;
    activeRef.current = false;
    releaseBeacon(tokenRef.current);
  }, []);

  /** Call after a booking is created — the database releases that hold itself. */
  const markCompleted = useCallback(() => {
    completedRef.current = true;
    activeRef.current = false;
  }, []);

  // Acquire (and re-acquire when the dates change).
  useEffect(() => {
    if (!enabled || !dressId || !start || !end) return;
    let cancelled = false;
    completedRef.current = false;
    setStatus("saving");
    (async () => {
      const { data, error } = await supabase.rpc("dx_hold_dates", {
        p_dress_id: dressId,
        p_start: start,
        p_end: end,
      } as any);
      if (error) {
        if (!cancelled) {
          console.warn("[saved-checkout] dx_hold_dates failed", error);
          setStatus("error");
        }
        return;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      const exp = row?.expires_at ? new Date(row.expires_at) : null;
      if (cancelled) {
        releaseBeacon(tokenRef.current);
        return;
      }
      if (!exp || Number.isNaN(exp.getTime())) {
        console.warn("[saved-checkout] dx_hold_dates returned no valid expiry");
        setStatus("error");
        return;
      }
      activeRef.current = true;
      setExpiresAt(exp);
      setStatus("saved");
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, dressId, start, end]);

  // Countdown
  useEffect(() => {
    if (status !== "saved" || !expiresAt) return;
    const tick = () => {
      const left = expiresAt.getTime() - Date.now();
      setMsLeft(left);
      if (left <= 0) {
        activeRef.current = false;
        setStatus("expired");
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [status, expiresAt]);

  // Release on unmount / tab close.
  useEffect(() => {
    const onHide = () => release();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      release();
    };
  }, [release]);

  return {
    status,
    expiresAt,
    msLeft,
    countdown: formatCountdown(msLeft),
    release,
    markCompleted,
  };
}
