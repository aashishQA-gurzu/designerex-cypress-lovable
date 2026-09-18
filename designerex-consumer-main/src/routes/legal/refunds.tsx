import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/legal/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Designerex" },
      { name: "description", content: "Designerex Refund Policy for rental cancellations and eligible refunds." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" lastUpdated="10 July 2026">
      <Section title="Overview">
        <p>This policy explains when a renter may be eligible for a refund on a Designerex booking. Refund eligibility is determined by [policy to be confirmed].</p>
      </Section>
      <Section title="Cancellations by the renter">
        <p>Refunds for renter-initiated cancellations depend on the timing of the cancellation relative to the rental period and shipment status. Specific eligibility windows and amounts are [to be confirmed].</p>
      </Section>
      <Section title="Cancellations by the lender">
        <p>If a lender cancels an accepted booking, the renter will be refunded in accordance with [policy to be confirmed].</p>
      </Section>
      <Section title="Item not as described or not delivered">
        <p>If the item is not delivered on time or arrives materially not as described, the renter should contact Designerex support. Any refund is assessed on a case-by-case basis in line with [policy to be confirmed].</p>
      </Section>
      <Section title="Security deposits">
        <p>Refundable security deposits are held separately from the rental total and are not affected by this policy. Deposits are released after a successful return, subject to inspection.</p>
      </Section>
      <Section title="How refunds are processed">
        <p>Approved refunds are returned to the original payment method. Processing times depend on your bank or card issuer.</p>
      </Section>
      <Section title="Contact">
        <p>Refund requests and questions can be sent to hello@designerex.com.au.</p>
      </Section>
    </LegalPage>
  );
}
