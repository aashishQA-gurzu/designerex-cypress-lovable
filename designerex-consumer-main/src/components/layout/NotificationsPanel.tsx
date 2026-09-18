import { useEffect } from "react";
import { useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Inbox,
  Check,
  X as XIcon,
  Star,
  DollarSign,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  booking_request: Inbox,
  booking_accepted: Check,
  booking_rejected: XIcon,
  booking_completed: Star,
  payout_processed: DollarSign,
};

export function NotificationsPanel({
  userId,
  open,
  onClose,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, link_url, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
    qc.invalidateQueries({ queryKey: ["notifications-page", userId] });
    qc.invalidateQueries({ queryKey: ["notifications-unread-count", userId] });
  };

  const handleClick = async (n: any) => {
    const wasUnread = !n.read_at;
    const nowIso = new Date().toISOString();

    if (wasUnread) {
      // Optimistic: update dropdown cache immediately
      qc.setQueryData<any[]>(["notifications", userId], (prev) =>
        (prev ?? []).map((x) => (x.id === n.id ? { ...x, read_at: nowIso } : x)),
      );
      // Optimistic: update page cache too if loaded
      qc.setQueryData<any[]>(["notifications-page", userId], (prev) =>
        (prev ?? []).map((x) => (x.id === n.id ? { ...x, read_at: nowIso } : x)),
      );
      // Optimistic: decrement unread count
      qc.setQueryData<number>(["notifications-unread-count", userId], (prev) =>
        Math.max(0, (prev ?? 1) - 1),
      );

      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("id", n.id);
      invalidate();
    }

    onClose();
    if (n.link_url) router.history.push(n.link_url);
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Notifications"
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[400px] flex-col bg-white text-ink shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-xl">Notifications</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-ink/60 hover:bg-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-20 text-center text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n: any) => {
                const Icon = ICONS[n.type] ?? Bell;
                const unread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/60",
                        unread && "border-l-2 border-pink bg-pink-soft/40",
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
                        <p className="font-display text-sm leading-tight">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] uppercase tracking-wider-display text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
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
          )}
        </div>

        <div className="border-t bg-white px-5 py-3 text-center">
          <Link
            to="/notifications"
            search={{ filter: "all" as const }}
            onClick={onClose}
            className="text-xs font-medium text-pink hover:underline"
          >
            See all notifications →
          </Link>
        </div>
      </aside>
    </>
  );
}
