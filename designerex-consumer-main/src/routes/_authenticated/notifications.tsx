import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Inbox,
  CalendarDays,
  MessageSquare,
  Truck,
  Star,
  DollarSign,
  ChevronLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { explainRejection, type RejectionInfoRow } from "@/lib/rejection-explanations";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type NotifFilter = "all" | "unread";
const PAGE_SIZE = 30;

export const Route = createFileRoute("/_authenticated/notifications")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { filter: NotifFilter } => ({
    filter: s.filter === "unread" ? "unread" : "all",
  }),
  component: NotificationsPage,
});

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

type Section = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  types: string[];
};

const SECTIONS: Section[] = [
  { key: "requests", label: "Booking Requests", icon: Inbox, types: ["booking_request"] },
  {
    key: "updates",
    label: "Booking Updates",
    icon: CalendarDays,
    types: ["booking_accepted", "booking_rejected", "booking_completed", "booking_expired", "booking_reminder"],
  },
  { key: "messages", label: "Messages", icon: MessageSquare, types: ["message_received", "new_message"] },
  { key: "shipping", label: "Shipping", icon: Truck, types: ["shipment_in_transit"] },
  { key: "reviews", label: "Reviews", icon: Star, types: ["review_received"] },
  { key: "payouts", label: "Payouts", icon: DollarSign, types: ["payout_processed"] },
  // Fallback bucket so an unrecognised type is still shown, never dropped.
  { key: "other", label: "Other", icon: Bell, types: [] },
];

const OTHER_SECTION = SECTIONS[SECTIONS.length - 1];

function sectionFor(type: string): Section {
  return SECTIONS.find((s) => s.types.includes(type)) ?? OTHER_SECTION;
}

/** Human label for the raw notification type, e.g. booking_accepted -> Booking accepted. */
function typeLabel(type: string): string {
  const words = type.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Update";
}

function NotificationsPage() {
  const { user } = useAuth();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const userId = user?.id;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications-fullpage", userId, page],
    enabled: !!userId,
    queryFn: async () => {
      const to = page * PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("notifications")
        .select("id, type, title, body, link_url, read_at, created_at", { count: "exact" })
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .range(0, to);
      if (error) throw error;
      return { items: (data ?? []) as Notification[], total: count ?? 0 };
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasMore = items.length < total;

  // Friendly rejection reasons keyed by booking id, used to override the
  // body text on `booking_rejected` notification entries for the renter.
  const rejectedBookingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of items) {
      if (n.type !== "booking_rejected") continue;
      const m = n.link_url?.match(UUID_RE);
      if (m) ids.add(m[0]);
    }
    return [...ids];
  }, [items]);

  const { data: rejectionReasons } = useQuery({
    queryKey: ["notif-rejection-reasons", userId, rejectedBookingIds.join(",")],
    enabled: !!userId && rejectedBookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .in("id", rejectedBookingIds);
      if (error) throw error;
      const map = new Map<string, RejectionInfoRow>();
      for (const row of data ?? []) map.set((row as any).id, row as RejectionInfoRow);
      return map;
    },
  });

  const friendlyBody = (n: Notification): string | null => {
    if (n.type === "booking_rejected") {
      const m = n.link_url?.match(UUID_RE);
      const row = m ? rejectionReasons?.get(m[0]) ?? null : null;
      const outcome = explainRejection(row, row?.status ?? "rejected");
      return outcome.chargeNote ? `${outcome.message}. ${outcome.chargeNote}` : outcome.message;
    }
    return n.body;
  };

  // Notifications that were unread when this visit began. They stay visually
  // highlighted (and stay in the Unread tab) for the rest of the visit even
  // after viewing the page marks them read in the database.
  const [unreadOnArrival, setUnreadOnArrival] = useState<Set<string>>(new Set());
  const autoMarkedRef = useRef(false);

  const wasUnread = (n: Notification) => !n.read_at || unreadOnArrival.has(n.id);

  const filtered = useMemo(
    () => (filter === "unread" ? items.filter(wasUnread) : items),
    [items, filter, unreadOnArrival],
  );

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const s of SECTIONS) map.set(s.key, []);
    for (const n of filtered) {
      map.get(sectionFor(n.type).key)!.push(n);
    }
    return map;
  }, [filtered]);

  // Viewing the page marks everything read.
  useEffect(() => {
    if (!userId || isLoading || autoMarkedRef.current) return;
    const unread = items.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    autoMarkedRef.current = true;
    setUnreadOnArrival(new Set(unread.map((n) => n.id)));
    const nowIso = new Date().toISOString();
    qc.setQueryData<{ items: Notification[]; total: number }>(
      ["notifications-fullpage", userId, page],
      (prev) =>
        prev
          ? { ...prev, items: prev.items.map((x) => (x.read_at ? x : { ...x, read_at: nowIso })) }
          : prev,
    );
    qc.setQueryData<number>(["notifications-unread-count", userId], 0);
    void (async () => {
      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("user_id", userId)
        .is("read_at", null);
      qc.invalidateQueries({ queryKey: ["notifications-unread-count", userId] });
      qc.invalidateQueries({ queryKey: ["notifications-page", userId] });
    })();
  }, [userId, isLoading, items, page, qc]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["notifications-fullpage", userId] });
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
    qc.invalidateQueries({ queryKey: ["notifications-page", userId] });
    qc.invalidateQueries({ queryKey: ["notifications-unread-count", userId] });
  };

  const handleClick = async (n: Notification) => {
    if (!n.read_at) {
      const nowIso = new Date().toISOString();
      // Optimistic update across known caches
      qc.setQueryData<{ items: Notification[]; total: number }>(
        ["notifications-fullpage", userId, page],
        (prev) =>
          prev
            ? { ...prev, items: prev.items.map((x) => (x.id === n.id ? { ...x, read_at: nowIso } : x)) }
            : prev,
      );
      qc.setQueryData<number>(["notifications-unread-count", userId], (prev) =>
        Math.max(0, (prev ?? 1) - 1),
      );
      await supabase.from("notifications").update({ read_at: nowIso }).eq("id", n.id);
      invalidateAll();
    }
    if (n.link_url) router.history.push(n.link_url);
  };

  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    const nowIso = new Date().toISOString();
    qc.setQueryData<{ items: Notification[]; total: number }>(
      ["notifications-fullpage", userId, page],
      (prev) =>
        prev
          ? { ...prev, items: prev.items.map((x) => (x.read_at ? x : { ...x, read_at: nowIso })) }
          : prev,
    );
    qc.setQueryData<number>(["notifications-unread-count", userId], 0);
    await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("user_id", userId)
      .is("read_at", null);
    invalidateAll();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-ink/60 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl sm:text-4xl">Notifications</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border bg-white p-0.5 text-xs">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => navigate({ search: { filter: f } })}
                className={cn(
                  "rounded-full px-3 py-1 capitalize transition-colors",
                  filter === f ? "bg-pink text-pink-foreground" : "text-ink/70 hover:text-ink",
                )}
              >
                {f}
                {f === "unread" && unreadCount > 0 && (
                  <span className="ml-1 opacity-80">({unreadCount})</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="text-xs text-pink hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            Mark all as read
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md border bg-white" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-white px-6 py-16 text-center">
          <p className="font-display text-lg">Couldn't load notifications</p>
          <button
            onClick={() => refetch()}
            className="text-xs text-pink hover:underline"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-white px-6 py-20 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-display text-lg">
            {filter === "unread" ? "You're all caught up" : "No notifications yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {filter === "unread"
              ? "No unread notifications."
              : "When something happens — bookings, messages, payouts — you'll see it here."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-8">
            {SECTIONS.map((section) => {
              const list = grouped.get(section.key) ?? [];
              if (list.length === 0) return null;
              const SectionIcon = section.icon;
              return (
                <section key={section.key}>
                  <h2 className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider-display text-muted-foreground">
                    <SectionIcon className="h-3.5 w-3.5" />
                    {section.label}
                    <span className="text-muted-foreground/60">({list.length})</span>
                  </h2>
                  <ul className="overflow-hidden rounded-md border bg-white">
                    {list.map((n) => {
                      const unread = wasUnread(n);
                      return (
                        <li key={n.id} className="border-b last:border-b-0">
                          <button
                            onClick={() => handleClick(n)}
                            className={cn(
                              "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                              unread && "border-l-2 border-pink bg-pink-soft/30",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                                unread ? "bg-pink text-pink-foreground" : "bg-muted text-ink/70",
                              )}
                            >
                              <SectionIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "text-sm leading-tight font-semibold text-ink",
                                  !unread && "font-medium text-ink/90",
                                )}
                              >
                                {n.title}
                              </p>
                              {(() => {
                                const body = friendlyBody(n);
                                return body ? (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                    {body}
                                  </p>
                                ) : null;
                              })()}
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider-display text-ink/70">
                                  {typeLabel(n.type)}
                                </span>
                                <time
                                  dateTime={n.created_at}
                                  title={new Date(n.created_at).toLocaleString()}
                                  className="text-[10px] uppercase tracking-wider-display text-muted-foreground"
                                >
                                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                </time>
                              </div>
                            </div>
                            {unread && (
                              <span
                                aria-label="Unread"
                                className="mt-2 h-2 w-2 shrink-0 rounded-full bg-pink"
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full border border-ink/20 bg-white px-6 py-2 text-xs font-medium text-ink hover:bg-muted"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
