// Shared options + helpers for the lender "Deny booking" flow (L9).

export const REJECT_REASONS = [
  "Unavailable for these dates",
  "No longer available",
  "Dates conflict with another booking",
  "Outside my hire terms",
  "Trust or safety concern",
  "Other",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export const TRUST_SAFETY_REASON: RejectReason = "Trust or safety concern";

/** bookings.rejection_reason is capped at 255 characters by the database. */
export const REJECTION_REASON_MAX = 255;

export function isRejectionReasonRequiredError(err: any): boolean {
  const blob = `${err?.hint ?? ""} ${err?.message ?? ""} ${err?.details ?? ""}`;
  return /rejection_reason_required/.test(blob);
}

export const BLACKOUT_LABEL = "Also block these dates so nobody else asks";
export const BLACKOUT_HELP =
  "Tick this if the dress genuinely isn't available then. Leave it unticked if you declined for another reason.";

/**
 * What the renter should see for a rejected booking. The "Trust or safety
 * concern" reason is intentionally not surfaced — show a neutral message.
 */
export function displayRejectionForRenter(
  cancellation_reason: string | null | undefined,
): string {
  if (!cancellation_reason) return "Your request was declined";
  if (cancellation_reason.trim() === TRUST_SAFETY_REASON) {
    return "Your request was declined";
  }
  return cancellation_reason;
}

/* ------------------------------------------------------------------ */
/* Decline reasons (database-owned)                                     */
/* ------------------------------------------------------------------ */

export type DeclineReason = {
  code: string;
  label: string;
  sort_order: number | null;
};

/**
 * The canonical decline reasons. These codes are what gets written to
 * bookings.rejection_reason_code. dx_decline_reasons() is preferred when the
 * database exposes it; this list is used whenever it doesn't, so the lender is
 * never left with an empty picker.
 */
export const DECLINE_REASONS: DeclineReason[] = [
  { code: "booked_out_already", label: "Already booked out", sort_order: 1 },
  { code: "renter_requested_incorrect", label: "Renter requested wrong dates or item", sort_order: 2 },
  { code: "damaged_from_previous_hire", label: "Damaged from a previous hire", sort_order: 3 },
  { code: "insufficient_time", label: "Not enough time to fulfil", sort_order: 4 },
  { code: "other", label: "Other", sort_order: 5 },
];

/** True for the "Other" option, which requires free text. */
export function isOtherReason(r: DeclineReason | null | undefined): boolean {
  if (!r) return false;
  return /^other$/i.test(r.code.trim()) || /^other$/i.test(r.label.trim());
}

/** A requested booking expires 24 hours after it was created. */
export const REQUEST_EXPIRY_HOURS = 24;

export function isRequestExpired(booking: {
  status?: string | null;
  created_at?: string | null;
  expired_at?: string | null;
}): boolean {
  if (!booking) return false;
  if (booking.status === "expired") return true;
  if (booking.expired_at) return new Date(booking.expired_at).getTime() <= Date.now();
  if (booking.status !== "requested") return false;
  if (!booking.created_at) return false;
  const deadline =
    new Date(booking.created_at).getTime() + REQUEST_EXPIRY_HOURS * 60 * 60 * 1000;
  return deadline <= Date.now();
}

export const EXPIRED_REQUEST_LABEL = "Expired — no longer actionable";
