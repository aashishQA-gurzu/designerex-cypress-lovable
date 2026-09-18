import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Inbox, ShoppingBag, Truck, PackageCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TryOnBadge, isTryOnBooking, formatTryOnWhen } from "@/components/dashboard/TryOnBadge";

export const Route = createFileRoute("/_authenticated/dashboard/bookings")({
  ssr: false,
  component: MyBookings,
});

type Booking = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  hire_option: string | null;
  rental_fee: number | null;
  lender_payout_amount: number | null;
  dress: {
    id: string;
    title: string | null;
    images: { url: string; position: number | null }[] | null;
    brand: { name: string | null } | null;
  } | null;
  renter: { first_name: string | null; avatar_url: string | null } | null;
  outbound_status: string | null;
};

const PAST_STATUSES = ["completed", "cancelled", "rejected", "expired", "dispute"];


function MyBookings() {
  const { user, profile } = useAuth();
  const isLender = Boolean((profile as any)?.is_lender);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["lender-my-bookings", user?.id],
    enabled: !!user && isLender,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, status, start_date, end_date, hire_option, try_on_period, rental_fee, lender_payout_amount, renter_id,
           dress:dresses!bookings_dress_id_fkey(id, title, images:dress_images(url, position), brand:brands!dresses_brand_id_fkey(name)),
           shipments(direction, status)`,
        )

        .eq("lender_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const renterIds = [...new Set(rows.map((r: any) => r.renter_id).filter(Boolean))];
      const pMap = new Map<string, any>();
      if (renterIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, avatar_url")
          .in("id", renterIds);
        (profs ?? []).forEach((p: any) => pMap.set(p.id, p));
      }
      return rows.map((r: any) => {
        const outbound = (r.shipments ?? []).find((s: any) => s.direction === "outbound");
        return {
          ...r,
          renter: pMap.get(r.renter_id) ?? null,
          outbound_status: outbound?.status ?? null,
        };
      }) as Booking[];
    },
  });

  if (!isLender) {
    return (
      <div className="rounded-md border border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">My Bookings is for lenders. Enable lending to manage your rentals here.</p>
      </div>
    );
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const isUpcomingTryOn = (b: Booking) =>
    isTryOnBooking(b.hire_option) &&
    ["requested", "accepted", "active"].includes(b.status) &&
    (b.start_date ?? "") >= today;

  const tryOns = bookings.filter(isUpcomingTryOn);
  const upcoming = bookings.filter((b) => b.status === "accepted" && !isUpcomingTryOn(b));
  const outWithRenter = bookings.filter((b) => b.status === "active" && !isUpcomingTryOn(b));
  const past = bookings.filter((b) => PAST_STATUSES.includes(b.status));

  return (
    <div className="space-y-10">
      <header>
        <h2 className="font-display text-3xl text-ink">My Bookings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your complete ledger of accepted, active and past rentals.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {tryOns.length > 0 && (
            <Section
              title="Try-ons"
              subtitle="In-person try-ons, collected from you. One day, no shipping."
              icon={<Sparkles className="h-4 w-4" />}
              bookings={tryOns}
              emptyText="No try-ons booked."
            />
          )}
          <Section
            title="Upcoming"
            subtitle="Accepted bookings waiting to be shipped or worn."
            icon={<ShoppingBag className="h-4 w-4" />}
            bookings={upcoming}
            emptyText="No upcoming bookings."
          />
          <Section
            title="Out with renter"
            subtitle="Active rentals currently with the renter."
            icon={<Truck className="h-4 w-4" />}
            bookings={outWithRenter}
            emptyText="No dresses currently out with a renter."
          />

          <Section
            title="Past"
            subtitle="Completed, cancelled and rejected bookings."
            icon={<PackageCheck className="h-4 w-4" />}
            bookings={past}
            emptyText="No past bookings yet."
            muted
          />
        </>
      )}
    </div>
  );
}

function Section({
  title, subtitle, icon, bookings, emptyText, muted,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bookings: Booking[];
  emptyText: string;
  muted?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-tint text-magenta">{icon}</span>
        <div>
          <h3 className="font-display text-xl text-ink">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="ml-auto rounded-full bg-bg-tint px-2 py-0.5 text-[11px] text-ink">{bookings.length}</span>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border bg-surface px-6 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <ul className={`space-y-3 ${muted ? "opacity-95" : ""}`}>
          {bookings.map((b) => <BookingRow key={b.id} b={b} />)}
        </ul>
      )}
    </section>
  );
}

function BookingRow({ b }: { b: Booking }) {
  const img = ((b.dress?.images ?? []) as any[])
    .sort((a, c) => (a.position ?? 0) - (c.position ?? 0))[0]?.url;
  // Payout is always the stored column — never derived from the rental fee.
  const payout = Number(b.lender_payout_amount ?? 0);
  const tryOn = isTryOnBooking(b.hire_option);

  return (
    <li>
      <Link
        to="/dashboard/booking-requests/$bookingId"
        params={{ bookingId: b.id }}
        className="flex items-center gap-4 rounded-[10px] border border-border bg-surface p-3 hover:bg-bg-tint"
      >
        {img ? (
          <img src={img} alt="" className="h-16 w-16 flex-shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-16 w-16 flex-shrink-0 rounded-md bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider-display text-muted-foreground">
            {b.dress?.brand?.name ?? "Designer"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-base text-ink">{b.dress?.title ?? "Dress"}</p>
            {tryOn && <TryOnBadge />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {b.start_date &&
              (tryOn
                ? formatTryOnWhen(format(parseISO(b.start_date), "EEE d MMM"), (b as any).try_on_period)
                : format(parseISO(b.start_date), "EEE d MMM"))}
            {!tryOn && b.end_date && b.end_date !== b.start_date
              ? ` → ${format(parseISO(b.end_date), "EEE d MMM")}`
              : ""}
            {b.renter?.first_name && <> · {b.renter.first_name}</>}
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end">
          <span className="rounded-full bg-bg-tint px-2 py-0.5 text-[10px] uppercase tracking-wider-display text-ink">
            {b.status}
          </span>

          <span className="mt-1 text-sm font-medium text-magenta">${payout.toFixed(2)}</span>
        </div>
      </Link>
    </li>
  );
}
