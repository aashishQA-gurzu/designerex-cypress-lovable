import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { tryOnPeriodWord, TryOnBadge } from "@/components/dashboard/TryOnBadge";
import {
  formatMsgTimestamp,
  markConversationRead,
  otherParty,
  type ConversationRow,
  type MessageRow,
} from "@/lib/messaging";

/** Snapshots may be plain text or a jsonb address object. Render either safely. */
function formatAddressSnapshot(snap: unknown): string {
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


export function ConversationThread({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<MessageRow[]>([]);

  const { data: conv } = useQuery({
    queryKey: ["conversation", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, type, renter_id, lender_id, booking_id, dress_id, created_at, last_message_at,
          dress:dresses!conversations_dress_id_fkey ( id, title, dress_images ( url, position ) ),
          renter:profiles!conversations_renter_id_fkey ( id, first_name, last_name, avatar_url ),
          lender:profiles!conversations_lender_id_fkey ( id, first_name, last_name, avatar_url )
        `)
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ConversationRow | null;
    },
  });

  // Linked booking — drives the try-on pickup note at the top of the thread.
  const { data: booking } = useQuery({
    queryKey: ["thread-booking", conv?.booking_id],
    enabled: !!conv?.booking_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, status, hire_option, start_date, try_on_period, try_on_address_snapshot")
        .eq("id", conv!.booking_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, is_flagged")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const all = [...messages, ...optimistic.filter((o) => !messages.find((m) => m.id === o.id))];

  // Mark as read on mount + when new messages arrive
  useEffect(() => {
    if (!user || !conversationId) return;
    markConversationRead(conversationId, user.id).then(() => {
      qc.invalidateQueries({ queryKey: ["conversations", user.id] });
      qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    });
  }, [conversationId, user, qc, messages.length]);

  // Autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [all.length, conversationId]);

  // Focus
  useEffect(() => {
    taRef.current?.focus();
  }, [conversationId]);

  // Realtime
  useEffect(() => {
    if (!conversationId || !user) return;
    const ch = supabase
      .channel(`messages:${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as MessageRow;
          if (m.sender_id !== user.id) {
            qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev = []) =>
              prev.find((x) => x.id === m.id) ? prev : [...prev, m],
            );
            markConversationRead(conversationId, user.id);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, user, qc]);

  if (!user) return null;

  const other = conv ? otherParty(conv, user.id) : null;
  const dressImg = conv?.dress?.dress_images?.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;

  // Accepted try-ons: remind both sides to agree a pickup time. Never show a clock time.
  const tryOnNote = (() => {
    if (!booking || booking.hire_option !== "try_on" || booking.status !== "accepted") return null;
    const dateLabel = booking.start_date
      ? format(parseISO(booking.start_date), "EEE d MMM")
      : "the agreed date";
    const period = tryOnPeriodWord(booking.try_on_period);
    const where = formatAddressSnapshot(booking.try_on_address_snapshot);
    const when = period ? `${dateLabel}, ${period}` : dateLabel;
    return `Agree a pickup time with each other here. Try-on is on ${when}${where ? ` at ${where}` : ""}.`;
  })();

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const opt: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      body: text,
      is_flagged: false,
      created_at: new Date().toISOString(),
    };
    setOptimistic((p) => [...p, opt]);
    setBody("");
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, body: text })
        .select("id, conversation_id, sender_id, body, created_at, is_flagged")
        .single();
      if (error) throw error;
      // Replace optimistic with real
      setOptimistic((p) => p.filter((m) => m.id !== tempId));
      qc.setQueryData<MessageRow[]>(["messages", conversationId], (prev = []) =>
        prev.find((x) => x.id === data.id) ? prev : [...prev, data as MessageRow],
      );
      qc.invalidateQueries({ queryKey: ["conversations", user.id] });
    } catch (e: any) {
      console.error("[Thread] send failed", e);
      setOptimistic((p) => p.filter((m) => m.id !== tempId));
      setBody(text);
      toast.error("Failed to send. Try again.", {
        action: { label: "Retry", onClick: () => handleSend() },
      });
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // Group consecutive messages by sender within 5 min — show timestamp on last in group
  const grouped = all.map((m, i) => {
    const next = all[i + 1];
    const inSameGroup =
      next &&
      next.sender_id === m.sender_id &&
      Math.abs(new Date(next.created_at).getTime() - new Date(m.created_at).getTime()) < 5 * 60_000;
    return { msg: m, showTime: !inSameGroup };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        <button
          onClick={() => navigate({ to: "/dashboard/messages" })}
          className="rounded-full p-1.5 text-ink/70 hover:bg-muted lg:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
          {dressImg && <img src={dressImg} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base leading-tight">{conv?.dress?.title ?? "Conversation"}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{other ? `${other.first_name ?? ""} ${other.last_name ?? ""}`.trim() : "—"}</span>
            {booking?.hire_option === "try_on" && <TryOnBadge />}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conv?.dress_id && (
            <Link
              to="/dresses/$id"
              params={{ id: conv.dress_id }}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              View dress
            </Link>
          )}
          {conv?.booking_id && (
            <Link
              to="/dashboard/bookings"
              className="hidden rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted sm:inline-flex"
            >
              View booking
            </Link>
          )}
        </div>
      </header>

      {tryOnNote && (
        <p className="border-b border-magenta/20 bg-pink-soft/40 px-4 py-2 text-xs text-ink">
          {tryOnNote}
        </p>
      )}


      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/30 px-4 py-6">
        {msgsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("h-10 w-2/3 animate-pulse rounded-2xl bg-muted", i % 2 ? "ml-auto" : "")} />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Send the first one below.</p>
        ) : (
          <ul className="space-y-1">
            {grouped.map(({ msg: m, showTime }) => {
              const mine = m.sender_id === user.id;
              const pending = m.id.startsWith("temp-");
              return (
                <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                      mine ? "bg-pink text-pink-foreground" : "bg-white text-ink shadow-sm",
                      pending && "opacity-60",
                    )}
                  >
                    {m.body}
                  </div>
                  {showTime && (
                    <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                      {formatMsgTimestamp(m.created_at)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Write a message…"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm focus:border-pink focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink text-pink-foreground disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 hidden text-[10px] text-muted-foreground sm:block">Press ⌘/Ctrl+Enter to send</p>
      </div>
    </div>
  );
}
