import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, formatDistanceToNow, startOfMonth, endOfMonth, addMonths, subMonths, startOfDay, isSameMonth, isSameDay } from "date-fns";
import {
  ShoppingBag,
  Inbox,
  TrendingUp,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Bell,
  MessageSquare,
  Heart,
  CalendarCheck,
  Clock,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { UltraResponsiveBadge } from "@/components/UltraResponsiveBadge";
import { SuperLenderBadge } from "@/components/SuperLenderBadge";
import { MyRentalsSection } from "@/components/dashboard/MyRentalsSection";
import { AvailabilityAlertsSection } from "@/components/dashboard/AvailabilityAlertsSection";
import { Crown, Check } from "lucide-react";
import { z } from "zod";
import { BookingRequestsPage } from "./booking-requests";
import { formatTryOnWhen, isTryOnBooking } from "@/components/dashboard/TryOnBadge";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  ssr: false,
  validateSearch: z.object({
    tab: z.string().optional(),
  }),
  component: DashboardHome,
});

type DashView = "lending" | "renting";

function DashboardHome() {
  const { user, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const { tab } = Route.useSearch();
  const isLender = Boolean((profile as any)?.is_lender);
  const savedView = (profile as any)?.dashboard_default_view as DashView | null | undefined;
  const [view, setView] = useState<DashView>(
    isLender ? (savedView === "renting" ? "renting" : "lending") : "renting",
  );
  // Sync once profile loads / changes
  useEffect(() => {
    if (!isLender) {
      setView("renting");
    } else if (savedView === "renting" || savedView === "lending") {
      setView(savedView);
    }
  }, [isLender, savedView]);

  const switchView = (next: DashView) => {
    if (next === view) return;
    setView(next); // optimistic
    if (!user) return;
    supabase
      .from("profiles")
      .update({ dashboard_default_view: next } as any)
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) {
          toast.error("Couldn't save your preference.");
        } else {
          refreshProfile?.();
        }
      });
  };

  /* ---------- stats ---------- */
  const today = useMemo(() => startOfDay(new Date()).toISOString().slice(0, 10), []);
  const monthStart = useMemo(() => startOfMonth(new Date()).toISOString().slice(0, 10), []);
  const monthEnd = useMemo(() => endOfMonth(new Date()).toISOString().slice(0, 10), []);

  const { data: upcomingBookings = 0 } = useQuery({
    queryKey: ["dash-upcoming-bookings", user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("renter_id", user!.id)
        .in("status", ["accepted", "active", "requested"])
        .gte("end_date", today);
      return count ?? 0;
    },
  });

  const { data: pendingRequests = 0 } = useQuery({
    queryKey: ["dash-pending-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("lender_id", user!.id)
        .eq("status", "requested");
      return count ?? 0;
    },
  });

  const { data: monthlyEarnings } = useQuery({
    queryKey: ["dash-monthly-earnings", user?.id, monthStart, monthEnd],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("lender_payout_amount")
        .eq("lender_id", user!.id)
        .in("status", ["accepted", "active", "completed"])
        .gte("start_date", monthStart)
        .lte("start_date", monthEnd);
      const rows = (data ?? []) as any[];
      const total = rows.reduce((s, r: any) => s + Number(r.lender_payout_amount ?? 0), 0);
      return { total, count: rows.length };
    },
  });

  /* ---------- pending booking requests (top 3) ---------- */
  const { data: requests = [] } = useQuery({
    queryKey: ["dash-requests-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, start_date, end_date, status, hire_option, try_on_period,
          dress:dresses!bookings_dress_id_fkey(id, title, images:dress_images(url, position), brand:brands!dresses_brand_id_fkey(name))
        `)
        .eq("lender_id", user!.id)
        .eq("status", "requested")
        .order("created_at", { ascending: false })
        .limit(3);
      return (data ?? []) as any[];
    },
  });

  /* ---------- overview lender bookings: accepted (upcoming) + active (out with renter) ---------- */
  const { data: lenderOverviewBookings = { upcoming: [], outWithRenter: [] } } = useQuery({
    queryKey: ["dash-lender-overview-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select(`
          id, status, start_date, end_date, hire_option, try_on_period,
          dress:dresses!bookings_dress_id_fkey(id, title, images:dress_images(url, position), brand:brands!dresses_brand_id_fkey(name)),
          shipments(direction, status)
        `)
        .eq("lender_id", user!.id)
        .in("status", ["accepted", "active"])
        .order("start_date", { ascending: true });
      const rows = (data ?? []) as any[];
      const upcoming = rows.filter((r) => {
        if (r.status !== "accepted") return false;
        const outbound = (r.shipments ?? []).find((s: any) => s.direction === "outbound");
        const st = outbound?.status;
        return !st || st === "pending" || st === "label_created";
      });
      const outWithRenter = rows.filter((r) => r.status === "active");
      return { upcoming, outWithRenter };
    },
  });

  /* ---------- recent activity (notifications) ---------- */
  const { data: activity = [] } = useQuery({
    queryKey: ["dash-activity", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link_url, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(6);
      return (data ?? []) as any[];
    },
  });


  /* ---------- availability calendar (lender blackouts + bookings) ---------- */
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const { data: availability } = useQuery({
    queryKey: ["dash-availability", user?.id, calMonth.getFullYear(), calMonth.getMonth()],
    enabled: !!user,
    queryFn: async () => {
      const ms = startOfMonth(calMonth).toISOString().slice(0, 10);
      const me = endOfMonth(calMonth).toISOString().slice(0, 10);
      const [bookings, blackouts, vacations] = await Promise.all([
        supabase.from("bookings").select("start_date, end_date")
          .eq("lender_id", user!.id).in("status", ["accepted", "active"])
          .lte("start_date", me).gte("end_date", ms),
        supabase.from("dress_blackouts").select("start_date, end_date"),
        supabase.from("lender_vacation_periods").select("start_date, end_date").eq("lender_id", user!.id),
      ]);
      return {
        booked: (bookings.data ?? []) as any[],
        unavailable: ([...(blackouts.data ?? []), ...(vacations.data ?? [])]) as any[],
      };
    },
  });

  /* ---------- super lender progress ---------- */
  const { data: superProgress } = useQuery({
    queryKey: ["dash-super-lender-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_my_super_lender_progress" as any);
      if (error) { console.warn("[dx_my_super_lender_progress]", error); return null; }
      const row: any = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });

  /* ---------- accept/decline ---------- */
  const updateRequest = async (id: string, status: "accepted" | "rejected") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "accepted" ? "Booking accepted." : "Booking declined.");
    qc.invalidateQueries({ queryKey: ["dash-requests-list"] });
    qc.invalidateQueries({ queryKey: ["dash-pending-requests"] });
  };

  return (
    <div className="space-y-8">
      {isLender && <DashboardViewSwitcher view={view} onChange={switchView} />}

      {view === "renting" ? (
        <div className="space-y-8">
          <MyRentalsSection />
          <AvailabilityAlertsSection />
        </div>
      ) : tab === "booking-requests" ? (
        <BookingRequestsPage />
      ) : (
        <LendingView
          user={user}
          profile={profile}
          superProgress={superProgress}
          requests={requests}
          lenderOverviewBookings={lenderOverviewBookings}
          activity={activity}
          availability={availability}
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          updateRequest={updateRequest}
        />
      )}
    </div>
  );
}

function DashboardViewSwitcher({
  view,
  onChange,
}: {
  view: DashView;
  onChange: (v: DashView) => void;
}) {
  const opts: { id: DashView; label: string }[] = [
    { id: "lending", label: "Lending" },
    { id: "renting", label: "Renting" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Dashboard view"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-sm"
    >
      {opts.map((o) => {
        const active = view === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-full px-4 py-1.5 font-display text-sm transition-colors",
              active
                ? "bg-magenta text-white"
                : "text-ink hover:bg-bg-tint",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LendingView({
  profile, superProgress,
  requests, lenderOverviewBookings, activity, availability, calMonth, setCalMonth, updateRequest,
}: any) {
  const upcoming = lenderOverviewBookings?.upcoming ?? [];
  const outWithRenter = lenderOverviewBookings?.outWithRenter ?? [];
  return (
    <div className="space-y-8">
      {/* Overview — three booking sections on the lender's own bookings */}
      <div className="space-y-6">
        <OverviewSection
          title="Unanswered booking requests"
          subtitle="Requests waiting on your response."
          icon={<Inbox className="h-4 w-4" />}
          to="/dashboard/booking-requests"
          ctaLabel="Open Booking Requests →"
          bookings={requests}
          emptyText="No pending requests right now."
          actions={(r: any) => (
            <div className="flex flex-col gap-1.5">
              <button onClick={() => updateRequest(r.id, "accepted")} className="btn-magenta text-[11px] px-3 py-1.5">
                Accept
              </button>
              <button onClick={() => updateRequest(r.id, "rejected")} className="btn-outline text-[11px] px-3 py-1.5">
                Decline
              </button>
            </div>
          )}
        />
        <OverviewSection
          title="Upcoming bookings"
          subtitle="Accepted bookings whose outbound shipment hasn't gone out yet."
          icon={<ShoppingBag className="h-4 w-4" />}
          to="/dashboard/bookings"
          ctaLabel="Open My Bookings →"
          bookings={upcoming}
          emptyText="No upcoming bookings need shipping."
        />
        <OverviewSection
          title="Out with renter"
          subtitle="Active rentals currently in the renter's hands."
          icon={<TrendingUp className="h-4 w-4" />}
          to="/dashboard/bookings"
          ctaLabel="Open My Bookings →"
          bookings={outWithRenter}
          emptyText="Nothing out with a renter right now."
        />
      </div>

      {/* Two columns */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Calendar */}
        <Card>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <h3 className="min-w-0 font-heading text-xs leading-snug uppercase sm:text-sm">
              Availability Calendar
            </h3>
            <Link to="/dashboard/availability" className="shrink-0 text-right text-xs text-magenta hover:underline">
              Manage calendar →
            </Link>
          </div>

          <div className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <button
                onClick={() => setCalMonth((m: Date) => subMonths(m, 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border hover:bg-bg-tint" aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="min-w-0 truncate text-center text-sm text-muted-foreground">{format(calMonth, "MMMM yyyy")}</p>
              <button
                onClick={() => setCalMonth((m: Date) => addMonths(m, 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border hover:bg-bg-tint" aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
          </div>

          <MiniMonthGrid month={calMonth} booked={availability?.booked ?? []} unavailable={availability?.unavailable ?? []} />

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <LegendDot color="bg-magenta" label="Booked" />
            <LegendDot color="bg-muted" label="Unavailable" />
            <LegendDot color="bg-success-bg border border-success-ink" label="Available" />
          </div>
        </Card>

        {/* Right column stacked */}
        <div className="space-y-4">
          {/* Your Responsiveness */}
          <Card>
            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <h3 className="font-heading text-sm tracking-wider-display uppercase">
                Your Responsiveness
              </h3>
              <div className="flex min-w-0 flex-wrap items-start gap-1.5 sm:items-center sm:justify-end">
                <SuperLenderBadge active={Boolean((profile as any)?.is_super_lender)} />
                <UltraResponsiveBadge active={Boolean((profile as any)?.is_ultra_responsive)} />
              </div>
            </div>
            <p className="mt-4 font-display text-4xl text-ink">
              {typeof (profile as any)?.response_rate === "number"
                ? `${Number((profile as any).response_rate).toFixed(1)}%`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Response rate</p>
          </Card>

          {/* Progress to Super Lender */}
          <SuperLenderProgressCard
            isSuperLender={Boolean((profile as any)?.is_super_lender) || Boolean(superProgress?.is_super_lender)}
            progress={superProgress}
          />



          {/* Recent Activity */}
          <Card>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <h3 className="font-heading text-sm tracking-wider-display uppercase">
                Recent Activity
              </h3>
              <Link to="/dashboard/notifications" search={{ filter: "all" as const }} className="shrink-0 whitespace-nowrap text-xs text-magenta hover:underline">
                View all →
              </Link>
            </div>

            {activity.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nothing to show yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {activity.map((n: any) => {
                  const Icon = activityIcon(n.type);
                  return (
                    <li key={n.id} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-tint">
                        <Icon className="h-3.5 w-3.5 text-magenta" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink leading-snug">{n.title ?? n.body}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {n.created_at && formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function OverviewSection({
  title, subtitle, icon, to, ctaLabel, bookings, emptyText, actions,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  to: string;
  ctaLabel: string;
  bookings: any[];
  emptyText: string;
  actions?: (b: any) => React.ReactNode;
}) {
  return (
    <Card>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-tint text-magenta">{icon}</span>
          <div className="min-w-0">
            <h3 className="font-heading text-sm tracking-wider-display uppercase text-ink">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Link to={to} className="max-w-28 shrink-0 text-right text-xs text-magenta hover:underline sm:max-w-none sm:whitespace-nowrap">
          {ctaLabel}
        </Link>
      </div>

      {bookings.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.slice(0, 4).map((r: any) => {
            const img = ((r.dress?.images ?? []) as any[])
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-[10px] border border-border p-3">
                {img ? (
                  <img src={img} alt="" className="h-14 w-14 rounded-md object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] tracking-wider-display text-muted-foreground">
                    {r.dress?.brand?.name?.toUpperCase() ?? "DESIGNER"}
                  </p>
                  <p className="truncate font-display text-sm text-ink">{r.dress?.title ?? "Dress"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.start_date && (isTryOnBooking(r.hire_option)
                      ? formatTryOnWhen(format(parseISO(r.start_date), "EEE d MMM"), r.try_on_period)
                      : format(parseISO(r.start_date), "d MMM"))}
                    {!isTryOnBooking(r.hire_option) && r.end_date && r.end_date !== r.start_date ? ` → ${format(parseISO(r.end_date), "d MMM")}` : ""}
                  </p>
                </div>
                {actions ? actions(r) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}



function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[10px] border border-border bg-surface p-4 shadow-sm sm:p-5">
      {children}
    </div>
  );
}

function StatCard({
  icon, label, value, sublabel, linkLabel, to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  linkLabel?: string;
  to: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-tint text-magenta">
          {icon}
        </div>
        <p className="text-[10px] tracking-wider-display uppercase text-muted-foreground">{label}</p>
      </div>
      <p className="mt-4 font-display text-4xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      {linkLabel && (
        <Link to={to} className="mt-3 inline-block text-xs text-magenta hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}

function MiniMonthGrid({
  month, booked, unavailable,
}: {
  month: Date;
  booked: { start_date: string; end_date: string }[];
  unavailable: { start_date: string; end_date: string }[];
}) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const startWeekday = first.getDay(); // 0 = Sunday
  const daysInMonth = last.getDate();

  const inRange = (rows: { start_date: string; end_date: string }[], d: Date) =>
    rows.some((r) => {
      const s = parseISO(r.start_date);
      const e = parseISO(r.end_date);
      return d >= startOfDay(s) && d <= startOfDay(e);
    });

  const today = startOfDay(new Date());
  const cells: { d?: Date }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({});
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d: new Date(month.getFullYear(), month.getMonth(), i) });
  while (cells.length % 7 !== 0) cells.push({});

  return (
    <div className="mt-3 w-full min-w-0 max-w-full">
      <div className="grid min-w-0 grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="min-w-0">{d}</span>
        ))}
      </div>
      <div className="mt-1 grid min-w-0 grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c.d) return <span key={i} className="min-w-0 aspect-square" />;
          const isBooked = inRange(booked, c.d);
          const isUnavail = !isBooked && inRange(unavailable, c.d);
          const isToday = isSameDay(c.d, today) && isSameMonth(c.d, month);
          return (
            <span
              key={i}
              className={cn(
                "flex min-w-0 aspect-square items-center justify-center rounded-md text-xs",
                isBooked && "bg-magenta text-white",
                !isBooked && isUnavail && "bg-muted text-muted-foreground",
                !isBooked && !isUnavail && "text-ink hover:bg-bg-tint",
                isToday && !isBooked && !isUnavail && "ring-1 ring-magenta",
              )}
            >
              {c.d.getDate()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SuperLenderProgressCard({
  isSuperLender,
  progress,
}: {
  isSuperLender: boolean;
  progress: any;
}) {
  if (isSuperLender) {
    return (
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[10px] border border-magenta/30 bg-gradient-to-br from-magenta/10 to-pink/5 p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <h3 className="font-heading text-sm tracking-wider-display uppercase">
            Super Lender Status
          </h3>
          <SuperLenderBadge active />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-magenta text-white">
            <Crown className="h-5 w-5 fill-current" />
          </div>
          <div>
            <p className="font-display text-lg text-ink">You're a Super Lender</p>
            <p className="text-xs text-muted-foreground">Thanks for keeping the bar high.</p>
          </div>
        </div>
      </div>
    );
  }

  const rows: { label: string; value: number; target: number; suffix?: string; decimals?: number }[] = progress
    ? [
        {
          label: "Completed bookings",
          value: Number(progress.completed_bookings ?? 0),
          target: Number(progress.completed_target ?? 0),
        },
        {
          label: "Average rating",
          value: Number(progress.avg_rating ?? 0),
          target: Number(progress.rating_target ?? 0),
          decimals: 2,
        },
        {
          label: "Response rate",
          value: Number(progress.response_rate ?? 0),
          target: Number(progress.response_target ?? 0),
          suffix: "%",
          decimals: 1,
        },
      ]
    : [];

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[10px] border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm tracking-wider-display uppercase">
          Progress to Super Lender
        </h3>
        <Crown className="h-4 w-4 text-magenta" />
      </div>
      {!progress ? (
        <p className="mt-4 text-sm text-muted-foreground">
          We'll show your progress here once you've made a few bookings.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((r) => {
            const pct = r.target > 0 ? Math.min((r.value / r.target) * 100, 100) : 0;
            const done = r.target > 0 && r.value >= r.target;
            const fmt = (n: number) =>
              `${n.toFixed(r.decimals ?? 0)}${r.suffix ?? ""}`;
            return (
              <li key={r.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink">{r.label}</span>
                  <span className={done ? "font-medium text-success-ink" : "text-muted-foreground"}>
                    {fmt(r.value)} / {fmt(r.target)}
                    {done && <Check className="ml-1 inline h-3 w-3" />}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-tint">
                  <div
                    className={done ? "h-full bg-success-ink" : "h-full bg-magenta"}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case "booking_request":
    case "booking_accepted":
    case "booking_rejected":
      return CalendarCheck;
    case "message":
      return MessageSquare;
    case "saved":
      return Heart;
    case "payment":
      return TrendingUp;
    default:
      return Bell;
  }
}
