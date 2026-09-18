import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/legal/lender")({
  head: () => ({
    meta: [
      { title: "Lender Terms — Designerex" },
      { name: "description", content: "Terms governing listings, payouts, and lender responsibilities on Designerex." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderPage,
});

function LenderPage() {
  return (
    <LegalPage title="Lender Terms" lastUpdated="10 July 2026">
      <Section title="Listing rules">
        <p>Lenders must own the items they list and accurately describe brand, size, condition, and availability. Prohibited items include counterfeit goods and items in a condition unfit for rental.</p>
      </Section>
      <Section title="Availability & bookings">
        <p>Lenders are responsible for keeping their calendar up to date and responding to booking requests promptly. Repeated non-response or last-minute cancellations may affect a listing's visibility.</p>
      </Section>
      <Section title="Preparation & shipping">
        <p>Items must be cleaned and packaged appropriately before shipment. Lenders must ship using the label provided so the item arrives before the rental start date.</p>
      </Section>
      <Section title="Payouts">
        <p>Payouts are calculated as the rental price less the Designerex lender fee. Refundable security deposits are held by Designerex on the renter's card and are never included in a lender's payout.</p>
      </Section>
      <Section title="Damage & claims">
        <p>If an item is returned damaged, the lender should email photos and details of the damage to the Designerex team. The team assesses the claim and, where appropriate, applies a charge against the renter's security deposit. Lenders do not action the deposit directly.</p>
      </Section>
      <Section title="Responsibilities">
        <p>Lenders are responsible for the accuracy of their listings, the condition of items at dispatch, and compliance with these terms. Designerex may remove listings or suspend accounts that repeatedly breach these rules.</p>
      </Section>
      <Section title="Contact">
        <p>Lender enquiries can be sent to hello@designerex.com.au.</p>
      </Section>
    </LegalPage>
  );
}
