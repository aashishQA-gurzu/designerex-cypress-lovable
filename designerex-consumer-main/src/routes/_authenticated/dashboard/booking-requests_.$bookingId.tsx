import { SimpleSelect } from "@/components/ui/simple-select";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  format,
  formatDistanceToNow,
  parseISO,
  differenceInCalendarDays,
  differenceInMilliseconds,
} from "date-fns";
import { ArrowLeft, Send, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { shippingName } from "@/lib/shipping-labels";
import { TryOnBadge, isTryOnBooking, formatTryOnWhen } from "@/components/dashboard/TryOnBadge";

/** Snapshots may be plain text or a jsonb address object. Render either safely. */
function formatSnapshot(snap: unknown): string {
  if (!snap) return "";
  if (typeof snap === "string") return snap;
  if (typeof snap === "object") {
    const o = snap as Record<string, any>;
    const parts = [o.line1, o.line2, o.suburb ?? o.city, o.state, o.postcode, o.label, o.name]
      .filter((v) => typeof v === "string" && v.trim().length > 0);
    return parts.length ? Array.from(new Set(parts)).join(", ") : "";
  }
  return String(snap);
}

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { MessageRow } from "@/lib/messaging";
import { datesAlreadyTaken, DATES_TAKEN_LABEL, isDatesUnavailableError } from "@/lib/dates-taken";
import { useDeclineReasons } from "@/hooks/useDeclineReasons";
import { markConversationRead } from "@/lib/messaging";
import { WriteReviewButton } from "@/components/reviews/WriteReviewButton";


export const Route = createFileRoute("/_authenticated/dashboard/booking-requests_/$bookingId")({
  ssr: false,
  component: BookingDetailPage,
});

const HIRE_LABEL: Record<string, string> = {
  hire_a: "4 day hire",
  hire_b: "8 day hire",
  try_on: "Try-on",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  active: "bg-sky-100 text-sky-800",
  completed: "bg-muted text-ink/70",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

import {
  REJECTION_REASON_MAX,
  isOtherReason, isRequestExpired, EXPIRED_REQUEST_LABEL, type DeclineReason,
  isRejectionReasonRequiredError, BLACKOUT_LABEL, BLACKOUT_HELP,
} from "@/lib/booking-reject";
import { explainRejection, type RejectionInfoRow } from "@/lib/rejection-explanations";

const QUICK_REPLIES = {
  lender_requested: [
    "When do you need it by?",
    "Can you confirm your size?",
    "I'll accept this now",
    "Sorry, I can't fulfil this one",
  ],
  renter_requested: [
    "How does shipping work?",
    "Can I collect in person?",
    "What condition is the dress in?",
    "How does the sizing run?",
  ],
  lender_accepted: [
    "Shipping today",
    "Sent — tracking is...",
    "Posted, should arrive by...",
    "Let me know when it arrives",
  ],
  renter_accepted: [
    "When will it ship?",
    "Has it been sent yet?",
    "What's the tracking number?",
    "Thank you!",
  ],
  lender_active: [
    "Hope you love it!",
    "Don't forget the return label is inside",
    "Let me know if you need anything",
  ],
  renter_active: [
    "It arrived, thank you!",
    "Loved it — returning today",
    "Question about the return",
  ],
};

function pickQuickReplies(status: string, isLender: boolean): string[] {
  if (status === "requested") return isLender ? QUICK_REPLIES.lender_requested : QUICK_REPLIES.renter_requested;
  if (status === "accepted") return isLender ? QUICK_REPLIES.lender_accepted : QUICK_REPLIES.renter_accepted;
  if (status === "active") return isLender ? QUICK_REPLIES.lender_active : QUICK_REPLIES.renter_active;
  return [];
}

function BookingDetailPage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectCode, setRejectCode] = useState<string>("");
  const { data: declineReasons, isLoading: reasonsLoading, error: reasonsError } = useDeclineReasons();
  const selectedReason: DeclineReason | null =
    (declineReasons ?? []).find((r) => r.code === rejectCode) ?? null;
  const needsDetails = isOtherReason(selectedReason);
  const [rejectNotes, setRejectNotes] = useState("");
  const [blockDates, setBlockDates] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: booking, isLoading, error } = useQuery({
    queryKey: ["booking-detail", bookingId],
    enabled: !!user && !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
            id,
            status,
            start_date,
            end_date,
            created_at,
            accepted_at,
            rejected_at,
            cancelled_at,
            completed_at,
            expired_at,
            hire_option,
            try_on_period,
            shipping_type,
            try_on_address_snapshot,
            try_on_location_snapshot,

            rental_fee,
            cleaning_fee,
            insurance_fee,
            shipping_fee,
            rentable_total,
            platform_fee,
            lender_payout_amount,
            renter_service_fee,
            discount_amount_applied,
            bond_amount,
            bond_status,
            bond_claimed_amount,
            delivery_notes,
            renter_note,
            cancellation_reason,
            cancelled_by,
            renter_id,
            lender_id,
            dress_id,
            dress:dresses!bookings_dress_id_fkey (
              id,
              title,
              size,
              color,
              dress_type_id,
              brand_id,
              lender_id,
              images:dress_images (url, position),
              brand:brands!dresses_brand_id_fkey (name),
              dress_type:dress_types!dresses_dress_type_id_fkey (name)
            ),
            renter:profiles!bookings_renter_id_fkey (
              id, first_name, last_name, avatar_url, created_at
            ),
            lender:profiles!bookings_lender_id_fkey (
              id, first_name, last_name, avatar_url, response_rate, created_at
            )
          `,
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isLender = booking?.lender_id === user?.id;

  const { data: datesTaken } = useQuery({
    queryKey: [
      "booking-dates-taken",
      booking?.id,
      booking?.dress_id,
      booking?.start_date,
      booking?.end_date,
    ],
    enabled: !!booking && booking.status === "requested" && !!booking.dress_id,
    queryFn: () =>
      datesAlreadyTaken({
        dressId: booking!.dress_id as string,
        start: booking!.start_date as string,
        end: (booking!.end_date ?? booking!.start_date) as string,
        excludeBookingId: booking!.id as string,
      }),
  });
  const isRenter = booking?.renter_id === user?.id;
  const requestExpired = booking ? isRequestExpired(booking as any) : false;
  const otherProfile = (isLender ? (booking as any)?.renter : (booking as any)?.lender) ?? null;

  useEffect(() => {
    if (!isLoading && booking && user && !isLender && !isRenter) {
      toast.error("You don't have access to this booking.");
      navigate({ to: "/dashboard" });
    }
    if (!isLoading && !booking && !error) {
      toast.error("Booking not found.");
      navigate({ to: "/dashboard/bookings" });
    }
  }, [isLoading, booking, user, isLender, isRenter, error, navigate]);

  const { data: conversationId } = useQuery({
    queryKey: ["booking-conversation-id", bookingId, user?.id],
    enabled: !!booking && (isLender || isRenter),
    queryFn: async () => {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (existing?.id) return existing.id as string;
      const { data: created, error: cErr } = await supabase
        .from("conversations")
        .insert({
          type: "booking",
          booking_id: bookingId,
          dress_id: booking!.dress_id,
          renter_id: booking!.renter_id,
          lender_id: booking!.lender_id,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      await supabase.from("conversation_participants").insert([
        { conversation_id: created.id, user_id: booking!.renter_id },
        { conversation_id: created.id, user_id: booking!.lender_id },
      ]);
      return created.id as string;
    },
  });

  const archived = booking?.status === "rejected" || booking?.status === "cancelled";

  // Renter-facing explanation for declined / expired requests: reason code plus
  // the payment fields that say whether anything was actually charged.
  const endedStatus =
    booking?.status === "rejected" || booking?.status === "expired" ? booking.status : null;
  const { data: rejectionRow } = useQuery({
    queryKey: ["booking-rejection-info", bookingId, endedStatus],
    enabled: !!bookingId && !!endedStatus && isRenter,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RejectionInfoRow | null;
    },
  });
  const rejectionOutcome = endedStatus
    ? explainRejection(rejectionRow ?? null, endedStatus)
    : null;

  const onAccept = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "accepted" })
      .eq("id", bookingId);
    setBusy(false);
    if (error) {
      if (isDatesUnavailableError(error)) {
        toast.error(DATES_TAKEN_LABEL);
        setAccepting(false);
        qc.invalidateQueries({ queryKey: ["booking-dates-taken"] });
        qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
        return;
      }
      return toast.error(error.message);
    }
    toast.success("Booking accepted.");
    setAccepting(false);
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
    qc.invalidateQueries({ queryKey: ["lender-bookings"] });
  };

  const onReject = async () => {
    const trimmed = rejectNotes.trim();
    setBusy(true);
    const payload: any = {
      status: "rejected",
      rejection_reason_code: rejectCode,
      rejection_reason: needsDetails ? trimmed.slice(0, REJECTION_REASON_MAX) : null,
      blackout_on_reject: blockDates,
      cancelled_by: "lender",
      rejected_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("bookings").update(payload).eq("id", bookingId);
    setBusy(false);
    if (error) {
      // Validation lives in the database — show its message as-is.
      return toast.error(error.message);
    }
    toast.success(blockDates ? "Booking declined and those dates blocked." : "Booking declined.");
    setRejecting(false);
    setRejectNotes("");
    setBlockDates(false);
    setRejectCode("");
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
    qc.invalidateQueries({ queryKey: ["lender-bookings"] });
  };

  const onCancel = async () => {
    if (!confirm("Cancel this booking request?")) return;
    const payload: any = { status: "cancelled", cancelled_by: "renter" };
    let { error } = await supabase.from("bookings").update(payload).eq("id", bookingId);
    if (error && /cancelled_by/.test(error.message)) {
      ({ error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId));
    }
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled.");
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
  };

  const onShipped = async () => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "active" })
      .eq("id", bookingId);
    if (error) return toast.error(error.message);
    toast.success("Marked as shipped.");
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
  };

  if (isLoading || !booking || !user) {
    return <p className="text-sm text-muted-foreground">Loading booking…</p>;
  }
  if (!isLender && !isRenter) return null;

  const dress = booking.dress as any;
  const img = ((dress?.images ?? []) as any[])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;
  const dayCount =
    booking.start_date && booking.end_date
      ? differenceInCalendarDays(parseISO(booking.end_date), parseISO(booking.start_date)) + 1
      : 0;
  const backTo =
    booking.status === "requested" && isLender ? "/dashboard/booking-requests" : "/dashboard/bookings";

  const isTryOn = isTryOnBooking((booking as any).hire_option);
  const pickupAddress = formatSnapshot((booking as any).try_on_address_snapshot);
  const pickupLocation = formatSnapshot((booking as any).try_on_location_snapshot);
  const isTwoHourBooking = !isTryOn && booking.shipping_type === "two_hour_uber";

  // Money is never recalculated client-side: every figure below is read straight
  // from the bookings row as written by the database.
  const total =
    Number((booking as any).rentable_total ?? 0) +
    Number(booking.renter_service_fee ?? 0) -
    Number(booking.discount_amount_applied ?? 0);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-pink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {isTryOn && <TryOnBadge />}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider-display",
            STATUS_STYLES[booking.status] ?? "bg-muted text-ink/70",
          )}
        >
          {booking.status}
        </span>

        {booking.created_at && (
          <span className="text-xs text-muted-foreground">
            Requested {formatDistanceToNow(parseISO(booking.created_at), { addSuffix: true })}
          </span>
        )}
        {booking.status === "requested" && booking.created_at && (
          <Countdown createdAt={booking.created_at} />
        )}
      </div>

      {rejectionOutcome && isRenter && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">{rejectionOutcome.message}</p>
          {rejectionOutcome.chargeNote && (
            <p className={cn("mt-1 text-xs font-medium", rejectionOutcome.charged ? "text-foreground" : "text-emerald-800")}>{rejectionOutcome.chargeNote}</p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,440px)]">
        <div className="space-y-6">
          <div className="flex gap-4 rounded-md border bg-white p-4">
            {img ? (
              <img src={img} alt="" className="h-32 w-32 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-32 w-32 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] tracking-wider-display text-muted-foreground">
                {dress?.brand?.name ?? "DESIGNER"}
              </p>
              <p className="font-display text-xl">{dress?.title ?? "Dress"}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {dress?.size && <span>Size {dress.size}</span>}
                {dress?.color && <span>{dress.color}</span>}
                {dress?.dress_type?.name && <span>{dress.dress_type.name}</span>}
              </div>
              {dress?.id && (
                <Link
                  to="/dresses/$id"
                  params={{ id: dress.id }}
                  className="mt-1 inline-block text-xs text-pink hover:underline"
                >
                  View dress page →
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <p className="mb-3 text-[10px] uppercase tracking-wider-display text-muted-foreground">
              {isLender ? "Renter" : "Lender"}
            </p>
            <div className="flex items-center gap-3">
              {otherProfile?.avatar_url ? (
                <img
                  src={otherProfile.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {otherProfile?.first_name} {otherProfile?.last_name}
                </p>
                {otherProfile?.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Member since {format(parseISO(otherProfile.created_at), "MMM yyyy")}
                  </p>
                )}
              </div>
              {!isLender && otherProfile?.id && (
                <Link
                  to="/lenders/$lenderId"
                  params={{ lenderId: otherProfile.id }}
                  className="text-xs text-pink hover:underline"
                >
                  View profile →
                </Link>
              )}
            </div>

            <hr className="my-4 border-border" />

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{isTryOn ? "Booking type" : "Hire option"}</dt>
                <dd>{isTryOn ? "Try-on" : (HIRE_LABEL[booking.hire_option] ?? booking.hire_option ?? "—")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{isTryOn ? "Date" : "Dates"}</dt>
                <dd className="text-right">
                  {booking.start_date &&
                    (isTryOn
                      ? formatTryOnWhen(format(parseISO(booking.start_date), "EEE d MMM"), (booking as any).try_on_period)
                      : format(parseISO(booking.start_date), "EEE d MMM"))}
                  {!isTryOn && (
                    <>
                      {" → "}
                      {booking.end_date && format(parseISO(booking.end_date), "EEE d MMM")}
                      {dayCount > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">({dayCount} days)</span>
                      )}
                    </>
                  )}
                </dd>
              </div>
              {!isTryOn && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{shippingName(booking.shipping_type)}</dd>
                </div>
              )}
              {isTryOn && (pickupAddress || pickupLocation) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pickup address</dt>
                  <dd className="whitespace-pre-line text-right">
                    {pickupAddress || pickupLocation}
                  </dd>
                </div>
              )}
            </dl>

          </div>

          <div className="rounded-md border bg-white p-4">
            <p className="mb-3 text-[10px] uppercase tracking-wider-display text-muted-foreground">
              {isLender ? "Payout" : "Payment breakdown"}
            </p>
            {isLender ? (
              <LenderEarnings
                receives={Number((booking as any).lender_payout_amount ?? 0)}
                rentableTotal={Number((booking as any).rentable_total ?? 0)}
                platformFee={Number((booking as any).platform_fee ?? 0)}
                isTryOn={isTryOn}
              />
            ) : (
              <dl className="space-y-1.5 text-sm">
                <Row label="Rental price" value={booking.rental_fee} />
                {Number(booking.cleaning_fee ?? 0) > 0 && (
                  <Row label="Cleaning fee" value={booking.cleaning_fee} />
                )}
                {!isTryOn &&
                  (isTwoHourBooking ? (
                    Number(booking.shipping_fee ?? 0) > 0 && (
                      <Row label="2-hour delivery" value={booking.shipping_fee} />
                    )
                  ) : (
                    <Row label="Shipping" value={booking.shipping_fee} />
                  ))}

                <Row label="Booking fee" value={booking.renter_service_fee} />
                {Number(booking.discount_amount_applied ?? 0) > 0 && (
                  <Row label="Discount" value={-Number(booking.discount_amount_applied)} />
                )}
                <hr className="my-2 border-border" />
                <div className="flex justify-between text-base font-medium">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                {Number(booking.bond_amount ?? 0) > 0 && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    + ${Number(booking.bond_amount).toFixed(2)} refundable security bond
                  </p>
                )}
              </dl>
            )}
          </div>

          {isLender && Number(booking.bond_amount ?? 0) > 0 && (
            <BondPanel
              amount={Number(booking.bond_amount)}
              status={booking.bond_status}
              claimedAmount={booking.bond_claimed_amount}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {booking.status === "requested" && isLender && (
              requestExpired ? (
                <span
                  role="status"
                  className="flex-1 select-none rounded-md border border-border bg-muted px-4 py-2.5 text-center text-sm font-medium text-muted-foreground sm:flex-none"
                >
                  {EXPIRED_REQUEST_LABEL}
                </span>
              ) : (
              <>
                <button
                  onClick={() => setRejecting(true)}
                  className="flex-1 rounded-md border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 sm:flex-none"
                >
                  Reject
                </button>
                {datesTaken ? (
                  <span
                    role="status"
                    aria-disabled="true"
                    className="flex-1 cursor-not-allowed select-none rounded-md border border-border bg-muted px-4 py-2.5 text-center text-sm font-medium text-muted-foreground sm:flex-none"
                  >
                    {DATES_TAKEN_LABEL}
                  </span>
                ) : (
                  <button
                    onClick={() => setAccepting(true)}
                    className="flex-1 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 sm:flex-none"
                  >
                    Accept booking
                  </button>
                )}
              </>
              )
            )}
            {booking.status === "requested" && isRenter && (
              <button
                onClick={onCancel}
                className="rounded-md border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Cancel request
              </button>
            )}
            {booking.status === "accepted" && isLender && !isTryOn && (
              <button
                onClick={onShipped}
                className="rounded-md bg-pink px-4 py-2.5 text-sm font-medium text-white hover:bg-pink/90"
              >
                Mark as shipped
              </button>
            )}

            {booking.status === "completed" && isRenter && (
              <WriteReviewButton bookingId={bookingId} lenderId={booking.lender_id} size="md" />
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <MessagesPanel
            conversationId={conversationId ?? null}
            currentUserId={user.id}
            otherName={otherProfile?.first_name ?? (isLender ? "renter" : "lender")}
            archived={archived}
            quickReplies={pickQuickReplies(booking.status, isLender)}
          />
        </div>
      </div>

      <Dialog open={accepting} onOpenChange={(o) => !o && setAccepting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept booking?</DialogTitle>
            <DialogDescription>
              Accepting will charge the renter's card and confirm the booking.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setAccepting(false)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={busy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Accepting…" : "Yes, accept"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={(o) => !o && setRejecting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline booking</DialogTitle>
            <DialogDescription>
              Let the renter know why so they can find another dress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider-display text-muted-foreground">
                Reason <span className="text-red-600">*</span>
              </label>
              <SimpleSelect
                value={rejectCode}
                onValueChange={setRejectCode}
                disabled={reasonsLoading || !!reasonsError}
                aria-label="Decline reason"
                placeholder={reasonsLoading ? "Loading reasons…" : "Choose a reason"}
                options={(declineReasons ?? []).map((r) => ({ value: r.code, label: r.label }))}
              />
              {reasonsError && (
                <p className="mt-1 text-xs text-red-600">{(reasonsError as any).message}</p>
              )}
            </div>
            {needsDetails && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider-display text-muted-foreground">
                  More details <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value.slice(0, REJECTION_REASON_MAX))}
                  rows={3}
                  required
                  maxLength={REJECTION_REASON_MAX}
                  className="input"
                  placeholder="A brief reason so the renter knows what happened…"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {rejectNotes.length}/{REJECTION_REASON_MAX}
                </p>
              </div>
            )}
            <label className="flex items-start gap-2.5 rounded-md border p-3">
              <input
                type="checkbox"
                checked={blockDates}
                onChange={(e) => setBlockDates(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-magenta)]"
              />
              <span>
                <span className="block text-sm text-ink">{BLACKOUT_LABEL}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{BLACKOUT_HELP}</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <button
              onClick={() => setRejecting(false)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={onReject}
              disabled={busy || !rejectCode || (needsDetails && !rejectNotes.trim())}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Declining…" : "Decline booking"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | null | undefined }) {
  const n = Number(value ?? 0);
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        {n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)}
      </dd>
    </div>
  );
}

// Values come straight from the bookings row — no client-side fee maths.
function LenderEarnings({
  receives, rentableTotal, platformFee, isTryOn,
}: {
  receives: number; rentableTotal: number; platformFee: number; isTryOn: boolean;
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex items-center justify-between">
        <dt className="font-medium text-ink">You receive</dt>
        <dd className="font-display text-2xl text-pink">{fmt(receives)}</dd>
      </div>
      {isTryOn ? (
        <p className="pt-1 text-xs text-muted-foreground">
          Try-ons take no commission — you keep the full try-on fee.
        </p>
      ) : (
        <>
          <Row label="Hire total" value={rentableTotal} />
          <Row label="Commission" value={-platformFee} />
        </>
      )}
    </dl>
  );
}


function Countdown({ createdAt }: { createdAt: string }) {
  const deadline = new Date(parseISO(createdAt).getTime() + 24 * 60 * 60 * 1000);
  const ms = differenceInMilliseconds(deadline, new Date());
  if (ms <= 0) return <span className="text-xs text-red-600">Response overdue</span>;
  const hours = Math.floor(ms / 1000 / 60 / 60);
  const minutes = Math.floor((ms / 1000 / 60) % 60);
  return (
    <span className={cn("text-xs", hours < 6 ? "text-red-600" : "text-amber-600")}>
      Lender response due in {hours > 0 ? `${hours}h` : `${minutes}m`}
    </span>
  );
}

function BondPanel({
  amount,
  status,
  claimedAmount,
}: {
  amount: number;
  status: string | null;
  claimedAmount: number | null;
}) {
  const DAMAGE_EMAIL = "Support@designerex.com.au";
  const copy = (() => {
    switch (status) {
      case "held":
        return {
          title: "Security deposit held",
          body: `A refundable $${amount.toFixed(2)} deposit is held on the renter's card for this hire.`,
        };
      case "released":
        return {
          title: "Security deposit released",
          body: "The deposit was released back to the renter.",
        };
      case "claimed": {
        const claimed = Number(claimedAmount ?? amount);
        return {
          title: "Security deposit claimed",
          body: `$${claimed.toFixed(2)} was claimed from the deposit for damage or loss.`,
        };
      }
      case "expired":
        return {
          title: "Security deposit expired",
          body: "The deposit hold expired.",
        };
      default:
        return {
          title: "Security deposit required",
          body: `A refundable $${amount.toFixed(2)} deposit is required for this hire, but not yet held.`,
        };
    }
  })();

  return (
    <div className="rounded-md border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider-display text-muted-foreground">
        <Shield className="h-4 w-4 text-magenta" />
        {copy.title}
      </div>
      <p className="text-sm text-ink">{copy.body}</p>
      <div className="mt-3 rounded-md border border-border bg-bg-tint p-3 text-xs text-muted-foreground">
        <p className="font-medium text-ink">Damaged or missing on return?</p>
        <p className="mt-1">
          Inspect the dress when it’s returned. If there’s a problem, email the Designerex team a photo of the damage and we’ll review and handle any charge against the deposit.{" "}
          <a href={`mailto:${DAMAGE_EMAIL}`} className="text-magenta hover:underline">
            {DAMAGE_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}

function MessagesPanel({
  conversationId,
  currentUserId,
  otherName,
  archived,
  quickReplies,
}: {
  conversationId: string | null;
  currentUserId: string;
  otherName: string;
  archived: boolean;
  quickReplies: string[];
}) {
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<MessageRow[]>([]);

  const { data: messages = [] } = useQuery({
    queryKey: ["booking-messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, is_flagged")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const all = useMemo(
    () => [...messages, ...optimistic.filter((o) => !messages.find((m) => m.id === o.id))],
    [messages, optimistic],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [all.length, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    markConversationRead(conversationId, currentUserId).then(() => {
      qc.invalidateQueries({ queryKey: ["messages-unread-count", currentUserId] });
    });
  }, [conversationId, currentUserId, qc, messages.length]);

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`booking-msgs:${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as MessageRow;
          if (m.sender_id !== currentUserId) {
            qc.setQueryData<MessageRow[]>(["booking-messages", conversationId], (prev = []) =>
              prev.find((x) => x.id === m.id) ? prev : [...prev, m],
            );
            markConversationRead(conversationId, currentUserId);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, currentUserId, qc]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending || !conversationId || archived) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const opt: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: text,
      is_flagged: false,
      created_at: new Date().toISOString(),
    };
    setOptimistic((p) => [...p, opt]);
    setBody("");
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: currentUserId, body: text })
        .select("id, conversation_id, sender_id, body, created_at, is_flagged")
        .single();
      if (error) throw error;
      setOptimistic((p) => p.filter((m) => m.id !== tempId));
      qc.setQueryData<MessageRow[]>(["booking-messages", conversationId], (prev = []) =>
        prev.find((x) => x.id === data.id) ? prev : [...prev, data as MessageRow],
      );
    } catch (e: any) {
      setOptimistic((p) => p.filter((m) => m.id !== tempId));
      setBody(text);
      toast.error("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-md border bg-white">
      <div className="border-b bg-muted/30 px-4 py-3">
        <p className="font-display text-base">Messages with {otherName}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Messages are recorded and visible to Designerex moderators.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {!conversationId ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Opening conversation…</p>
        ) : all.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No messages yet. Send the first one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {all.map((m) => {
              const mine = m.sender_id === currentUserId;
              const pending = m.id.startsWith("temp-");
              return (
                <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                      mine ? "bg-pink text-pink-foreground" : "bg-muted text-ink",
                      pending && "opacity-60",
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                    {format(parseISO(m.created_at), "h:mm a")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {archived ? (
        <div className="border-t bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
          This conversation is archived.
        </div>
      ) : (
        <div className="border-t bg-white px-3 py-3">
          {quickReplies.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickReplies.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setBody(q);
                    taRef.current?.focus();
                  }}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-ink/80 hover:border-pink hover:text-pink"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder="Write a message…"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-muted/40 px-3 py-2 text-sm focus:border-pink focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!body.trim() || sending || !conversationId}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink text-pink-foreground disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
