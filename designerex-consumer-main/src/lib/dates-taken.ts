import { supabase } from "@/integrations/supabase/client";

export const DATES_TAKEN_LABEL = "Already booked for these dates";

function unwrapBool(data: any): boolean | null {
  const row: any = Array.isArray(data) ? data[0] : data;
  if (typeof row === "boolean") return row;
  if (row && typeof row === "object") {
    const v =
      row.dx_dress_is_available ??
      row.dx_dates_already_taken ??
      row.available ??
      row.taken ??
      null;
    if (typeof v === "boolean") return v;
  }
  return null;
}

/**
 * True when another booking (accepted / active / completed) on the same dress
 * overlaps these dates, which means the database will refuse an accept.
 *
 * The database owns this rule: dx_dress_is_available is the source of truth.
 * dx_dates_already_taken is kept as a fallback for older backends.
 */
export async function datesAlreadyTaken(args: {
  dressId: string;
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
  excludeBookingId: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc("dx_dress_is_available" as any, {
    p_dress_id: args.dressId,
    p_start: args.start,
    p_end: args.end,
  } as any);

  if (!error) {
    const available = unwrapBool(data);
    if (available !== null) return !available;
    return false;
  }

  const legacy = await supabase.rpc("dx_dates_already_taken" as any, {
    p_dress_id: args.dressId,
    p_start: args.start,
    p_end: args.end,
    p_exclude_booking: args.excludeBookingId,
  } as any);
  if (legacy.error) {
    console.warn("[booking-requests] availability check failed", error, legacy.error);
    return false; // never block the lender on an infrastructure error
  }
  return unwrapBool(legacy.data) ?? false;
}

/**
 * True when a failed write was the database refusing the dates: an explicit
 * dates_unavailable hint, or a unique / exclusion constraint violation.
 */
export function isDatesUnavailableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "23505" || code === "23P01") return true;
  const text = [error.hint, error.message, error.details, error.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("dates_unavailable") ||
    text.includes("exclusion constraint") ||
    text.includes("duplicate key value") ||
    text.includes("overlap")
  );
}
