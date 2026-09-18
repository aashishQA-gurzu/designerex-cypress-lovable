import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Designerex" },
      { name: "description", content: "Designerex Terms & Conditions governing use of the platform, bookings, and payments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" lastUpdated="10 July 2026">
      <Section title="1. Acceptance">
        <p>By creating an account, listing an item, or booking a rental on Designerex, you agree to these Terms & Conditions and our Privacy Policy. If you do not agree, do not use the platform.</p>
      </Section>
      <Section title="2. The platform">
        <p>Designerex is a peer-to-peer marketplace that connects renters with lenders of designer garments. Designerex is not a party to the rental agreement between a renter and a lender, except where expressly stated.</p>
      </Section>
      <Section title="3. Bookings & payments">
        <p>A booking request is submitted by a renter and confirmed once the lender accepts. Payment is taken in full at acceptance. All prices are in AUD and inclusive of GST where applicable.</p>
        <p>Designerex charges a booking fee on the rental price. Shipping is passed through separately and is not subject to the booking fee.</p>
      </Section>
      <Section title="4. Cancellations">
        <p>Cancellations are governed by our Refund Policy. Renters may cancel a booking request before the lender ships the item, subject to the eligibility rules set out there.</p>
      </Section>
      <Section title="5. Security deposits">
        <p>Certain listings require a refundable security deposit which is authorised on the renter's card at booking. The deposit is released after the item is returned in the condition it was sent, subject to inspection. Damage claims are reviewed by the Designerex team.</p>
      </Section>
      <Section title="6. Liability">
        <p>Renters are responsible for the item from the moment it is delivered until it is returned. Lenders are responsible for accurately representing the item's size, condition, and availability. Designerex's liability is limited to the fullest extent permitted by law.</p>
      </Section>
      <Section title="7. Prohibited conduct">
        <p>Users must not misrepresent items, transact outside the platform, or use Designerex for any unlawful purpose. Accounts that breach these rules may be suspended.</p>
      </Section>
      <Section title="8. Changes to these terms">
        <p>We may update these terms from time to time. Continued use of the platform after changes are posted constitutes acceptance.</p>
      </Section>
      <Section title="9. Contact">
        <p>Questions about these terms can be sent to hello@designerex.com.au.</p>
      </Section>
    </LegalPage>
  );
}
