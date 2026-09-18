import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  compareConversations,
  hideConversation,
  isUnread,
  sectionForConversation,
  useConversations,
  INBOX_SECTIONS,
  type ConversationRow,
  type InboxSection,
} from "@/lib/messaging";
import { ConversationListItem } from "@/components/messaging/ConversationListItem";
import { ConversationThread } from "@/components/messaging/ConversationThread";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


type MessagesSearch = { c?: string };

export const Route = createFileRoute("/_authenticated/dashboard/messages")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): MessagesSearch => ({
    c: typeof s.c === "string" && s.c.length > 0 ? s.c : undefined,
  }),
  component: MessagesLayout,
});

function MessagesLayout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<ConversationRow | null>(null);
  const [tab, setTab] = useState<InboxSection>("ongoing");
  const { data: items = [], isLoading } = useConversations(user?.id);

  const { c: searchConversationId } = Route.useSearch();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const match = pathname.match(/\/dashboard\/messages\/([^/]+)/);
  const activeId = searchConversationId ?? match?.[1];
  const showListOnMobile = !activeId;

  const grouped = INBOX_SECTIONS.map((s) => ({
    ...s,
    items: items
      .filter((c) => sectionForConversation(c) === s.key)
      .sort(compareConversations),
  }));
  const visibleTabs = grouped.filter((s) => s.items.length > 0);

  // Follow a deep-linked conversation into its tab; otherwise fall back to the
  // first non-empty tab when the current one has nothing in it.
  useEffect(() => {
    if (items.length === 0) return;
    const active = activeId ? items.find((c) => c.id === activeId) : undefined;
    const target = active ? sectionForConversation(active) : null;
    if (target) {
      setTab(target);
      return;
    }
    setTab((cur) => {
      const curHas = grouped.find((s) => s.key === cur)?.items.length ?? 0;
      if (curHas > 0) return cur;
      return (visibleTabs[0]?.key ?? cur) as InboxSection;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, items]);

  if (!user) return null;

  const current = grouped.find((s) => s.key === tab);


  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    // optimistic remove
    qc.setQueryData<ConversationRow[]>(["conversations", user.id], (prev) =>
      (prev ?? []).filter((c) => c.id !== id),
    );
    try {
      await hideConversation(id, user.id);
      qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    } catch {
      toast.error("Couldn't delete conversation");
      qc.invalidateQueries({ queryKey: ["conversations", user.id] });
    }
  };

  const unreadCount = items.filter(
    (c) => isUnread(c) && c.last_message && c.last_message.sender_id !== user.id,
  ).length;

  return (
    <div className="flex flex-col -mx-4 -my-4 lg:mx-0 lg:my-0 h-[calc(100vh-180px)] min-h-[600px]">
      {visibleTabs.length > 0 && (
        <div className="border-b border-border bg-bg px-4 lg:px-0">
          <div className="flex gap-1 overflow-x-auto">
            {visibleTabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[11px] uppercase tracking-[0.12em] transition-colors",
                    active
                      ? "border-magenta text-magenta"
                      : "border-transparent text-muted-foreground hover:text-ink",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                      active ? "bg-magenta text-white" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid flex-1 grid-cols-1 overflow-hidden rounded-none border-y border-border bg-white lg:grid-cols-[360px_1fr] lg:rounded-lg lg:border">
        {/* Left: conversation list */}
        <aside
          className={`flex min-h-0 flex-col border-r border-border ${
            showListOnMobile ? "flex" : "hidden lg:flex"
          }`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h1 className="font-display text-xl">Messages</h1>
            {unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pink px-1.5 text-[10px] font-semibold text-pink-foreground">
                {unreadCount}
              </span>
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : visibleTabs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-40" />
              <h2 className="font-display text-lg text-ink">No conversations yet</h2>
              <p className="text-xs">
                When you book a dress or someone books one of yours, your messages will appear here.
              </p>
            </div>
          ) : !current || current.items.length === 0 ? (
            <div className="px-6 py-10 text-center text-xs text-muted-foreground">
              Nothing here yet.
            </div>
          ) : (
            <ul>
              {current.items.map((c) => (
                <li key={c.id} className="group relative">
                  <ConversationListItem c={c} currentUserId={user.id} activeId={activeId} />
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingDelete(c);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-muted-foreground opacity-100 shadow-sm transition hover:bg-white hover:text-pink lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </aside>

      {/* Right: thread (from ?c=) or child route */}
      <section className={`min-h-0 ${activeId ? "flex" : "hidden lg:flex"} flex-col`}>
        {searchConversationId ? (
          <ConversationThread key={searchConversationId} conversationId={searchConversationId} />
        ) : (
          <Outlet />
        )}
      </section>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't see it again, but the other person and admins can still view it. This can't be undone from your side.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
  );
}
