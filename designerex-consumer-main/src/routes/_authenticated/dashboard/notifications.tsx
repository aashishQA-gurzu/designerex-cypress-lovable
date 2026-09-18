import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow, format, isToday, isYesterday, differenceInDays } from "date-fns";
import {
  Bell,
  BookOpen,
  MessageSquare,
  DollarSign,
  Inbox,
  Check,
  X as XIcon,
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type NotifFilter = "all" | "unread";

export const Route = createFileRoute("/_authenticated/dashboard/notifications")({
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
  match: (type: string) => boolean;
};

const SECTIONS: Section[] = [
  {
    key: "bookings",
    label: "Booking requests",
    icon: BookOpen,
    match: (t) => t.startsWith("booking_"),
  },
  {
    key: "messages",
    label: "Messages",
    icon: MessageSquare,
    match: (t) => t === "message" || t.startsWith("message_"),
  },
  {
    key: "payouts",
    label: "Payouts",
    icon: DollarSign,
    match: (t) => t.startsWith("payout_"),
  },
  {
    key: "system",
    label: "System & updates",
    icon: Bell,
    match: () => true, // fallback
  },
];

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  booking_request: Inbox,
  booking_accepted: Check,
  booking_rejected: XIcon,
  booking_completed: Star,
  booking_expired: XIcon,
  payout_processed: DollarSign,
};

function sectionFor(type: string): Section {
  for (const s of SECTIONS) {
    if (s.key === "system") continue;
    if (s.match(type)) return s;
  }
  return SECTIONS[SECTIONS.length - 1];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true });
  if (isYesterday(d)) return "Yesterday";
  if (differenceInDays(new Date(), d) < 7) return format(d, "EEEE");
  return format(d, "d MMM");
}

function NotificationsPage() {
  const { user } = useAuth();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const qc = useQueryClient();
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  const { data: items = [] } = useQuery({
    queryKey: ["notifications-page", user?.id],
    enabled: !!user,
    retry: false,
    // A read failure must degrade to an empty list, never blank the dashboard.
    throwOnError: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, link_url, read_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("[notifications] failed to load", error);
        return [] as Notification[];
      }
      return (data ?? []) as Notification[];
    },
  });

  // Viewing the page marks everything read, once per visit. The rows that were
  // unread on arrival stay visually highlighted for the whole visit so the
  // lender can still see what is new.
  const arrivedUnreadRef = useRef<Set<string>>(new Set());
  const autoMarkedRef = useRef(false);
  useEffect(() => {
    if (!user || autoMarkedRef.current) return;
    const unread = items.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    autoMarkedRef.current = true;
    for (const n of unread) arrivedUnreadRef.current.add(n.id);
    void (async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) {
        autoMarkedRef.current = false;
        console.warn("[notifications] failed to mark read", error);
        return;
      }
      qc.invalidateQueries({ queryKey: ["notifications-page", user.id] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
      qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    })();
  }, [user, items, qc]);

  // Realtime sync (INSERT + UPDATE)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifs-page:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          setHighlightIds((s) => new Set(s).add(n.id));
          setTimeout(() => {
            setHighlightIds((s) => {
              const next = new Set(s);
              next.delete(n.id);
              return next;
            });
          }, 2000);
          qc.invalidateQueries({ queryKey: ["notifications-page", user.id] });
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications-page", user.id] });
          qc.invalidateQueries({ queryKey: ["notifications-unread-count", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const filtered = useMemo(
    () =>
      filter === "unread"
        ? items.filter((n) => !n.read_at || arrivedUnreadRef.current.has(n.id))
        : items,
    [items, filter],
  );

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at || arrivedUnreadRef.current.has(n.id)).length,
    [items],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const s of SECTIONS) map.set(s.key, []);
    for (const n of filtered) {
      map.get(sectionFor(n.type).key)!.push(n);
    }
    return map;
  }, [filtered]);

  const invalidateCounts = () => {
    qc.invalidateQueries({ queryKey: ["notifications-page", user?.id] });
    qc.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const handleClick = async (n: Notification) => {
    if (!n.read_at) {
      const nowIso = new Date().toISOString();
      // Optimistic
      qc.setQueryData<Notification[]>(["notifications-page", user?.id], (prev) =>
        (prev ?? []).map((x) => (x.id === n.id ? { ...x, read_at: nowIso } : x)),
      );
      await supabase.from("notifications").update({ read_at: nowIso }).eq("id", n.id);
      invalidateCounts();
    }
    if (n.link_url) router.history.push(n.link_url);
  };

  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) return;
    const nowIso = new Date().toISOString();
    qc.setQueryData<Notification[]>(["notifications-page", user.id], (prev) =>
      (prev ?? []).map((x) => (x.read_at ? x : { ...x, read_at: nowIso })),
    );
    await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id)
      .is("read_at", null);
    invalidateCounts();
  };

  const totalShown = filtered.length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display text-3xl">Notifications</h2>
        <div className="flex items-center gap-3">
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

      {totalShown === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-white px-6 py-20 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/40" />
          {filter === "unread" ? (
            <>
              <p className="font-display text-lg">You're all caught up</p>
              <p className="text-sm text-muted-foreground">All notifications have been read.</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg">No notifications yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                When something happens — bookings, messages, payouts — you'll see it here.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const list = grouped.get(section.key) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={section.key}>
                <h3 className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider-display text-muted-foreground">
                  <section.icon className="h-3.5 w-3.5" />
                  {section.label}
                  <span className="text-muted-foreground/60">({list.length})</span>
                </h3>
                <ul className="overflow-hidden rounded-md border bg-white">
                  {list.map((n) => {
                    const Icon = TYPE_ICON[n.type] ?? section.icon;
                    const unread = !n.read_at || arrivedUnreadRef.current.has(n.id);
                    const highlight = highlightIds.has(n.id);
                    return (
                      <li key={n.id} className="border-b last:border-b-0">
                        <button
                          onClick={() => handleClick(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                            unread && "border-l-2 border-pink bg-pink-soft/30",
                            highlight && "animate-pulse bg-pink-soft/70",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                              unread ? "bg-pink text-pink-foreground" : "bg-muted text-ink/70",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={cn("font-display text-sm leading-tight", unread && "font-semibold")}>
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>
                            )}
                          </div>
                          <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                            {formatTimestamp(n.created_at)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
