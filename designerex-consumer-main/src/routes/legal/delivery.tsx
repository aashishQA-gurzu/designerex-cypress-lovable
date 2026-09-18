import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/legal/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery & Returns — Designerex" },
      { name: "description", content: "Delivery methods, timeframes, and return process for Designerex rentals." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  return (
    <LegalPage title="Delivery & Returns" lastUpdated="10 July 2026">
      <Section title="Delivery methods">
        <p>Bookings ship via standard or express courier depending on the lender's location and the delivery option selected at checkout. Two-hour delivery is available in selected metro areas where the lender has opted in.</p>
      </Section>
      <Section title="Timeframes">
        <p>Standard delivery is typically 2–5 business days; express is 1–2 business days. Delivery is scheduled so the item arrives before the first day of the rental period.</p>
      </Section>
      <Section title="Tracking">
        <p>Once a shipment is dispatched, tracking is available from the renter's dashboard under the relevant booking.</p>
      </Section>
      <Section title="Returns">
        <p>The item must be returned by the last day of the rental period using the return label provided by Designerex. Late returns may incur additional fees.</p>
      </Section>
      <Section title="Missing or delayed shipments">
        <p>If a shipment is significantly delayed or does not arrive, contact Designerex support so we can work with the courier and, if required, arrange a resolution.</p>
      </Section>
      <Section title="Contact">
        <p>Delivery enquiries can be sent to hello@designerex.com.au.</p>
      </Section>
    </LegalPage>
  );
}
