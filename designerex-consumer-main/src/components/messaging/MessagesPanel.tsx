import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { X, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConversations } from "@/lib/messaging";
import { ConversationListItem } from "./ConversationListItem";

export function MessagesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { data: items = [], isLoading } = useConversations(user?.id);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const visible = items.slice(0, 10);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Messages"
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[400px] flex-col bg-white text-ink shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-xl">Messages</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink/60 hover:bg-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-20 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-40" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            <ul>
              {visible.map((c) => (
                <li key={c.id}>
                  <ConversationListItem c={c} currentUserId={user.id} compact onClick={onClose} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t px-5 py-3">
          <Link to="/dashboard/messages" onClick={onClose} className="text-xs font-medium text-pink hover:underline">
            See all messages →
          </Link>
        </div>
      </aside>
    </>
  );
}
