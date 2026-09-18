import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** A try-on is a booking with hire_option = 'try_on'. Always one day, always in-person pickup. */
export function isTryOnBooking(hireOption?: string | null): boolean {
  return hireOption === "try_on";
}

/**
 * Booking-type badge. Deliberately styled differently from the status pills
 * (ACTIVE / COMPLETED / EXPIRED) — outlined magenta rather than a solid tint —
 * so it reads as a type of booking, not a status.
 */
export function TryOnBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border border-magenta bg-transparent px-2 py-0.5",
        "text-[10px] font-semibold uppercase tracking-wider-display text-magenta",
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      Try-on
    </span>
  );
}

/** Try-on periods are stored as 'am' | 'pm'. Never render them as a clock time. */
export function tryOnPeriodWord(period?: string | null): string | null {
  if (period === "am") return "morning";
  if (period === "pm") return "afternoon";
  return null;
}

/** "Sun 30 Aug, morning" — date plus period, never a specific time. */
export function formatTryOnWhen(dateLabel: string, period?: string | null): string {
  const word = tryOnPeriodWord(period);
  return word ? `${dateLabel}, ${word}` : dateLabel;
}
