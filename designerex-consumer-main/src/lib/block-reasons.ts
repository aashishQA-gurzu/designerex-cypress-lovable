import { supabase } from "@/integrations/supabase/client";

/**
 * Availability gate shared by checkout. Reservations (booking_reservations) are
 * deliberately NOT consulted — a saved checkout never blocks another renter.
 */
export type BlockReason =
  | "dress_inactive"
  | "lender_inactive"
  | "lender_paused"
  | "vacation"
  | "blackout"
  | "booked";

export const BLOCK_REASON_MESSAGES: Record<BlockReason, string> = {
  dress_inactive: "This listing is no longer available.",
  lender_inactive: "This listing is no longer available.",
  lender_paused: "This lender isn't currently accepting bookings.",
  vacation: "The lender is away for some of those dates. Please choose different dates.",
  blackout: "Some of those dates are unavailable. Please choose different dates.",
  booked: "Those dates have just been booked. Please choose different dates.",
};

export const DATE_BLOCK_REASONS: BlockReason[] = ["vacation", "blackout", "booked"];

export function blockReasonMessage(reason: string): string {
  return (
    BLOCK_REASON_MESSAGES[reason as BlockReason] ??
    "Those dates are no longer available. Please choose different dates."
  );
}

/** Returns the first blocking reason, or null when the dates are bookable. */
export async function fetchBlockReason(args: {
  dressId: string;
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
  sizeId?: string | null;
}): Promise<string | null> {
  // Preferred (size-aware) signature first; fall back to the legacy listing-wide one.
  let { data, error } = await supabase.rpc("dx_dress_block_reasons" as any, {
    p_start: args.start,
    p_end: args.end,
    p_dress_id: args.dressId,
    p_size_id: args.sizeId ?? null,
  } as any);

  if (error) {
    ({ data, error } = await supabase.rpc("dx_dress_block_reasons" as any, {
      start_date: args.start,
      end_date: args.end,
      dress_id: args.dressId,
    } as any));
  }

  if (error) {
    console.warn("[checkout] dx_dress_block_reasons failed", error);
    return null; // never block the renter on an infrastructure error
  }



  const rows: any[] = Array.isArray(data) ? data : data ? [data] : [];
  for (const row of rows) {
    const reason = typeof row === "string" ? row : (row?.reason ?? row?.block_reason ?? null);
    if (reason) return String(reason);
  }
  return null;
}
