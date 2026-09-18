import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SizeOption = { id: string; name: string; sort_order: number | null };

export type BlackoutRow = {
  id: string;
  dress_id: string;
  blackout_date: string;
  size_id: string | null;
  source: string | null;
  reason: string | null;
};

/** Sizes a listing offers (dress_sizes). */
export async function fetchDressSizes(dressId: string): Promise<SizeOption[]> {
  const { data, error } = await supabase
    .from("dress_sizes")
    .select("size_id, sizes(id, name, sort_order)")
    .eq("dress_id", dressId);
  if (error) {
    console.warn("[sizes] dress_sizes failed", error);
    return [];
  }
  return ((data ?? []) as any[])
    .map((r) => r.sizes)
    .filter(Boolean)
    .map((s: any) => ({ id: String(s.id), name: String(s.name), sort_order: s.sort_order ?? null }))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}

export function useDressSizes(dressId: string | undefined) {
  return useQuery({
    queryKey: ["dress-sizes", dressId],
    enabled: !!dressId,
    staleTime: 60_000,
    queryFn: () => fetchDressSizes(dressId!),
  });
}

/** Raw blackout rows for a listing (per-size scoping lives in size_id). */
export async function fetchDressBlackouts(dressId: string): Promise<BlackoutRow[]> {
  const { data, error } = await supabase
    .from("dress_blackouts")
    .select("id, dress_id, blackout_date, size_id, source, reason")
    .eq("dress_id", dressId);
  if (error) {
    console.warn("[sizes] dress_blackouts failed", error);
    return [];
  }
  return (data ?? []) as any as BlackoutRow[];
}

export type BookedRange = { start_date: string; end_date: string; size_id: string | null };

/** Bookings that hold dates on a listing (a null size_id holds every size). */
export async function fetchDressBookedRanges(dressId: string): Promise<BookedRange[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("start_date, end_date, size_id, status")
    .eq("dress_id", dressId)
    .in("status", ["accepted", "active", "completed"]);
  if (error) {
    console.warn("[sizes] bookings failed", error);
    return [];
  }
  return (data ?? []) as any as BookedRange[];
}

function datesBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  while (d <= end) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Blocked dates for one size of a listing.
 *
 * dx_dress_blocked_dates is listing-wide (bookings + blackouts + vacation/lender state).
 * Bookings and blackouts carry a size_id, so we recompute those two per size and keep the
 * listing-wide remainder (vacation, paused lender) untouched.
 */
export async function fetchBlockedDatesForSize(
  dressId: string,
  sizeId: string | null,
): Promise<string[]> {
  const [{ data: baseData, error }, blackouts, bookings] = await Promise.all([
    supabase.rpc("dx_dress_blocked_dates", { p_dress_id: dressId } as any),
    fetchDressBlackouts(dressId),
    fetchDressBookedRanges(dressId),
  ]);
  if (error) console.warn("[sizes] dx_dress_blocked_dates failed", error);

  const base = new Set<string>(
    ((baseData ?? []) as any[]).map((r) =>
      String(typeof r === "string" ? r : (r.blocked_date ?? r.date)),
    ),
  );

  if (!sizeId) {
    for (const b of blackouts) base.add(b.blackout_date);
    return [...base].sort();
  }

  // Drop every date whose block comes from a booking or a blackout, then re-add
  // only the ones that apply to the requested size.
  for (const b of blackouts) base.delete(b.blackout_date);
  for (const bk of bookings) for (const d of datesBetween(bk.start_date, bk.end_date)) base.delete(d);

  for (const b of blackouts) {
    if (!b.size_id || b.size_id === sizeId) base.add(b.blackout_date);
  }
  for (const bk of bookings) {
    if (bk.size_id && bk.size_id !== sizeId) continue;
    for (const d of datesBetween(bk.start_date, bk.end_date)) base.add(d);
  }

  return [...base].sort();
}

