import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { isUnread, otherParty, type ConversationRow } from "@/lib/messaging";
import { TryOnBadge, isTryOnBooking } from "@/components/dashboard/TryOnBadge";

export function ConversationListItem({
  c,
  currentUserId,
  activeId,
  compact = false,
  onClick,
}: {
  c: ConversationRow;
  currentUserId: string;
  activeId?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  const other = otherParty(c, currentUserId);
  const unread = isUnread(c);
  const isActive = activeId === c.id;
  const dressImg = c.dress?.dress_images
    ?.slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;
  const thumbSize = compact ? "h-12 w-12" : "h-16 w-16";
  const name = other ? `${other.first_name ?? ""} ${other.last_name ?? ""}`.trim() || "—" : "—";
  const preview = c.last_message?.body ?? "No messages yet";
  const stamp = c.last_message_at
    ? formatDistanceToNowStrict(new Date(c.last_message_at), { addSuffix: false })
    : "";

  const tryOn = isTryOnBooking(c.booking?.hire_option);

  return (
    <Link
      to="/dashboard/messages"
      search={{ c: c.id }}
      onClick={onClick}
      className={cn(
        "relative flex items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/60",
        isActive && "bg-pink-soft/40",
      )}
    >

      {unread && (
        <span aria-label="Unread" className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-pink" />
      )}
      <div className={cn("shrink-0 overflow-hidden rounded-md bg-muted", thumbSize)}>
        {dressImg ? (
          <img src={dressImg} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("truncate text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink/90")}>
            {name}
          </p>
          {tryOn && (
            <span className="flex shrink-0 items-center gap-1">
              <TryOnBadge />
            </span>
          )}
        </div>
        {c.dress?.title && (
          <p className="truncate text-xs text-muted-foreground">{c.dress.title}</p>
        )}
        <p
          className={cn(
            "mt-0.5 truncate text-xs",
            !c.last_message
              ? "italic text-muted-foreground/60"
              : unread
                ? "font-medium text-ink"
                : "text-muted-foreground",
          )}
        >
          {preview.length > 60 ? preview.slice(0, 57) + "…" : preview}
        </p>

      </div>
      {stamp && (
        <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">{stamp}</span>
      )}
    </Link>
  );
}
