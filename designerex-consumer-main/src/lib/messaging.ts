import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConversationRow = {
  id: string;
  type: "booking" | "enquiry";
  last_message_at: string | null;
  created_at: string;
  renter_id: string;
  lender_id: string;
  booking_id: string | null;
  dress_id: string | null;
  dress: {
    id: string;
    title: string;
    dress_images: { url: string; position: number }[];
  } | null;
  renter: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  lender: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  my_last_read_at: string | null;
  last_message: { body: string; created_at: string; sender_id: string } | null;
  booking: BookingLite | null;
};

export type BookingLite = {
  id: string;
  status: string;
  hire_option: string | null;
  start_date: string | null;
  end_date: string | null;
  try_on_period: string | null;
  try_on_address_snapshot: unknown;
};

/** Inbox sections are driven by the linked booking's status. Enquiries have no booking. */
export type InboxSection = "requested" | "ongoing" | "complete" | "rejected" | "expired" | "enquiries";

export const INBOX_SECTIONS: { key: InboxSection; label: string }[] = [
  { key: "ongoing", label: "Ongoing" },
  { key: "requested", label: "Requested" },
  { key: "complete", label: "Complete" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
  { key: "enquiries", label: "Enquiries" },
];

/**
 * Within a tab: threads with messages first (most recent message first),
 * then message-less threads by booking start date.
 */
export function compareConversations(a: ConversationRow, b: ConversationRow): number {
  const aHas = !!a.last_message;
  const bHas = !!b.last_message;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas) {
    const at = new Date(a.last_message_at ?? a.last_message!.created_at).getTime();
    const bt = new Date(b.last_message_at ?? b.last_message!.created_at).getTime();
    return bt - at;
  }
  const as = a.booking?.start_date ? new Date(a.booking.start_date).getTime() : 0;
  const bs = b.booking?.start_date ? new Date(b.booking.start_date).getTime() : 0;
  if (as !== bs) return as - bs;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}


export function sectionForConversation(c: ConversationRow): InboxSection | null {
  if (c.type === "enquiry" || !c.booking_id) return "enquiries";
  const s = c.booking?.status;
  if (s === "requested") return "requested";
  if (s === "accepted" || s === "active") return "ongoing";
  if (s === "completed") return "complete";
  if (s === "rejected") return "rejected";
  if (s === "expired") return "expired";
  return null;
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_flagged: boolean;
  created_at: string;
};

export function isUnread(c: { last_message_at: string | null; my_last_read_at: string | null }) {
  if (!c.last_message_at) return false;
  if (!c.my_last_read_at) return true;
  return new Date(c.last_message_at).getTime() > new Date(c.my_last_read_at).getTime();
}

export function otherParty(c: ConversationRow, currentUserId: string) {
  return c.renter_id === currentUserId ? c.lender : c.renter;
}

export type InboxTab = "inbox" | "completed";

export async function fetchConversations(userId: string, limit = 100): Promise<ConversationRow[]> {
  // Query the conversation_inbox_view — it already filters by hidden_at and exposes
  // per-user last_read_at. Sections are derived from the linked booking's status.
  const { data: viewRows, error: vErr } = await supabase
    .from("conversation_inbox_view")
    .select("conversation_id, last_read_at, last_message_at, message_count, tab")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (vErr) throw vErr;

  const readMap = new Map<string, string | null>(
    (viewRows ?? []).map((r: any) => [r.conversation_id, r.last_read_at]),
  );
  const ids = (viewRows ?? []).map((r: any) => r.conversation_id);
  if (ids.length === 0) return [];

  const { data: convs, error: cErr } = await supabase
    .from("conversations")
    .select(`
      id, type, last_message_at, created_at, renter_id, lender_id, booking_id, dress_id,
      dress:dresses!conversations_dress_id_fkey ( id, title, dress_images ( url, position ) ),
      renter:profiles!conversations_renter_id_fkey ( id, first_name, last_name, avatar_url ),
      lender:profiles!conversations_lender_id_fkey ( id, first_name, last_name, avatar_url )
    `)
    .in("id", ids);
  if (cErr) throw cErr;

  // Preserve view ordering
  const order = new Map(ids.map((id, i) => [id, i]));
  (convs ?? []).sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  // Batch fetch last message per conversation
  const cIds = (convs ?? []).map((c: any) => c.id);
  const lastMsgMap = new Map<string, MessageRow>();
  if (cIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, is_flagged")
      .in("conversation_id", cIds)
      .order("created_at", { ascending: false });
    for (const m of msgs ?? []) {
      if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m as any);
    }
  }

  // Batch fetch the linked bookings — status drives the inbox sections.
  const bookingIds = (convs ?? []).map((c: any) => c.booking_id).filter(Boolean) as string[];
  const bookingMap = new Map<string, BookingLite>();
  if (bookingIds.length > 0) {
    const { data: bks } = await supabase
      .from("bookings")
      .select("id, status, hire_option, start_date, end_date, try_on_period, try_on_address_snapshot")
      .in("id", bookingIds);
    for (const b of (bks ?? []) as any[]) bookingMap.set(b.id, b as BookingLite);
  }

  return (convs ?? []).map((c: any) => ({
    ...c,
    my_last_read_at: readMap.get(c.id) ?? null,
    last_message: lastMsgMap.get(c.id) ?? null,
    booking: c.booking_id ? bookingMap.get(c.booking_id) ?? null : null,
  }));
}

export function useConversations(userId?: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["conversations", userId],
    enabled: !!userId,
    queryFn: () => fetchConversations(userId!),
    staleTime: 10_000,
  });

  // Realtime: any new message → refresh list + unread count
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`inbox:${userId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations", userId] });
        qc.invalidateQueries({ queryKey: ["messages-unread-count", userId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);


  return q;
}

export function useUnreadMessagesCount(userId?: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["messages-unread-count", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", userId!);
      const ids = (parts ?? []).map((p: any) => p.conversation_id);
      if (ids.length === 0) return 0;
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, last_message_at")
        .in("id", ids);
      const readMap = new Map<string, string | null>((parts ?? []).map((p: any) => [p.conversation_id, p.last_read_at]));
      let count = 0;
      for (const c of convs ?? []) {
        if (isUnread({ last_message_at: c.last_message_at, my_last_read_at: readMap.get(c.id) ?? null })) count++;
      }
      return count;
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`unread-msgs:${userId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages-unread-count", userId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["messages-unread-count", userId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  return q.data ?? 0;
}

export async function markConversationRead(conversationId: string, userId: string) {
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

export async function hideConversation(conversationId: string, userId: string) {
  const { error } = await supabase
    .from("conversation_participants")
    .update({ hidden_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function findOrCreateEnquiry(args: {
  dressId: string | null;
  renterId: string;
  lenderId: string;
  body: string;
}): Promise<string> {
  const { dressId, renterId, lenderId, body } = args;
  // Look for existing enquiry (dress-specific or general)
  let existingQuery = supabase
    .from("conversations")
    .select("id")
    .eq("type", "enquiry")
    .eq("renter_id", renterId)
    .eq("lender_id", lenderId);
  existingQuery = dressId
    ? existingQuery.eq("dress_id", dressId)
    : existingQuery.is("dress_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error: cErr } = await supabase
      .from("conversations")
      .insert({ type: "enquiry", dress_id: dressId, renter_id: renterId, lender_id: lenderId })
      .select("id")
      .single();
    if (cErr) throw cErr;
    conversationId = created.id;

    const { error: pErr } = await supabase
      .from("conversation_participants")
      .insert([
        { conversation_id: conversationId, user_id: renterId },
        { conversation_id: conversationId, user_id: lenderId },
      ]);
    if (pErr) {
      await supabase.from("conversations").delete().eq("id", conversationId);
      throw pErr;
    }
  }

  const { error: mErr } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: renterId, body });
  if (mErr) throw mErr;

  return conversationId!;
}

export function formatMsgTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  if (isYesterday) return `Yesterday ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

/** booking_id → conversation_id for every booking conversation the user is part of. */
export function useBookingConversationMap(userId?: string) {
  return useQuery({
    queryKey: ["booking-conversation-map", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, booking_id")
        .eq("type", "booking")
        .not("booking_id", "is", null);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as any[]) map[c.booking_id] = c.id;
      return map;
    },
  });
}

/** The conversation row attached to a single booking (created automatically on request). */
export function useConversationForBooking(bookingId?: string | null) {
  return useQuery({
    queryKey: ["conversation-for-booking", bookingId],
    enabled: !!bookingId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("booking_id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
  });
}
