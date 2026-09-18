import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { format, parseISO, differenceInMilliseconds, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Star, Calendar, Heart, Truck, MapPin, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { cn } from "@/lib/utils";
import { TryOnBadge, isTryOnBooking, formatTryOnWhen } from "@/components/dashboard/TryOnBadge";
import { datesAlreadyTaken, DATES_TAKEN_LABEL, isDatesUnavailableError } from "@/lib/dates-taken";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

function BookingRequestsRoute() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (profile && !profile.is_lender) {
      navigate({ to: "/dashboard" });
    }
  }, [profile, navigate]);
  if (!profile?.is_lender) return null;
  return (
    <LenderGate>
      <BookingRequestsPage />
    </LenderGate>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/booking-requests")({
  ssr: false,
  component: BookingRequestsRoute,
});

type Tab = "pending" | "accepted" | "awaiting_shipment" | "active" | "completed";

const TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "awaiting_shipment", label: "Awaiting Shipment" },
  { id: "active", label: "Active Rentals" },
  { id: "completed", label: "Completed" },
];

import {
  REJECTION_REASON_MAX, BLACKOUT_LABEL, BLACKOUT_HELP,
  isOtherReason, isRequestExpired, EXPIRED_REQUEST_LABEL, type DeclineReason,
} from "@/lib/booking-reject";
import { useDeclineReasons } from "@/hooks/useDeclineReasons";
import { SimpleSelect } from "@/components/ui/simple-select";

const HIRE_LABEL: Record<string, string> = {
  hire_a: "4 day hire",
  hire_b: "8 day hire",
  try_on: "Try-on",
};

const HIRE_DAYS: Record<string, number> = {
  hire_a: 4,
  hire_b: 8,
  try_on: 1,
};

function matchesTab(status: string, tab: Tab): boolean {
  switch (tab) {
    case "pending": return status === "requested";
    // NOTE: existing schema has no separate "awaiting_shipment" state — both
    // tabs show `accepted` rows (action on each is "Mark as shipped").
    case "accepted":
    case "awaiting_shipment": return status === "accepted";
    case "active": return status === "active";
    case "completed": return ["completed", "cancelled", "rejected"].includes(status);
  }
}

export function BookingRequestsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [accepting, setAccepting] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectCode, setRejectCode] = useState<string>("");
  const { data: declineReasons, isLoading: reasonsLoading, error: reasonsError } = useDeclineReasons();
  const selectedReason: DeclineReason | null =
    (declineReasons ?? []).find((r) => r.code === rejectCode) ?? null;
  const needsDetails = isOtherReason(selectedReason);
  const [rejectNotes, setRejectNotes] = useState("");
  const [blockDates, setBlockDates] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["lender-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, status, start_date, end_date, created_at, hire_option, try_on_period, shipping_type,
           rental_fee, lender_payout_amount, renter_id, dress_id,
           dress:dresses!bookings_dress_id_fkey(id, title, size, images:dress_images(url, position), brand:brands!dresses_brand_id_fkey(name))`,
        )
        .eq("lender_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const renterIds = [...new Set(rows.map((r: any) => r.renter_id).filter(Boolean))];
      if (renterIds.length === 0) return rows;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, avatar_url, average_rating, city")
        .in("id", renterIds);
      const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, renter: pMap.get(r.renter_id) ?? null }));
    },
  });

  const counts = useMemo(() => {
    const rows = bookings ?? [];
    const c: Record<Tab, number> = {
      pending: 0, accepted: 0, awaiting_shipment: 0, active: 0, completed: 0,
    };
    for (const b of rows as any[]) {
      for (const t of TABS) if (matchesTab(b.status, t.id)) c[t.id]++;
    }
    return c;
  }, [bookings]);

  const filtered = useMemo(() => {
    const rows = bookings ?? [];
    return (rows as any[]).filter((b) => matchesTab(b.status, tab));
  }, [bookings, tab]);

  /* Which pending requests can no longer be accepted (overlapping booking) */
  const pendingKey = useMemo(
    () =>
      ((bookings ?? []) as any[])
        .filter((b) => b.status === "requested")
        .map((b) => `${b.id}:${b.dress_id}:${b.start_date}:${b.end_date}`)
        .join("|"),
    [bookings],
  );

  const { data: takenIds } = useQuery({
    queryKey: ["lender-requests-dates-taken", pendingKey],
    enabled: pendingKey.length > 0,
    queryFn: async () => {
      const pending = ((bookings ?? []) as any[]).filter((b) => b.status === "requested");
      const results = await Promise.all(
        pending.map(async (b) => {
          if (!b.dress_id || !b.start_date) return null;
          const taken = await datesAlreadyTaken({
            dressId: b.dress_id,
            start: b.start_date,
            end: b.end_date ?? b.start_date,
            excludeBookingId: b.id,
          });
          return taken ? (b.id as string) : null;
        }),
      );
      return new Set(results.filter(Boolean) as string[]);
    },
  });

  const confirmAccept = async () => {
    if (!accepting) return;
    setBusy(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "accepted" })
      .eq("id", accepting.id);
    setBusy(false);
    if (error) {
      if (isDatesUnavailableError(error)) {
        toast.error(DATES_TAKEN_LABEL);
        setAccepting(null);
        qc.invalidateQueries({ queryKey: ["lender-requests-dates-taken"] });
        qc.invalidateQueries({ queryKey: ["lender-bookings"] });
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success("Booking accepted. Renter has been notified.");
    setAccepting(null);
    qc.invalidateQueries({ queryKey: ["lender-bookings"] });
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const trimmed = rejectNotes.trim();
    setBusy(true);
    const payload: any = {
      status: "rejected",
      rejection_reason_code: rejectCode,
      // Free text is only meaningful for "Other" — never send it otherwise.
      rejection_reason: needsDetails ? trimmed.slice(0, REJECTION_REASON_MAX) : null,
      blackout_on_reject: blockDates,
      cancelled_by: "lender",
      rejected_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("bookings").update(payload).eq("id", rejecting.id);
    setBusy(false);
    if (error) {
      // The database owns these rules — surface its message verbatim.
      toast.error(error.message);
      return;
    }
    toast.success(
      blockDates
        ? "Booking declined and those dates blocked."
        : "Booking declined. Renter has been notified.",
    );
    setRejecting(null);
    setRejectNotes("");
    setBlockDates(false);
    setRejectCode("");
    qc.invalidateQueries({ queryKey: ["lender-bookings"] });
  };

  const markShipped = async (b: any) => {
    try {
      await supabase.from("shipments")
        .update({ status: "in_transit" })
        .eq("booking_id", b.id)
        .eq("direction", "outbound");
      const { error } = await supabase
        .from("bookings")
        .update({ status: "active" })
        .eq("id", b.id);
      if (error) throw new Error(error.message);
      qc.setQueryData(["lender-bookings", user?.id], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((row: any) => (row.id === b.id ? { ...row, status: "active" } : row));
      });
      toast.success("Marked as shipped.");
      await qc.invalidateQueries({ queryKey: ["lender-bookings"], refetchType: "all" });
    } catch (err: any) {
      toast.error(`Failed: ${err?.message ?? "Could not mark as shipped"}`);
    }
  };

  const markReturned = async (b: any) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Booking marked as completed.");
    qc.invalidateQueries({ queryKey: ["lender-bookings"] });
  };

  return (
    <div>
      {/* Panel header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl text-ink">Booking Requests</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Review and manage incoming booking requests.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs uppercase tracking-[0.12em] text-ink hover:bg-bg-tint"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
        </button>
      </div>

      {/* Status tabs */}
      <div className="mb-6 -mx-4 overflow-x-auto px-4">
        <div className="flex gap-1 whitespace-nowrap border-b border-border">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs uppercase tracking-[0.12em] transition-colors",
                  active
                    ? "border-magenta text-magenta"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    active ? "bg-magenta text-white" : "bg-muted text-ink-muted",
                  )}
                >
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-4">
          {filtered.map((b: any) => (
            <RequestCard
              key={b.id}
              booking={b}
              unacceptable={!!takenIds?.has(b.id)}
              expired={isRequestExpired(b)}
              onAccept={() => setAccepting(b)}
              onReject={() => setRejecting(b)}
              onShipped={() => markShipped(b)}
              onReturned={() => markReturned(b)}
            />
          ))}
        </div>
      )}

      {/* Accept modal */}
      <Dialog open={!!accepting} onOpenChange={(o) => !o && setAccepting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept booking?</DialogTitle>
            <DialogDescription>
              Accepting will charge the renter's card and confirm the booking. Proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setAccepting(null)} className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-bg-tint">
              Cancel
            </button>
            <button
              onClick={confirmAccept}
              disabled={busy}
              className="rounded-md bg-magenta px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Accepting…" : "Yes, accept"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject modal */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline booking</DialogTitle>
            <DialogDescription>
              Let the renter know why so they can find another dress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-ink-muted">
                Reason <span className="text-red-600">*</span>
              </label>
              <SimpleSelect
                value={rejectCode}
                onValueChange={setRejectCode}
                disabled={reasonsLoading || !!reasonsError}
                aria-label="Decline reason"
                placeholder={reasonsLoading ? "Loading reasons…" : "Choose a reason"}
                className="w-full rounded-md border-border bg-surface px-3 py-2 text-sm"
                options={(declineReasons ?? []).map((r) => ({ value: r.code, label: r.label }))}
              />
              {reasonsError && (
                <p className="mt-1 text-xs text-red-600">{(reasonsError as any).message}</p>
              )}
            </div>
            {needsDetails && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-ink-muted">
                  More details <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value.slice(0, REJECTION_REASON_MAX))}
                  rows={3}
                  required
                  maxLength={REJECTION_REASON_MAX}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="A brief reason so the renter knows what happened…"
                />
                <p className="mt-1 text-right text-[11px] text-ink-muted">
                  {rejectNotes.length}/{REJECTION_REASON_MAX}
                </p>
              </div>
            )}
            <label className="flex items-start gap-2.5 rounded-md border border-border bg-bg-tint/60 p-3">
              <input
                type="checkbox"
                checked={blockDates}
                onChange={(e) => setBlockDates(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-magenta)]"
              />
              <span>
                <span className="block text-sm text-ink">{BLACKOUT_LABEL}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{BLACKOUT_HELP}</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <button onClick={() => setRejecting(null)} className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:bg-bg-tint">
              Cancel
            </button>
            <button
              onClick={confirmReject}
              disabled={busy || !rejectCode || (needsDetails && !rejectNotes.trim())}
              className="rounded-md bg-magenta px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Declining…" : "Decline booking"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg =
    tab === "pending"
      ? "No pending requests right now. Make sure your dresses are well-photographed and competitively priced to get more bookings."
      : tab === "accepted"
      ? "No accepted bookings."
      : tab === "awaiting_shipment"
      ? "Nothing awaiting shipment."
      : tab === "active"
      ? "No active rentals."
      : "No completed bookings yet.";
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
      <p className="mx-auto max-w-md text-sm text-ink-muted">{msg}</p>
    </div>
  );
}

function ExpiresTag({ createdAt }: { createdAt: string }) {
  const deadline = new Date(parseISO(createdAt).getTime() + 24 * 60 * 60 * 1000);
  const ms = differenceInMilliseconds(deadline, new Date());
  let label: string;
  if (ms <= 0) label = "Expired";
  else {
    const hours = Math.floor(ms / 1000 / 60 / 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    label = `Expires in ${hours > 0 ? `${hours}h` : `${minutes}m`}`;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-bg-tint px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-magenta">
      {label}
    </span>
  );
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function RequestCard({
  booking, unacceptable, expired, onAccept, onReject, onShipped, onReturned,
}: {
  booking: any;
  unacceptable?: boolean;
  expired?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onShipped: () => void;
  onReturned: () => void;
}) {
  const img = ((booking.dress?.images ?? []) as any[])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;

  const tryOn = isTryOnBooking(booking.hire_option);
  const days = tryOn ? null : (HIRE_DAYS[booking.hire_option] ?? null);
  const isPickup = tryOn || (booking.shipping_type ?? "").toLowerCase().includes("pick");
  const isExpress = !tryOn && (booking.shipping_type ?? "").toLowerCase().includes("express");


  return (
    <article className="relative rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <button
        type="button"
        aria-label="Save"
        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-bg-tint hover:text-magenta"
      >
        <Heart className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-5 sm:flex-row">
        {/* Image */}
        <div className="shrink-0">
          {img ? (
            <img src={img} alt="" className="h-32 w-32 rounded-lg object-cover sm:h-36 sm:w-28" />
          ) : (
            <div className="h-32 w-32 rounded-lg bg-muted sm:h-36 sm:w-28" />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-3 pr-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink-muted">#{shortId(booking.id)}</span>
            {tryOn && <TryOnBadge />}
            {booking.status === "requested" && booking.created_at && (
              <ExpiresTag createdAt={booking.created_at} />
            )}
          </div>


          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              {booking.dress?.brand?.name ?? "Designer"}
            </p>
            <p className="truncate font-display text-xl text-ink">
              {booking.dress?.title ?? "Dress"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-ink-muted">
              {booking.dress?.size ? `Size ${booking.dress.size}` : "Size —"}
              {days != null && <> &nbsp;•&nbsp; {days} DAYS</>}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-ink">
            <Calendar className="h-4 w-4 text-magenta" />
            <span>
              {booking.start_date && (tryOn
                ? formatTryOnWhen(format(parseISO(booking.start_date), "EEE d MMM"), booking.try_on_period)
                : format(parseISO(booking.start_date), "EEE d MMM"))}
              {!tryOn && booking.end_date && booking.end_date !== booking.start_date && (
                <> &nbsp;→&nbsp; {format(parseISO(booking.end_date), "EEE d MMM")}</>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              {booking.renter?.avatar_url ? (
                <img src={booking.renter.avatar_url} className="h-7 w-7 rounded-full object-cover" alt="" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted" />
              )}
              <span className="text-ink">{booking.renter?.first_name ?? "Renter"}</span>
              {booking.renter?.average_rating ? (
                <span className="inline-flex items-center gap-0.5 text-xs text-ink-muted">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {Number(booking.renter.average_rating).toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              {isPickup ? <MapPin className="h-3.5 w-3.5 text-magenta" /> : <Truck className="h-3.5 w-3.5 text-magenta" />}
              {tryOn
                ? "Collected in person"
                : isPickup
                  ? `Pickup${booking.renter?.city ? ` in ${booking.renter.city}` : ""}`
                  : isExpress
                    ? "Express Shipping"
                    : "Standard Shipping"}

              {!isPickup && booking.end_date && (
                <span className="text-ink-muted">
                  &nbsp;• Arrives by {format(parseISO(booking.end_date), "d MMM")}
                </span>
              )}
            </span>
            {booking.created_at && (
              <span>
                Requested {formatDistanceToNow(parseISO(booking.created_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {booking.status === "requested" ? (
          expired ? (
            <>
              <span
                role="status"
                className="inline-flex select-none items-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-ink-muted"
              >
                {EXPIRED_REQUEST_LABEL}
              </span>
              <Link
                to="/dashboard/booking-requests/$bookingId"
                params={{ bookingId: booking.id }}
                className="text-sm font-medium text-magenta hover:underline"
              >
                Message renter
              </Link>
            </>
          ) : (
          <>
            {unacceptable ? (
              <span
                role="status"
                aria-disabled="true"
                className="inline-flex cursor-not-allowed select-none items-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-ink-muted"
              >
                {DATES_TAKEN_LABEL}
              </span>
            ) : (
              <button
                onClick={onAccept}
                className="rounded-md bg-magenta px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Accept Booking
              </button>
            )}
            <button
              onClick={onReject}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-bg-tint"
            >
              Decline
            </button>
            <Link
              to="/dashboard/booking-requests/$bookingId"
              params={{ bookingId: booking.id }}
              className="text-sm font-medium text-magenta hover:underline"
            >
              Message renter
            </Link>
          </>
          )
        ) : booking.status === "accepted" ? (
          <button
            onClick={onShipped}
            className="rounded-md bg-magenta px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Mark as Shipped
          </button>
        ) : booking.status === "active" ? (
          <button
            onClick={onReturned}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-bg-tint"
          >
            Mark as Returned
          </button>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            {booking.status}
          </span>
        )}

        <div className="ml-auto text-right">
          <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">Your payout</p>
          <p className="font-display text-lg text-magenta">
            ${Number(booking.lender_payout_amount ?? 0).toFixed(2)}
          </p>
        </div>

        <Link
          to="/dashboard/booking-requests/$bookingId"
          params={{ bookingId: booking.id }}
          className="w-full text-right text-sm font-medium text-magenta hover:underline sm:w-auto"
        >
          View Details →
        </Link>
      </div>
    </article>
  );
}
