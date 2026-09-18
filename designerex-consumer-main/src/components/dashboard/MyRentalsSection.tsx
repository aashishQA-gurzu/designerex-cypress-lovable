import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Truck, PackageCheck, Shirt, AlertTriangle, MessageSquareWarning, ArrowRight, XCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { findOrCreateEnquiry, useBookingConversationMap } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import { WriteReviewButton } from "@/components/reviews/WriteReviewButton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TryOnBadge, formatTryOnWhen } from "@/components/dashboard/TryOnBadge";
import { explainRejection, type RejectionInfoRow } from "@/lib/rejection-explanations";


const CANCEL_REASONS = [
  "Change of plans",
  "Found another dress",
  "Dates no longer work",
  "Booked by mistake",
  "Other",
] as const;

function canRenterCancel(r: Rental): boolean {
  if (r.status === "requested" || r.phase === "pending") return true;
  if (r.status === "accepted") {
    const s = r.outbound_status;
    if (!s || s === "pending" || s === "label_created" || s === "awaiting_pickup") return true;
  }
  return false;
}

function CancelBookingDialog({
  rental,
  open,
  onOpenChange,
}: {
  rental: Rental | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!rental) throw new Error("No booking selected");
      const finalReason = reason === "Other" ? (details.trim() || "Other") : reason;
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_by: "renter",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: finalReason,
        })
        .eq("id", rental.booking_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["my-active-rentals"] });
      qc.invalidateQueries({ queryKey: ["my-past-rentals"] });
      onOpenChange(false);
      setReason("");
      setDetails("");
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Could not cancel booking.");
    },
  });

  const disabled =
    mutation.isPending ||
    !reason ||
    (reason === "Other" && details.trim().length === 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            {rental?.dress_title ? `"${rental.dress_title}"` : "This booking"} will be cancelled.
            Any refund will be processed according to the cancellation policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">Reason</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {reason === "Other" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink">Tell us more</label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Briefly describe why you're cancelling"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Keep booking
          </Button>
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Cancelling…" : "Cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Rental = {
  booking_id: string;
  dress_id: string;
  dress_title: string | null;
  dress_image: string | null;
  lender_id: string;
  lender_name: string | null;
  lender_avatar: string | null;
  start_date: string;
  end_date: string;
  status: string;
  phase: "pending" | "upcoming" | "in_use" | "return_due" | "dispute";
  days_until_start: number;
  days_until_return: number;
  outbound_tracking: string | null;
  outbound_status: string | null;
  return_tracking: string | null;
  return_status: string | null;
};

const humanise = (s: string | null) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const fmtShort = (iso: string) => {
  try {
    return format(parseISO(iso), "d MMM");
  } catch {
    return iso;
  }
};

const dayLabel = (n: number, unit: "start" | "return") => {
  if (unit === "start") {
    if (n <= 0) return "Starts today";
    if (n === 1) return "Starts tomorrow";
    return `Starts in ${n} days`;
  }
  if (n === 0) return "Return due today";
  if (n === 1) return "Return due tomorrow";
  return `Return in ${n} days`;
};

export type TryOnInfo = { pickup: string; period?: string | null };

/** Snapshots may be plain text or a jsonb address object. Render either safely. */
export function formatSnapshot(snap: unknown): string {
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

export function MyRentalsSection() {

  const { user } = useAuth();
  const navigate = useNavigate();
  const [cancelTarget, setCancelTarget] = useState<Rental | null>(null);

  const active = useQuery({
    queryKey: ["my-active-rentals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_my_active_rentals" as any);
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Rental[];
    },
  });

  const past = useQuery({
    queryKey: ["my-past-rentals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_my_past_rentals" as any);
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Rental[];
    },
  });

  // The rentals RPCs don't carry hire_option, so resolve the renter's try-on
  // bookings (and their pickup snapshots) in one small lookup.
  const tryOns = useQuery({
    queryKey: ["my-try-on-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, try_on_period, try_on_address_snapshot, try_on_location_snapshot")
        .eq("renter_id", user!.id)
        .eq("hire_option", "try_on");
      if (error) throw error;
      const map: Record<string, TryOnInfo> = {};
      for (const b of (data ?? []) as any[]) {
        map[b.id] = {
          period: b.try_on_period ?? null,
          pickup:
            formatSnapshot(b.try_on_address_snapshot) ||
            formatSnapshot(b.try_on_location_snapshot),
        };
      }
      return map;
    },
  });
  const tryOnMap = tryOns.data ?? {};

  // Declined / expired requests need the reason code and payment fields so the
  // renter sees why, and whether anything was taken from them.
  const endedIds = (past.data ?? [])
    .filter((r) => r.status === "rejected" || r.status === "expired")
    .map((r) => r.booking_id);

  const rejectionInfo = useQuery({
    queryKey: ["my-rental-rejections", user?.id, endedIds.join(",")],
    enabled: !!user && endedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .in("id", endedIds);
      if (error) throw error;
      const map: Record<string, RejectionInfoRow> = {};
      for (const b of (data ?? []) as any[]) map[b.id] = b as RejectionInfoRow;
      return map;
    },
  });
  const rejectionMap = rejectionInfo.data ?? {};

  // Every booking already has a conversation row (created when the booking is requested).
  const bookingConvs = useBookingConversationMap(user?.id);
  const convMap = bookingConvs.data ?? {};


  const openIssueThread = async (r: Rental) => {
    if (!user) return;
    try {
      const conversationId = await findOrCreateEnquiry({
        dressId: r.dress_id,
        renterId: user.id,
        lenderId: r.lender_id,
        body: `Hi — I'd like to report an issue with my rental of "${r.dress_title ?? "this dress"}" (${fmtShort(r.start_date)}–${fmtShort(r.end_date)}).`,
      });
      navigate({ to: "/dashboard/messages", search: { c: conversationId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open conversation.");
    }
  };

  return (
    <div className="space-y-10">
      <Section
        heading="Active rentals"
        subtitle="Your active and upcoming rentals, sorted by what needs your attention first."
        query={active}
        variant="active"
        onReportIssue={openIssueThread}
        onCancel={setCancelTarget}
        tryOnMap={tryOnMap}
        convMap={convMap}
        emptyTitle="No active rentals"
        emptyBody="When you book a dress, it'll show up here so you can track shipping and returns."
        showBrowseCta
      />
      <Section
        heading="Past rentals"
        subtitle="Completed, cancelled, declined and expired rentals."
        query={past}
        variant="past"
        onReportIssue={openIssueThread}
        onCancel={setCancelTarget}
        tryOnMap={tryOnMap}
        rejectionMap={rejectionMap}
        convMap={convMap}
        emptyTitle="No past rentals"
        emptyBody="Your rental history will appear here."
      />
      <CancelBookingDialog
        rental={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(v) => { if (!v) setCancelTarget(null); }}
      />
    </div>
  );
}


function Section({
  heading,
  subtitle,
  query,
  variant,
  onReportIssue,
  onCancel,
  tryOnMap,
  rejectionMap,
  convMap,
  emptyTitle,
  emptyBody,
  showBrowseCta,
}: {
  heading: string;
  subtitle: string;
  query: ReturnType<typeof useQuery<Rental[], Error>>;
  variant: "active" | "past";
  onReportIssue: (r: Rental) => void;
  onCancel: (r: Rental) => void;
  tryOnMap: Record<string, TryOnInfo>;
  rejectionMap?: Record<string, RejectionInfoRow>;
  convMap: Record<string, string>;
  emptyTitle: string;
  emptyBody: string;
  showBrowseCta?: boolean;
}) {

  const { data, isLoading, isError, error, refetch } = query;
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className={cn("font-display text-ink", variant === "active" ? "text-3xl" : "text-2xl")}>
            {heading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {variant === "active" && (
          <Link to="/dashboard/rentals" className="hidden sm:inline text-xs text-magenta hover:underline">
            View all rentals →
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-[10px] border border-border bg-surface" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-[10px] border border-border bg-surface p-6 text-center">
          <p className="text-sm text-ink">We couldn't load your rentals.</p>
          <p className="mt-1 text-xs text-muted-foreground">{(error as any)?.message ?? "Please try again."}</p>
          <button onClick={() => refetch()} className="btn-outline mt-4 text-xs">
            Try again
          </button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-display text-xl text-ink">{emptyTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{emptyBody}</p>
          {showBrowseCta && (
            <Link to="/browse" className="btn-magenta mt-5 inline-flex items-center gap-2 text-xs">
              Browse dresses <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      ) : (
        <div className={cn("space-y-4", variant === "past" && "opacity-95")}>
          {data.map((r) => (
            <RentalCard key={r.booking_id} r={r} variant={variant} onReportIssue={onReportIssue} onCancel={onCancel} tryOn={tryOnMap[r.booking_id]} rejection={rejectionMap?.[r.booking_id]} conversationId={convMap[r.booking_id]} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Every booking status gets its own clearly-labelled badge, so a renter is
 * never left guessing which phase they're in. `dispute` is a phase rather than
 * a stored status, and it outranks the status it sits on. Anything unexpected
 * from the database still renders a readable badge rather than nothing.
 */
const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-amber-100 text-amber-800" },
  accepted: { label: "Accepted", className: "bg-blue-100 text-blue-800" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" },
  rejected: { label: "Declined", className: "bg-rose-100 text-rose-800" },
  cancelled: { label: "Cancelled", className: "bg-bg-tint text-muted-foreground ring-1 ring-border" },
  expired: { label: "Expired", className: "bg-muted text-ink/60 ring-1 ring-border" },
  dispute: { label: "In Dispute", className: "bg-red-600 text-white" },
};

function humaniseStatus(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function StatusBadge({ r }: { r: Rental }) {
  const key = r.phase === "dispute" ? "dispute" : String(r.status ?? "").toLowerCase();
  const badge =
    STATUS_BADGES[key] ??
    ({
      label: key ? humaniseStatus(key) : "Unknown status",
      className: "bg-bg-tint text-ink ring-1 ring-border",
    } as const);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

function ActiveStatusBadge({ r }: { r: Rental }) {
  if (r.phase === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
        Awaiting lender response
      </span>
    );
  }
  if (r.phase === "dispute") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        In dispute
      </span>
    );
  }
  if (r.phase === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-tint px-2.5 py-1 text-[11px] font-medium text-ink">
        {dayLabel(r.days_until_start, "start")}
      </span>
    );
  }
  if (r.phase === "in_use") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
        {dayLabel(r.days_until_return, "return")}
      </span>
    );
  }
  // phase === "return_due" — drive entirely off return_status + status from the RPC.
  if (r.return_status === "in_transit") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-800">
        <Truck className="h-3 w-3" />
        Return on its way
      </span>
    );
  }
  if (r.return_status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
        <PackageCheck className="h-3 w-3" />
        Returned
      </span>
    );
  }
  if (r.status === "active") {
    const overdue = Math.abs(r.days_until_return);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Overdue by {overdue} day{overdue === 1 ? "" : "s"}
      </span>
    );
  }
  // Fallback — show plain phase label, no overdue.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-tint px-2.5 py-1 text-[11px] font-medium text-ink">
      Return due
    </span>
  );
}


function Timeline({ r }: { r: Rental }) {
  const stages = [
    { key: "shipped", label: "Shipped", icon: Truck },
    { key: "worn", label: `Worn (${fmtShort(r.start_date)}–${fmtShort(r.end_date)})`, icon: Shirt },
    { key: "returned", label: "Returned", icon: PackageCheck },
  ];
  const activeIdx = r.phase === "upcoming" ? 0 : r.phase === "in_use" ? 1 : 2;

  return (
    <ol className="grid min-w-0 grid-cols-3 gap-1 sm:gap-3">
      {stages.map((s, i) => {
        const Icon = s.icon;
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        return (
          <li key={s.key} className="flex min-w-0 flex-col items-center gap-1 text-center sm:flex-row sm:gap-2 sm:text-left">
            <div
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border",
                isActive && "border-magenta bg-magenta text-white",
                isPast && "border-magenta/60 bg-magenta/10 text-magenta",
                !isActive && !isPast && "border-border bg-surface text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span
              className={cn(
                "w-full min-w-0 text-[10px] leading-tight sm:truncate sm:text-xs",
                isActive ? "font-medium text-ink" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "ml-1 hidden h-px flex-1 sm:block",
                  i < activeIdx ? "bg-magenta/50" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ShippingRow({
  label,
  tracking,
  status,
  emptyText,
}: {
  label: string;
  tracking: string | null;
  status: string | null;
  emptyText: string | null;
}) {
  if (!tracking && !emptyText) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-tint/40 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {tracking ? (
        <span className="flex items-center gap-2 text-xs text-ink">
          <span className="font-medium">{humanise(status) || "Pending"}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{tracking}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{emptyText}</span>
      )}
    </div>
  );
}

function RentalCard({
  r,
  variant,
  onReportIssue,
  onCancel,
  tryOn,
  rejection,
  conversationId,
}: {
  r: Rental;
  variant: "active" | "past";
  onReportIssue: (r: Rental) => void;
  onCancel: (r: Rental) => void;
  tryOn?: TryOnInfo;
  rejection?: RejectionInfoRow;
  conversationId?: string;
}) {
  const isPast = variant === "past";
  const ended = r.status === "rejected" || r.status === "expired";
  const outcome = ended ? explainRejection(rejection ?? null, r.status) : null;
  const isTryOn = !!tryOn;
  // Try-ons are collected in person — no shipping, tracking or return flow applies.
  const noTracking = isTryOn || (!isPast && (r.phase === "pending" || r.phase === "dispute"));
  const showReturnRow =
    !isPast && !noTracking && (r.return_tracking || r.phase === "in_use" || r.phase === "return_due");
  const showReturnBtn = !isTryOn && !isPast && !noTracking && (r.phase === "in_use" || r.phase === "return_due") && r.status === "active";
  const showCancelBtn = !isPast && canRenterCancel(r);


  return (
    <article
      className={cn(
        "rounded-[10px] border border-border bg-surface p-4 shadow-sm sm:p-5",
        isPast && "bg-bg-tint/30",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {r.dress_image ? (
          <img
            src={r.dress_image}
            alt=""
            className={cn(
              "flex-shrink-0 rounded-md object-cover",
              isPast ? "h-20 w-20" : "h-24 w-24 sm:h-28 sm:w-28",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex-shrink-0 rounded-md bg-bg-tint",
              isPast ? "h-20 w-20" : "h-24 w-24 sm:h-28 sm:w-28",
            )}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={cn("truncate font-display text-ink", isPast ? "text-lg" : "text-xl")}>
                  {r.dress_title ?? "Dress"}
                </h3>
                {isTryOn && <TryOnBadge />}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {r.lender_avatar ? (
                  <img src={r.lender_avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-white">
                    {(r.lender_name?.[0] ?? "L").toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-muted-foreground">
                  from <span className="text-ink">{r.lender_name ?? "Lender"}</span>
                </span>
                {(isPast || noTracking) && (
                  <span className="text-xs text-muted-foreground">
                    · {isTryOn
                      ? formatTryOnWhen(format(parseISO(r.start_date), "EEE d MMM"), tryOn?.period)
                      : `${fmtShort(r.start_date)}–${fmtShort(r.end_date)}`}
                  </span>
                )}
              </div>
              {isTryOn && tryOn?.pickup && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider">Pickup address</span>
                  {" · "}
                  <span className="text-ink">{tryOn.pickup}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge r={r} />
              {!isPast && <ActiveStatusBadge r={r} />}
            </div>
          </div>

          {outcome && (
            <div className="mt-3 rounded-md border border-border bg-bg-tint/60 px-3 py-2.5">
              <p className="text-sm text-ink">{outcome.message}</p>
              {outcome.chargeNote && (
                <p className={cn("mt-1 text-xs font-medium", outcome.charged ? "text-foreground" : "text-emerald-800")}>{outcome.chargeNote}</p>
              )}
            </div>
          )}

          {isPast && r.status === "completed" && (
            <div className="mt-3 flex justify-start">
              <WriteReviewButton bookingId={r.booking_id} lenderId={r.lender_id} size="sm" />
            </div>
          )}


          {!isPast && !noTracking && (
            <div className="mt-4">
              <Timeline r={r} />
            </div>
          )}
        </div>
      </div>

      {!isPast && !noTracking && (
        <div className="mt-4 space-y-2">
          <ShippingRow
            label="Outbound"
            tracking={r.outbound_tracking}
            status={r.outbound_status}
            emptyText="Not yet shipped"
          />
          {showReturnRow && (
            <ShippingRow
              label="Return"
              tracking={r.return_tracking}
              status={r.return_status}
              emptyText={r.return_tracking ? null : "Return not started"}
            />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {conversationId && (
          <Link
            to="/dashboard/messages"
            search={{ c: conversationId }}
            className="btn-outline inline-flex items-center justify-center gap-1.5 text-xs"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Message lender
          </Link>
        )}
      </div>

      {!isPast && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => onReportIssue(r)}
            className="btn-outline inline-flex items-center justify-center gap-1.5 text-xs"
          >
            <MessageSquareWarning className="h-3.5 w-3.5" />
            Report an issue
          </button>
          {showCancelBtn && (
            <button
              onClick={() => onCancel(r)}
              className="btn-outline inline-flex items-center justify-center gap-1.5 text-xs text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {r.status === "requested" || r.phase === "pending" ? "Cancel request" : "Cancel booking"}
            </button>
          )}
          {showReturnBtn && (
            <Link
              to="/dashboard/rentals/$bookingId/return"
              params={{ bookingId: r.booking_id }}
              className="btn-magenta inline-flex items-center justify-center gap-1.5 text-xs"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Return this dress
            </Link>
          )}

        </div>
      )}
    </article>
  );
}
