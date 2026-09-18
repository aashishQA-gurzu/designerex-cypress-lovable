import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Truck, PackageCheck, Clock, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute(
  "/_authenticated/dashboard/rentals_/$bookingId/return",
)({
  ssr: false,
  component: ReturnScreen,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-6">
      <p className="text-sm text-ink">We couldn't load this return.</p>
      <p className="mt-1 text-xs text-muted-foreground">{(error as any)?.message}</p>
    </div>
  ),
  notFoundComponent: () => {
    const { bookingId } = Route.useParams();
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-ink">Rental not found.</p>
        <p className="mt-1 text-xs text-muted-foreground">Booking id: {bookingId}</p>
      </div>
    );
  },
});

const humanise = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const fmt = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
};

function ReturnScreen() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["renter-return", bookingId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      console.log("[return-screen] resolving bookingId:", bookingId);
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select(
          `id, start_date, end_date, status, renter_id, lender_id,
           dress:dresses!bookings_dress_id_fkey(id, title, images:dress_images(url, position))`,
        )
        .eq("id", bookingId)
        .maybeSingle();
      console.log("[return-screen] booking result:", { booking, bErr });
      if (bErr) throw bErr;
      if (!booking) throw new Error("Booking not found or not yours");

      const { data: shipments, error: sErr } = await supabase
        .from("shipments")
        .select("*")
        .eq("booking_id", bookingId)
        .eq("direction", "return");
      console.log("[return-screen] return shipment query:", { shipments, sErr });
      // A missing/empty return shipment is expected — render the pending state, never 404.
      const ret = (shipments ?? [])[0] ?? null;
      return { booking, returnShipment: ret as any };
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
      </Link>

      <header>
        <h1 className="font-display text-3xl text-ink">Return your dress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you need to send this dress back.
        </p>
      </header>

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-[10px] border border-border bg-surface" />
      ) : isError ? (
        <div className="rounded-[10px] border border-border bg-surface p-6 text-sm text-ink">
          We couldn't load this booking.
          <p className="mt-1 text-xs text-muted-foreground">
            {(error as any)?.message ?? "Please try again."}
          </p>
        </div>
      ) : !data ? null : (
        <>
          <BookingHeader booking={data.booking} />
          <ReturnPanel shipment={data.returnShipment} endDate={data.booking.end_date} />
          <Instructions endDate={data.booking.end_date} />
        </>
      )}
    </div>
  );
}

function BookingHeader({ booking }: { booking: any }) {
  const img = (booking.dress?.images ?? [])
    .slice()
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;
  return (
    <div className="flex items-center gap-4 rounded-[10px] border border-border bg-surface p-4">
      {img ? (
        <img src={img} alt="" className="h-20 w-20 flex-shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-20 w-20 flex-shrink-0 rounded-md bg-bg-tint" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xl text-ink">
          {booking.dress?.title ?? "Dress"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Rental {fmt(booking.start_date)} → {fmt(booking.end_date)}
        </p>
      </div>
    </div>
  );
}

function ReturnPanel({
  shipment,
  endDate,
}: {
  shipment: any | null;
  endDate: string;
}) {
  const hasLabel = !!shipment?.label_url;

  if (hasLabel) {
    return (
      <section className="rounded-[10px] border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-magenta/10 text-magenta">
            <Truck className="h-4 w-4" />
          </span>
          <h2 className="font-display text-xl text-ink">Your prepaid return label</h2>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-tint/40 px-3 py-2 text-xs">
          <span className="uppercase tracking-wider text-muted-foreground">Status</span>
          <span className="font-medium text-ink">
            {humanise(shipment.status) || "Ready"}
          </span>
        </div>

        {shipment.tracking_number && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-tint/40 px-3 py-2 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">Tracking</span>
            <span className="font-mono text-ink">{shipment.tracking_number}</span>
          </div>
        )}

        <a
          href={shipment.label_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-magenta inline-flex items-center justify-center gap-2 text-sm"
        >
          <Printer className="h-4 w-4" /> Print return label
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Clock className="h-4 w-4" />
        </span>
        <h2 className="font-display text-xl text-ink">Return label pending</h2>
      </div>
      <p className="text-sm text-ink">
        Your prepaid return label is being prepared — you'll be able to print it here as
        soon as it's ready.
      </p>
      <p className="text-xs text-muted-foreground">
        Return due by <span className="text-ink">{fmt(endDate)}</span>. We'll email you
        the moment your label is available.
      </p>
    </section>
  );
}

function Instructions({ endDate }: { endDate: string }) {
  const steps = [
    {
      icon: PackageCheck,
      title: "Pack the dress",
      body: "Place the dress back in its original packaging (or a similar protective bag).",
    },
    {
      icon: Printer,
      title: "Attach the prepaid label",
      body: "Print and securely attach the return label to the outside of the parcel.",
    },
    {
      icon: MapPin,
      title: "Drop at Australia Post",
      body: `Take it to any Australia Post outlet by ${fmt(endDate)}.`,
    },
  ];
  return (
    <section className="rounded-[10px] border border-border bg-surface p-5">
      <h3 className="font-display text-lg text-ink">How to return</h3>
      <ol className="mt-3 space-y-3">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="flex gap-3">
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-bg-tint text-magenta">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
