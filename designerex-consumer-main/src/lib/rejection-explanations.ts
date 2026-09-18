/**
 * Plain-English explanations shown to the RENTER when a booking request was
 * rejected or expired, plus a clear statement of whether they were charged.
 *
 * The message is driven by bookings.rejection_reason_code. Anything unmapped
 * (including trust/safety codes we never surface) falls back to the default.
 */

export type RejectionOutcome = {
  /** Headline explanation for the renter. */
  message: string;
  /** Always states the money position: not charged, or that a payment was taken. */
  chargeNote: string;
  /** True when money was captured, so we don't claim they weren't charged. */
  charged: boolean;
};

const MESSAGES: Record<string, string> = {
  lender_holiday_mode: "This lender is currently on holiday and not accepting bookings",
  listing_unavailable: "This listing is no longer available",
  lender_paused: "This lender is not currently accepting bookings",
  booked_out_already: "These dates are already booked",
  insufficient_time: "There wasn't enough time to fulfil this booking",
  renter_requested_incorrect: "The lender couldn't fulfil this request as it was made",
  damaged_from_previous_hire: "This dress isn't available after a previous hire",
};

const DEFAULT_REJECTED = "Your request was declined by the lender";
const DEFAULT_EXPIRED = "This request expired before the lender responded";

export type RejectionInfoRow = {
  status?: string | null;
  rejection_reason_code?: string | null;
  credit_applied?: number | string | null;
  payment_status?: string | null;
  payment_captured_at?: string | null;
  paid_at?: string | null;
  captured_at?: string | null;
  amount_captured?: number | string | null;
  stripe_payment_status?: string | null;
  [key: string]: unknown;
};

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const CAPTURED_STATUSES = /^(captured|paid|succeeded|charged|settled|partially_refunded|refunded)$/i;

/** Read from the booking's payment status fields whether money was captured. */
export function paymentWasCaptured(row: RejectionInfoRow | null | undefined): boolean {
  if (!row) return false;
  if (row.payment_captured_at || row.paid_at || row.captured_at) return true;
  if (num(row.amount_captured) > 0) return true;
  for (const key of ["payment_status", "stripe_payment_status", "payment_state", "charge_status"]) {
    const v = row[key];
    if (typeof v === "string" && CAPTURED_STATUSES.test(v.trim())) return true;
  }
  return false;
}

export function explainRejection(
  row: RejectionInfoRow | null | undefined,
  status?: string | null,
): RejectionOutcome {
  const effectiveStatus = status ?? row?.status ?? null;
  const code = row?.rejection_reason_code?.trim();
  const mapped = code ? MESSAGES[code] : undefined;
  const message =
    mapped ?? (effectiveStatus === "expired" ? DEFAULT_EXPIRED : DEFAULT_REJECTED);

  const charged = paymentWasCaptured(row);
  const creditUsed = num(row?.credit_applied) !== 0;
  const chargeNote =
    !charged && !creditUsed
      ? "You have not been charged."
      : charged
        ? "A payment was taken for this booking and is being refunded."
        : "Your account credit was applied to this booking and has been returned.";

  return { message, chargeNote, charged };
}
