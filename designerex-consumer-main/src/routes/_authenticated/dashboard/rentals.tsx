import { createFileRoute } from "@tanstack/react-router";
import { MyRentalsSection } from "@/components/dashboard/MyRentalsSection";

export const Route = createFileRoute("/_authenticated/dashboard/rentals")({
  ssr: false,
  component: MyRentalsPage,
});

function MyRentalsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">My Rentals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your active rentals and review your past bookings.
        </p>
      </div>
      <MyRentalsSection />
    </div>
  );
}
