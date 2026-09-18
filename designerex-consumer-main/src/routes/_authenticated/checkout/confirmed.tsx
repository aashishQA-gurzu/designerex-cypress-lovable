import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Mail, ShieldCheck, ClipboardList, Lock, Users, CreditCard, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useConversationForBooking } from "@/lib/messaging";

type ConfirmedSearch = { booking_id?: string };

export const Route = createFileRoute("/_authenticated/checkout/confirmed")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): ConfirmedSearch => ({
    booking_id: typeof s.booking_id === "string" ? s.booking_id : undefined,
  }),
  component: ConfirmedPage,
});

function ConfirmedPage() {
  const { booking_id } = Route.useSearch();
  const { data: conversationId } = useConversationForBooking(booking_id);

  useQuery({
    queryKey: ["booking-confirmed", booking_id],
    enabled: !!booking_id,
    queryFn: async () => {
      const { data: b } = await supabase
        .from("bookings")
        .select(`*, dress:dresses!bookings_dress_id_fkey(id, title), lender:profiles!bookings_lender_id_fkey(first_name)`)
        .eq("id", booking_id!)
        .maybeSingle();
      return b as any;
    },
  });

  const stepItems = [
    { n: 1, label: "Shipping", state: "done" },
    { n: 2, label: "Payment", state: "done" },
    { n: 3, label: "Review", state: "current" },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 lg:py-16">
      {/* Title */}
      <div className="text-center">
        <h1 className="font-display text-4xl sm:text-5xl text-ink">Checkout</h1>
      </div>

      {/* Stepper */}
      <div className="mt-8 flex justify-center">
        <ol className="flex items-center gap-3 sm:gap-5">
          {stepItems.map((it, i) => (
            <li key={it.n} className="flex items-center gap-2 sm:gap-3">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                it.state === "current"
                  ? "bg-magenta text-white"
                  : it.state === "done"
                    ? "bg-ink text-white"
                    : "border border-border bg-surface text-muted-foreground",
              )}>
                {it.state === "done" ? <Check className="h-3.5 w-3.5" /> : it.n}
              </div>
              <span className={cn(
                "text-xs sm:text-sm",
                it.state === "current" ? "font-medium text-magenta" : it.state === "done" ? "text-ink" : "text-muted-foreground",
              )}>{it.label}</span>
              {i < stepItems.length - 1 && <span className="hidden h-px w-10 bg-border sm:block" />}
            </li>
          ))}
        </ol>
      </div>

      {/* Success */}
      <div className="mt-12 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg">
          <Check className="h-8 w-8 text-success-ink" strokeWidth={3} />
        </div>
        <h2 className="font-display text-3xl sm:text-4xl text-ink">Booking Request Confirmed</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          You will hear from the lender shortly.
        </p>
      </div>

      {/* Envelope illustration */}
      <div className="mt-10 flex justify-center">
        <div className="relative flex h-32 w-44 items-center justify-center rounded-[10px] border-2 border-ink bg-surface shadow-sm">
          <Mail className="h-10 w-10 text-ink" strokeWidth={1.5} />
          <div className="absolute -bottom-3 -right-3 flex h-10 w-10 items-center justify-center rounded-full bg-magenta font-display text-sm text-white">
            DX
          </div>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-xl text-center text-sm text-muted-foreground">
        We've sent your booking request to the lender. You will receive a response via email.
      </p>

      {/* Info items */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[10px] border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-bg-tint">
              <ShieldCheck className="h-4 w-4 text-magenta" />
            </div>
            <div>
              <p className="font-medium text-ink">Not accepted? No worries.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                If your booking request isn't accepted, you'll receive a full refund — no charge applied.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[10px] border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-bg-tint">
              <ClipboardList className="h-4 w-4 text-magenta" />
            </div>
            <div>
              <p className="font-medium text-ink">Track your booking request</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can follow updates from your dashboard under the Renting tab.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to="/dashboard/rentals" className="btn-primary text-center sm:px-10">
          GO TO MY DASHBOARD
        </Link>
        {conversationId && (
          <Link
            to="/dashboard/messages"
            search={{ c: conversationId }}
            className="btn-outline inline-flex items-center justify-center gap-2 text-xs sm:px-8"
          >
            <MessageCircle className="h-4 w-4" />
            MESSAGE LENDER
          </Link>
        )}
      </div>

      {/* Trust strip */}
      <div className="mt-14 grid grid-cols-2 gap-4 border-t border-border pt-8 sm:grid-cols-4">
        {[
          { icon: Lock, t: "Secure payments" },
          { icon: Users, t: "Trusted by thousands" },
          { icon: CreditCard, t: "Pay later options" },
          { icon: ShieldCheck, t: "No acceptance = no charge" },
        ].map((it) => (
          <div key={it.t} className="flex items-center gap-2 text-xs text-muted-foreground">
            <it.icon className="h-4 w-4 text-magenta" />
            <span>{it.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
