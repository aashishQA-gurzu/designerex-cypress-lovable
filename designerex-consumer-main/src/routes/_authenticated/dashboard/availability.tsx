import { SimpleSelect } from "@/components/ui/simple-select";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  addMonths, addDays, eachDayOfInterval, endOfMonth, format, isSameDay,
  isSameMonth, parseISO, startOfMonth, startOfWeek, endOfWeek, isWithinInterval,
} from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays, ChevronLeft, ChevronRight, Search, Plane, Bell,
  MessageSquare, ShieldOff, CheckCircle2, X, Check, LayoutGrid, List,
  SlidersHorizontal, Edit2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


function AvailabilityRoute() {
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
      <AvailabilityPage />
    </LenderGate>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/availability")({
  ssr: false,
  component: AvailabilityRoute,
});

type DressRow = {
  id: string;
  title: string;
  brand_id: string | null;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
};

type DayReason = {
  key: string;
  /** booked = confirmed rental, fixed = vacation/paused, block = releasable blackout */
  tone: "booked" | "fixed" | "block";
  label: string;
  detail?: string;
  releasable: boolean;
  blackoutId?: string;
};

/**
 * A single day in the month grid. Opens a reason panel on hover (pointer) and
 * on tap (touch), listing why the date is unavailable and what can be released.
 */
function DayCell({
  day, cursor, status, reasons, onRelease,
}: {
  day: Date;
  cursor: Date;
  status: "booked" | "unavailable" | "available";
  reasons: DayReason[];
  onRelease: (blackoutId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inMonth = isSameMonth(day, cursor);
  const isToday = isSameDay(day, new Date());
  const hasReasons = reasons.length > 0;
  const st = status;

  const cell = (
    <button
      type="button"
      disabled={!hasReasons}
      aria-label={
        hasReasons
          ? `${format(day, "EEEE d MMMM yyyy")}: ${reasons.map((r) => r.label).join("; ")}`
          : `${format(day, "EEEE d MMMM yyyy")}: available`
      }
      onClick={() => hasReasons && setOpen((o) => !o)}
      onMouseEnter={() => hasReasons && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className={cn(
        "relative min-w-0 aspect-square w-full rounded-md border p-1 text-left text-[10px] transition-colors sm:rounded-lg sm:p-1.5 sm:text-xs",
        !inMonth && "opacity-40",
        st === "booked" && "border-magenta/40 bg-magenta/10",
        st === "unavailable" && "border-muted bg-muted/50 text-muted-foreground",
        st === "available" && "bg-background",
        hasReasons && st === "available" && "border-dashed border-muted-foreground/40",
        hasReasons && "cursor-pointer hover:ring-1 hover:ring-magenta/40",
        isToday && "ring-2 ring-magenta",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="font-medium">{format(day, "d")}</span>
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            st === "available" && (hasReasons ? "bg-amber-500" : "bg-emerald-500"),
            st === "booked" && "bg-magenta",
            st === "unavailable" && "bg-muted-foreground/40",
          )}
        />
      </div>
    </button>
  );

  if (!hasReasons) return cell;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{cell}</PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        className="z-[70] w-64 p-3 text-xs"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-2 font-medium">{format(day, "EEE d MMM yyyy")}</p>
        <ul className="space-y-2">
          {reasons.map((r) => (
            <li key={r.key} className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className={cn("font-medium", r.tone === "booked" && "text-magenta")}>{r.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                    r.releasable ? "bg-muted text-muted-foreground" : "bg-magenta/10 text-magenta",
                  )}
                >
                  {r.releasable ? "Can unblock" : "Can't change"}
                </span>
              </div>
              {r.detail && <p className="text-muted-foreground">{r.detail}</p>}
              {r.releasable && r.blackoutId && (
                <button
                  onClick={() => { onRelease(r.blackoutId!); setOpen(false); }}
                  className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-muted"
                >
                  Unblock
                </button>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}


function AvailabilityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["lender-availability", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: dresses } = await supabase
        .from("dresses")
        .select("id, title, brand_id, size_id, color")
        .eq("lender_id", user!.id)
        .order("title");
      const list = (dresses ?? []) as any[];
      const ids = list.map((d) => d.id);
      const brandIds = [...new Set(list.map((d) => d.brand_id).filter(Boolean))];
      const sizeIds = [...new Set(list.map((d) => d.size_id).filter(Boolean))];
      const [imgRes, brandRes, sizeRes, allSizesRes, bookings, blackouts, vacations, profileRes] = await Promise.all([
        ids.length ? supabase.from("dress_images").select("dress_id, url, position").in("dress_id", ids) : Promise.resolve({ data: [] }),
        brandIds.length ? supabase.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] }),
        sizeIds.length ? supabase.from("sizes").select("id, name").in("id", sizeIds) : Promise.resolve({ data: [] }),
        supabase.from("sizes").select("id, name"),
        ids.length ? supabase.from("bookings").select("id, dress_id, start_date, end_date, status, size_id").in("dress_id", ids).in("status", ["requested", "accepted", "active"]) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("dress_blackouts").select("id, dress_id, blackout_date, size_id, source, reason").in("dress_id", ids) : Promise.resolve({ data: [] }),
        supabase.from("lender_vacation_periods").select("id, start_date, end_date").eq("lender_id", user!.id),
        supabase.from("profiles").select("is_lending_paused").eq("id", user!.id).maybeSingle(),
      ]);
      const imgMap = new Map<string, string>();
      for (const im of (imgRes.data ?? []) as any[]) {
        const ex = imgMap.get(im.dress_id);
        if (!ex || (im.position ?? 0) === 0) imgMap.set(im.dress_id, im.url);
      }
      const bMap = new Map((brandRes.data ?? []).map((b: any) => [b.id, b.name]));
      const sMap = new Map((sizeRes.data ?? []).map((s: any) => [s.id, s.name]));
      const sizeNames = new Map<string, string>(
        ((allSizesRes as any).data ?? []).map((s: any) => [String(s.id), String(s.name)]),
      );
      const dressRows: DressRow[] = list.map((d) => ({
        id: d.id, title: d.title,
        brand_id: d.brand_id,
        brand_name: d.brand_id ? (bMap.get(d.brand_id) ?? null) : null,
        size: d.size_id ? (sMap.get(d.size_id) ?? null) : null,
        color: d.color ?? null,
        image_url: imgMap.get(d.id) ?? null,
      }));
      return {
        dresses: dressRows,
        sizeNames,
        paused: !!((profileRes as any).data?.is_lending_paused),
        bookings: bookings.data ?? [],
        // Blackouts are stored one row per date; normalise to a range shape for the views below.
        blackouts: ((blackouts.data ?? []) as any[]).map((b) => ({
          ...b,
          start_date: b.blackout_date,
          end_date: b.blackout_date,
        })),
        vacations: vacations.data ?? [],
      };
    },
  });

  const monthDays = useMemo(() => {
    const monthStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [cursor]);


  const dayStatus = useMemo(() => {
    // Aggregate across all listings for the month view
    const status = new Map<string, "booked" | "unavailable" | "available">();
    const monthStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const totalDresses = data?.dresses.length ?? 0;
    for (const day of days) {
      const ds = format(day, "yyyy-MM-dd");
      let booked = false, unavailable = false;
      for (const v of data?.vacations ?? []) {
        if (ds >= v.start_date && ds <= v.end_date) unavailable = true;
      }
      for (const b of data?.bookings ?? []) {
        if (ds >= b.start_date && ds <= b.end_date) { booked = true; break; }
      }
      if (!booked) {
        // unavailable if every dress has a blackout that day
        const blackedDresses = new Set<string>();
        for (const bo of data?.blackouts ?? []) {
          if (ds >= bo.start_date && ds <= bo.end_date) blackedDresses.add(bo.dress_id);
        }
        if (totalDresses > 0 && blackedDresses.size >= totalDresses) unavailable = true;
      }
      status.set(ds, booked ? "booked" : unavailable ? "unavailable" : "available");
    }
    return status;
  }, [cursor, data]);

  /**
   * Per-day explanations for the month grid. Unchangeable reasons come first
   * (booked, then vacation / paused), releasable blackouts last.
   */
  const dayReasons = useMemo(() => {
    const map = new Map<string, DayReason[]>();
    const dressTitle = new Map<string, string>((data?.dresses ?? []).map((d: any) => [d.id, d.title]));
    const sizeName = (id: string | null | undefined) =>
      id ? (data?.sizeNames?.get(String(id)) ?? null) : null;

    for (const day of monthDays) {
      const ds = format(day, "yyyy-MM-dd");
      const list: DayReason[] = [];

      for (const b of (data?.bookings ?? []) as any[]) {
        if (ds < b.start_date || ds > b.end_date) continue;
        const sn = sizeName(b.size_id);
        list.push({
          key: `bk-${b.id}`,
          tone: "booked",
          label: sn ? `Booked, ${sn}` : "Booked",
          detail: dressTitle.get(b.dress_id) ?? undefined,
          releasable: false,
        });
      }

      for (const v of (data?.vacations ?? []) as any[]) {
        if (ds < v.start_date || ds > v.end_date) continue;
        list.push({ key: `v-${v.id}`, tone: "fixed", label: "You're away", releasable: false });
      }

      if (data?.paused) {
        list.push({ key: "paused", tone: "fixed", label: "Your lending is paused", releasable: false });
      }

      for (const bo of (data?.blackouts ?? []) as any[]) {
        if (ds !== bo.blackout_date) continue;
        const sn = sizeName(bo.size_id);
        const scope = [dressTitle.get(bo.dress_id) ?? undefined, sn ?? "every size"].filter(Boolean).join(" · ");
        list.push(
          bo.source === "declined_request"
            ? {
                key: `bo-${bo.id}`,
                tone: "block",
                label: "Blocked when you declined a request",
                detail: scope,
                releasable: true,
                blackoutId: bo.id,
              }
            : {
                key: `bo-${bo.id}`,
                tone: "block",
                label: "You blocked these dates",
                detail: [bo.reason || null, scope].filter(Boolean).join(" — "),
                releasable: true,
                blackoutId: bo.id,
              },
        );
      }

      if (list.length) map.set(ds, list);
    }
    return map;
  }, [monthDays, data]);

  const releaseBlackout = async (blackoutId: string) => {
    const { error } = await supabase.from("dress_blackouts").delete().eq("id", blackoutId);
    if (error) { toast.error(error.message); return; }
    toast.success("Date released.");
    qc.invalidateQueries({ queryKey: ["lender-availability"] });
    qc.invalidateQueries({ queryKey: ["size-blocks"] });
  };



  return (
    <div className="space-y-8">
      {/* PANEL: Availability Calendar */}
      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card p-4 sm:rounded-2xl sm:p-6 md:p-8">
        <header className="mb-6 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-2xl">
              <CalendarDays className="h-5 w-5 text-magenta" />
              Availability Calendar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage when your listings are available to rent.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid w-full min-w-0 grid-cols-2 rounded-full border bg-background p-1 text-xs sm:w-auto">
              <button
                onClick={() => setView("calendar")}
                className={cn(
                  "rounded-full px-3 py-1.5 transition-colors",
                  view === "calendar" ? "bg-magenta text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Calendar View
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "rounded-full px-3 py-1.5 transition-colors",
                  view === "list" ? "bg-magenta text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                List View
              </button>
            </div>
            <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:min-w-72">
              <button
                onClick={() => setCursor((c) => addMonths(c, -1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 text-center">
                <p className="truncate font-display text-base">{format(cursor, "MMMM yyyy")}</p>
                {!isSameMonth(cursor, new Date()) && (
                  <button
                    onClick={() => setCursor(startOfMonth(new Date()))}
                    className="mt-1 text-xs text-magenta hover:underline"
                  >
                    Back to today
                  </button>
                )}
              </div>
              <button
                onClick={() => setCursor((c) => addMonths(c, 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {view === "calendar" ? (
          <div className="w-full min-w-0 max-w-full rounded-xl border bg-background p-2 sm:p-4 md:p-6">
            <div className="grid min-w-0 grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-muted-foreground sm:gap-1 sm:text-xs">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <div className="grid min-w-0 grid-cols-7 gap-0.5 sm:gap-1">
              {monthDays.map((day) => {
                const ds = format(day, "yyyy-MM-dd");
                return (
                  <DayCell
                    key={ds}
                    day={day}
                    cursor={cursor}
                    status={dayStatus.get(ds) ?? "available"}
                    reasons={dayReasons.get(ds) ?? []}
                    onRelease={releaseBlackout}
                  />
                );
              })}

            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <Legend dot="bg-emerald-500" label="Available" />
                <Legend dot="bg-magenta" label="Booked" />
                <Legend dot="bg-muted-foreground/40" label="Unavailable" />
              </div>
              <button
                onClick={() => setWizardOpen(true)}
                className="rounded-full border border-magenta px-4 py-2 text-xs font-medium text-magenta hover:bg-magenta hover:text-white"
              >
                Manage Availability
              </button>
            </div>
          </div>
        ) : (
          <ListView data={data} />
        )}
      </section>

      {/* BLOCKED DATES BY SIZE */}
      <SizeBlocksPanel dresses={data?.dresses ?? []} />

      {/* VACATION MODE */}
      <VacationModeSection />

      <ManageAvailabilityWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        dresses={data?.dresses ?? []}
        onDone={() => qc.invalidateQueries({ queryKey: ["lender-availability"] })}
      />
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  );
}

function ListView({ data }: { data: any }) {
  const items = useMemo(() => {
    const arr: { id: string; kind: string; label: string; start: string; end: string }[] = [];
    const dressTitle = new Map<string, string>((data?.dresses ?? []).map((d: any) => [d.id as string, d.title as string]));
    for (const v of data?.vacations ?? []) {
      arr.push({ id: `v-${v.id}`, kind: "Vacation", label: "All listings", start: v.start_date, end: v.end_date });
    }
    for (const b of data?.bookings ?? []) {
      arr.push({ id: `b-${b.id}`, kind: "Booked", label: dressTitle.get(b.dress_id) ?? "—", start: b.start_date, end: b.end_date });
    }
    for (const bo of data?.blackouts ?? []) {
      arr.push({ id: `bo-${bo.id}`, kind: "Unavailable", label: dressTitle.get(bo.dress_id) ?? "—", start: bo.start_date, end: bo.end_date });
    }
    return arr.sort((a, b) => a.start.localeCompare(b.start));
  }, [data]);

  if (items.length === 0) {
    return <p className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">Nothing scheduled.</p>;
  }
  return (
    <ul className="divide-y rounded-xl border bg-background">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between px-4 py-3 text-sm">
          <div>
            <p className="font-medium">{it.label}</p>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(it.start), "EEE d MMM")} → {format(parseISO(it.end), "EEE d MMM yyyy")}
            </p>
          </div>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            it.kind === "Booked" && "bg-magenta/10 text-magenta",
            it.kind === "Unavailable" && "bg-muted text-muted-foreground",
            it.kind === "Vacation" && "bg-muted text-muted-foreground",
          )}>{it.kind}</span>
        </li>
      ))}
    </ul>
  );
}


// ============== BLOCKED DATES BY SIZE ==============

function SizeBlocksPanel({ dresses }: { dresses: DressRow[] }) {
  const qc = useQueryClient();
  const [dressId, setDressId] = useState<string>("");
  const [sizeId, setSizeId] = useState<string>("");

  useEffect(() => {
    if (!dressId && dresses.length) setDressId(dresses[0].id);
  }, [dresses, dressId]);

  const { data: sizes = [] } = useQuery({
    queryKey: ["size-blocks-sizes", dressId],
    enabled: !!dressId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dress_sizes")
        .select("size_id, sizes(id, name)")
        .eq("dress_id", dressId);
      return ((data ?? []) as any[])
        .map((r) => r.sizes)
        .filter(Boolean)
        .map((s: any) => ({ id: String(s.id), name: String(s.name) }));
    },
  });

  useEffect(() => {
    if (sizes.length === 0) { setSizeId(""); return; }
    if (!sizes.some((s) => s.id === sizeId)) setSizeId(sizes[0].id);
  }, [sizes, sizeId]);

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: rows = [] } = useQuery({
    queryKey: ["size-blocks", dressId, sizeId, today],
    enabled: !!dressId,
    queryFn: async () => {
      const [blackoutRes, bookingRes] = await Promise.all([
        supabase
          .from("dress_blackouts")
          .select("id, blackout_date, size_id, source")
          .eq("dress_id", dressId)
          .gte("blackout_date", today),
        supabase
          .from("bookings")
          .select("id, start_date, end_date, size_id, status")
          .eq("dress_id", dressId)
          .in("status", ["accepted", "active"])
          .gte("end_date", today),
      ]);

      const out: {
        key: string;
        date: string;
        kind: "lender" | "declined_request" | "booked";
        blackoutId?: string;
        allSizes: boolean;
      }[] = [];

      for (const b of (blackoutRes.data ?? []) as any[]) {
        if (sizeId && b.size_id && b.size_id !== sizeId) continue;
        out.push({
          key: `bo-${b.id}`,
          date: b.blackout_date,
          kind: b.source === "declined_request" ? "declined_request" : "lender",
          blackoutId: b.id,
          allSizes: !b.size_id,
        });
      }
      for (const bk of (bookingRes.data ?? []) as any[]) {
        if (sizeId && bk.size_id && bk.size_id !== sizeId) continue;
        for (
          let d = new Date(`${bk.start_date}T00:00:00`);
          d <= new Date(`${bk.end_date}T00:00:00`);
          d.setDate(d.getDate() + 1)
        ) {
          const ds = format(d, "yyyy-MM-dd");
          if (ds < today) continue;
          out.push({ key: `bk-${bk.id}-${ds}`, date: ds, kind: "booked", allSizes: !bk.size_id });
        }
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  const release = async (blackoutId: string) => {
    const { error } = await supabase.from("dress_blackouts").delete().eq("id", blackoutId);
    if (error) { toast.error(error.message); return; }
    toast.success("Date released.");
    qc.invalidateQueries({ queryKey: ["size-blocks"] });
    qc.invalidateQueries({ queryKey: ["lender-availability"] });
  };

  if (dresses.length === 0) return null;

  return (
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card p-4 sm:rounded-2xl sm:p-6 md:p-8">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <ShieldOff className="h-5 w-5 text-magenta" />
        Blocked dates by size
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Availability is tracked per size. Pick a listing and a size to see why each date is blocked.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Listing
          <SimpleSelect
            className="mt-1 w-full"
            aria-label="Listing"
            value={dressId}
            onValueChange={setDressId}
            options={dresses.map((d) => ({ value: d.id, label: d.title }))}
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Size
          <SimpleSelect
            className="mt-1 w-full"
            aria-label="Size"
            value={sizeId}
            onValueChange={setSizeId}
            disabled={sizes.length === 0}
            options={
              sizes.length === 0
                ? [{ value: "", label: "All sizes" }]
                : sizes.map((s) => ({ value: s.id, label: s.name }))
            }
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border bg-background p-6 text-center text-sm text-muted-foreground">
          No blocked dates for this size.
        </p>
      ) : (
        <ul className="mt-4 divide-y rounded-xl border bg-background">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{format(parseISO(r.date), "EEE d MMM yyyy")}</p>
                <p className="text-xs text-muted-foreground">
                  {r.kind === "booked"
                    ? "Booked — a confirmed rental covers this date"
                    : r.kind === "declined_request"
                      ? "Blocked when you declined a request"
                      : "You blocked this date"}
                  {r.allSizes && r.kind !== "booked" ? " · every size" : ""}
                </p>
              </div>
              {r.kind === "booked" ? (
                <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs text-magenta">Booked</span>
              ) : (
                <button
                  onClick={() => release(r.blackoutId!)}
                  className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Release
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ============== WIZARD ==============

function ManageAvailabilityWizard({
  open, onClose, dresses, onDone,
}: {
  open: boolean;
  onClose: () => void;
  dresses: DressRow[];
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const [mark, setMark] = useState<"available" | "unavailable">("unavailable");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [gridMode, setGridMode] = useState<"grid" | "list">("grid");
  const [statusChip, setStatusChip] = useState<"all" | "available" | "partial" | "unavailable">("all");

  // "" = every size on the chosen listings.
  const [sizeId, setSizeId] = useState<string>("");

  const { data: sizeOptions = [] } = useQuery({
    queryKey: ["wizard-sizes", selected],
    enabled: selected.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("dress_sizes")
        .select("size_id, sizes(id, name)")
        .in("dress_id", selected);
      const map = new Map<string, string>();
      for (const r of (data ?? []) as any[]) if (r.sizes) map.set(String(r.sizes.id), String(r.sizes.name));
      return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const reset = () => {
    setStep(1); setRange(undefined); setMark("unavailable");
    setSelected([]); setBusy(false); setSearch(""); setStatusChip("all"); setSizeId("");
  };
  const close = () => { onClose(); setTimeout(reset, 200); };

  const filteredDresses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dresses.filter((d) => {
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || (d.brand_name ?? "").toLowerCase().includes(q);
    });
  }, [dresses, search]);

  const submit = async () => {
    if (!user || !range?.from || !range?.to || selected.length === 0) return;
    setBusy(true);
    const start = format(range.from, "yyyy-MM-dd");
    const end = format(range.to, "yyyy-MM-dd");
    const days: string[] = [];
    for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
      days.push(format(d, "yyyy-MM-dd"));
    }
    if (mark === "unavailable") {
      const rows = selected.flatMap((dress_id) =>
        days.map((blackout_date) => ({
          dress_id,
          blackout_date,
          size_id: sizeId || null,
          source: "lender",
          reason: "manual",
        })),
      );
      let { error } = await supabase.from("dress_blackouts").insert(rows);
      if (error && /reason/.test(error.message)) {
        const stripped = rows.map(({ reason: _r, ...rest }) => rest);
        ({ error } = await supabase.from("dress_blackouts").insert(stripped));
      }
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success(`Marked ${selected.length} listing${selected.length === 1 ? "" : "s"} unavailable.`);
    } else {
      // Mark as Available: remove any blackouts overlapping the range for selected dresses
      let del = supabase
        .from("dress_blackouts")
        .delete()
        .in("dress_id", selected)
        .gte("blackout_date", start)
        .lte("blackout_date", end);
      if (sizeId) del = del.eq("size_id", sizeId);
      const { error } = await del;
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success(`Marked ${selected.length} listing${selected.length === 1 ? "" : "s"} available.`);
    }
    onDone();
    close();
  };

  const isFullScreen = step >= 3;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className={cn(
          isFullScreen
            ? "h-screen max-h-screen w-screen max-w-none rounded-none p-0 sm:rounded-none"
            : "max-w-2xl",
        )}
      >
        <div className={cn(isFullScreen && "flex h-full flex-col")}>
          {!isFullScreen && (
            <DialogHeader>
              <DialogTitle>Manage Availability</DialogTitle>
            </DialogHeader>
          )}

          <div className={cn("px-1 pt-2", isFullScreen && "border-b bg-card px-6 py-4")}>
            <StepIndicator step={step} />
          </div>

          {step >= 3 && sizeOptions.length > 0 && (
            <div className={cn("px-1 pt-3", isFullScreen && "px-6")}>
              <label className="text-xs font-medium text-muted-foreground">Size</label>
              <SimpleSelect
                className="mt-1 w-full max-w-xs"
                aria-label="Size"
                value={sizeId}
                onValueChange={setSizeId}
                options={[
                  { value: "", label: "All sizes" },
                  ...sizeOptions.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
          )}

          <div className={cn(isFullScreen && "flex-1 overflow-y-auto px-6 py-6")}>
            {step === 1 && (
              <Step1 range={range} setRange={setRange} />
            )}
            {step === 2 && (
              <Step2 range={range} mark={mark} setMark={setMark} onEditDates={() => setStep(1)} />
            )}
            {step === 3 && (
              <Step3
                dresses={filteredDresses}
                allDresses={dresses}
                selected={selected} setSelected={setSelected}
                search={search} setSearch={setSearch}
                gridMode={gridMode} setGridMode={setGridMode}
                statusChip={statusChip} setStatusChip={setStatusChip}
              />
            )}
            {step === 4 && (
              <Step4
                range={range} mark={mark} dresses={dresses} selected={selected}
                onEditDates={() => setStep(1)} onEditMark={() => setStep(2)}
              />
            )}
          </div>

          <DialogFooter className={cn(
            "justify-between sm:justify-between",
            isFullScreen && "border-t bg-card px-6 py-4",
          )}>
            <button
              onClick={() => (step === 1 ? close() : setStep(step - 1))}
              className="rounded-full border px-5 py-2 text-sm hover:bg-muted"
            >
              {step === 1 ? "Cancel" : "Back"}
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && (!range?.from || !range?.to)) ||
                  (step === 3 && selected.length === 0)
                }
                className="btn-magenta rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {step === 3 ? "Continue to Review" : step === 1 ? "Confirm" : "Continue"}
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={busy}
                className="btn-magenta rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Confirm & Publish Availability"}
              </button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step }: { step: number }) {
  const steps = ["Dates", "Set Availability", "Choose Dresses", "Review"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium",
                active && "border-magenta bg-magenta text-white",
                done && "border-magenta bg-magenta/10 text-magenta",
                !active && !done && "border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : n}
            </span>
            <span className={cn("hidden sm:inline", active ? "font-medium" : "text-muted-foreground")}>
              {label}
            </span>
            {n < steps.length && <span className="mx-1 hidden h-px w-8 bg-border sm:inline-block" />}
          </li>
        );
      })}
    </ol>
  );
}

function Step1({
  range, setRange,
}: { range: any; setRange: (r: any) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl">Choose the dates to manage</h3>
        <p className="text-sm text-muted-foreground">Select a single day or a date range.</p>
      </div>
      <div className="flex justify-center">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          numberOfMonths={2}
          disabled={{ before: new Date() }}
          className={cn("pointer-events-auto mx-auto mt-4")}
          modifiersClassNames={{
            selected: "bg-magenta text-white hover:bg-magenta",
            range_middle: "bg-magenta/20 text-foreground",
          }}
        />
      </div>
    </div>
  );
}

function Step2({
  range, mark, setMark, onEditDates,
}: {
  range: any; mark: "available" | "unavailable";
  setMark: (m: "available" | "unavailable") => void;
  onEditDates: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-xl">Mark as</h3>
        <p className="text-sm text-muted-foreground">
          Choose how these dates should be treated.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-background px-4 py-3 text-sm">
        <span>
          {range?.from && range?.to
            ? `${format(range.from, "EEE d MMM")} → ${format(range.to, "EEE d MMM yyyy")}`
            : "—"}
        </span>
        <button onClick={onEditDates} className="text-xs text-magenta hover:underline">Edit dates</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RadioCard
          checked={mark === "available"}
          onClick={() => setMark("available")}
          title="Mark as Available"
          body="These dates become bookable for selected listings."
        />
        <RadioCard
          checked={mark === "unavailable"}
          onClick={() => setMark("unavailable")}
          title="Mark as Unavailable"
          body="Block these dates from being booked."
        />
      </div>
    </div>
  );
}

function RadioCard({
  checked, onClick, title, body,
}: { checked: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
        checked ? "border-magenta bg-magenta/5" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border-2",
          checked ? "border-magenta" : "border-muted-foreground/40",
        )}>
          {checked && <span className="h-2 w-2 rounded-full bg-magenta" />}
        </span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </button>
  );
}

function Step3({
  dresses, allDresses, selected, setSelected, search, setSearch,
  gridMode, setGridMode, statusChip, setStatusChip,
}: {
  dresses: DressRow[]; allDresses: DressRow[];
  selected: string[]; setSelected: (s: string[]) => void;
  search: string; setSearch: (s: string) => void;
  gridMode: "grid" | "list"; setGridMode: (m: "grid" | "list") => void;
  statusChip: string; setStatusChip: (s: any) => void;
}) {
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const chips: { id: string; label: string }[] = [
    { id: "all", label: "All" },
    { id: "available", label: "Available" },
    { id: "partial", label: "Partially Unavailable" },
    { id: "unavailable", label: "Unavailable" },
  ];
  const filterBtns = ["Brand", "Size", "Colour", "Occasion"];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl">Choose Dresses</h3>
        <p className="text-sm text-muted-foreground">Pick which listings this change applies to.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or brand"
            className="w-full rounded-full border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-magenta/30"
          />
        </div>
        {filterBtns.map((f) => (
          <button key={f} className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted">{f}</button>
        ))}
        <button className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs hover:bg-muted">
          <SlidersHorizontal className="h-3 w-3" /> More filters
        </button>
        <div className="ml-auto inline-flex rounded-md border p-0.5">
          <button
            onClick={() => setGridMode("grid")}
            className={cn("rounded p-1.5", gridMode === "grid" ? "bg-muted" : "")}
            aria-label="Grid view"
          ><LayoutGrid className="h-3.5 w-3.5" /></button>
          <button
            onClick={() => setGridMode("list")}
            className={cn("rounded p-1.5", gridMode === "list" ? "bg-muted" : "")}
            aria-label="List view"
          ><List className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setStatusChip(c.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              statusChip === c.id ? "border-magenta bg-magenta/10 text-magenta" : "hover:bg-muted",
            )}
          >{c.label}</button>
        ))}
      </div>

      {dresses.length === 0 ? (
        <p className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          No listings match your search.
        </p>
      ) : gridMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dresses.map((d) => (
            <DressCard key={d.id} dress={d} checked={selected.includes(d.id)} onToggle={() => toggle(d.id)} />
          ))}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {dresses.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
              <div className="h-12 w-12 overflow-hidden rounded bg-muted">
                {d.image_url && <img src={d.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1">
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[d.brand_name, d.size, d.color].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-xs font-medium">{selected.length} selected</span>
          <div className="flex flex-wrap gap-1">
            {selected.slice(0, 6).map((id) => {
              const d = allDresses.find((x) => x.id === id);
              return (
                <div key={id} className="h-8 w-8 overflow-hidden rounded bg-muted">
                  {d?.image_url && <img src={d.image_url} alt="" className="h-full w-full object-cover" />}
                </div>
              );
            })}
            {selected.length > 6 && (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs">
                +{selected.length - 6}
              </div>
            )}
          </div>
          <button
            onClick={() => setSelected([])}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function DressCard({ dress, checked, onToggle }: { dress: DressRow; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-background text-left transition-colors",
        checked ? "border-magenta ring-2 ring-magenta/30" : "hover:border-muted-foreground/30",
      )}
    >
      <div className="absolute right-2 top-2 z-10">
        <span className={cn(
          "flex h-5 w-5 items-center justify-center rounded border-2 bg-white",
          checked ? "border-magenta" : "border-muted-foreground/40",
        )}>
          {checked && <Check className="h-3 w-3 text-magenta" />}
        </span>
      </div>
      <div className="aspect-[3/4] bg-muted">
        {dress.image_url && <img src={dress.image_url} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{dress.brand_name ?? "—"}</p>
        <p className="line-clamp-1 text-sm font-medium">{dress.title}</p>
        <p className="text-xs text-muted-foreground">
          {[dress.size && `Size ${dress.size}`, dress.color].filter(Boolean).join(" · ") || "—"}
        </p>
        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
          Available
        </span>
      </div>
    </button>
  );
}

function Step4({
  range, mark, dresses, selected, onEditDates, onEditMark,
}: {
  range: any; mark: "available" | "unavailable"; dresses: DressRow[];
  selected: string[]; onEditDates: () => void; onEditMark: () => void;
}) {
  const sel = dresses.filter((d) => selected.includes(d.id));
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-xl">Review &amp; Confirm</h3>
        <p className="text-sm text-muted-foreground">Check the details before publishing.</p>
      </div>

      <ReviewCard title="Selected Dates" action={<button onClick={onEditDates} className="inline-flex items-center gap-1 text-xs text-magenta hover:underline"><Edit2 className="h-3 w-3" /> Edit dates</button>}>
        {range?.from && range?.to
          ? `${format(range.from, "EEE d MMM yyyy")} → ${format(range.to, "EEE d MMM yyyy")}`
          : "—"}
      </ReviewCard>

      <ReviewCard title="Availability Setting" action={<button onClick={onEditMark} className="inline-flex items-center gap-1 text-xs text-magenta hover:underline"><Edit2 className="h-3 w-3" /> Edit availability</button>}>
        {mark === "unavailable" ? "Mark as Unavailable" : "Mark as Available"}
      </ReviewCard>

      <ReviewCard title={`Selected Dresses (${sel.length})`}>
        <div className="mt-2 flex flex-wrap gap-2">
          {sel.map((d) => (
            <div key={d.id} className="h-12 w-12 overflow-hidden rounded bg-muted">
              {d.image_url && <img src={d.image_url} alt="" className="h-full w-full object-cover" />}
            </div>
          ))}
        </div>
      </ReviewCard>

      <div className="callout-info rounded-xl border p-4 text-sm">
        <p data-callout-title className="mb-2 font-medium">What happens next?</p>
        <ul data-callout-body className="space-y-1 text-xs">
          <li>• Your listings stay visible to renters with updated availability.</li>
          <li>• You'll get notifications for any new booking activity.</li>
          <li>• You're in control — change availability anytime from this page.</li>
        </ul>
      </div>
    </div>
  );
}

function ReviewCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

// ============== VACATION MODE ==============

function VacationModeSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>();
  const [busy, setBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const { data: paused = false, isLoading } = useQuery({
    queryKey: ["lender-pause-flag", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("is_lending_paused").eq("id", user!.id).maybeSingle();
      return !!(data as any)?.is_lending_paused;
    },
  });

  const togglePause = async (next: boolean) => {
    if (!user) return;
    setToggleBusy(true);
    qc.setQueryData(["lender-pause-flag", user.id], next);
    const { error } = await supabase.from("profiles").update({ is_lending_paused: next }).eq("id", user.id);
    setToggleBusy(false);
    if (error) {
      qc.setQueryData(["lender-pause-flag", user.id], !next);
      toast.error("Couldn't update vacation mode.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["lender-listings"] });
    toast.success(next ? "Vacation Mode on." : "Vacation Mode off.");
  };

  const enableScheduled = async () => {
    if (!user || !range?.from || !range?.to) return;
    setBusy(true);
    const { error } = await supabase.from("lender_vacation_periods").insert({
      lender_id: user.id,
      start_date: format(range.from, "yyyy-MM-dd"),
      end_date: format(range.to, "yyyy-MM-dd"),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vacation Mode scheduled.");
    setRange(undefined);
    qc.invalidateQueries({ queryKey: ["lender-availability"] });
  };

  const cards = [
    { icon: ShieldOff, title: "No bookings", body: "No bookings or actions will happen during this time." },
    { icon: MessageSquare, title: "Stay reachable", body: "Renters can still message you during your vacation." },
    { icon: Bell, title: "Stay notified", body: "You'll receive email + SMS notifications throughout." },
    { icon: CheckCircle2, title: "All listings off", body: "Every listing is set to unavailable while this is on." },
  ];

  return (
    <section className="rounded-2xl border bg-card p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Plane className="h-5 w-5 text-magenta" />
            Vacation Mode (Bulk Action)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Temporarily make all your listings unavailable in just a few clicks.
          </p>
        </div>
        <Switch
          checked={paused}
          onCheckedChange={togglePause}
          disabled={isLoading || toggleBusy}
          aria-label="Toggle Vacation Mode"
          className="data-[state=checked]:bg-magenta"
        />
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className="rounded-xl border bg-background p-4">
            <c.icon className="mb-2 h-5 w-5 text-magenta" />
            <p className="text-sm font-medium">{c.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Calendar
            mode="range"
            selected={range as any}
            onSelect={setRange as any}
            numberOfMonths={2}
            disabled={{ before: new Date() }}
            className={cn("pointer-events-auto mx-auto mt-4")}
            modifiersClassNames={{
              selected: "bg-magenta text-white hover:bg-magenta",
              range_middle: "bg-magenta/20 text-foreground",
            }}
          />
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <DateBox label="Start date" value={range?.from ? format(range.from, "EEE d MMM yyyy") : "—"} />
              <DateBox label="End date" value={range?.to ? format(range.to, "EEE d MMM yyyy") : "—"} />
            </div>
            <p className="text-xs text-muted-foreground">
              Renters will see your listings as unavailable during the selected dates.
            </p>
            <button
              onClick={enableScheduled}
              disabled={busy || !range?.from || !range?.to}
              className="btn-magenta rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Enable Vacation Mode"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DateBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

// suppress unused-import warning for date helpers kept for future use
void addDays; void isWithinInterval;
