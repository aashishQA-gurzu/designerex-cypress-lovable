import { createFileRoute } from "@tanstack/react-router";
import { LenderGate } from "@/components/auth/LenderGate";
import { ListingForm } from "@/components/listings/ListingForm";

export const Route = createFileRoute("/_authenticated/dashboard/listings_/$id/edit")({
  ssr: false,
  component: () => {
    const { id } = Route.useParams();
    return (
      <LenderGate>
        <ListingForm dressId={id} />
      </LenderGate>
    );
  },
});
