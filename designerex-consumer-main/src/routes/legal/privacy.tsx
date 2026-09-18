import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Designerex" },
      { name: "description", content: "How Designerex collects, uses, and protects your personal information." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="10 July 2026">
      <Section title="What we collect">
        <p>We collect information you provide to us directly — including your name, email, phone number, delivery address, ID verification details, and payment information — and information generated through your use of the platform, such as bookings, messages, and device data.</p>
      </Section>
      <Section title="How we use it">
        <p>Your information is used to operate the platform: creating your account, processing bookings and payments, verifying identity, arranging delivery, providing customer support, and communicating with you about your activity on Designerex.</p>
      </Section>
      <Section title="Sharing">
        <p>We share limited information with lenders and renters as required to complete a booking (for example, delivery address). We also share information with service providers who help us run the platform, including payment processors and delivery partners.</p>
      </Section>
      <Section title="Storage & security">
        <p>Your data is stored on secured infrastructure. We apply reasonable technical and organisational measures to protect it, but no system is completely secure.</p>
      </Section>
      <Section title="Your rights">
        <p>You may access, correct, or request deletion of your personal information by contacting us. Some information must be retained to meet legal or tax obligations.</p>
      </Section>
      <Section title="Cookies">
        <p>We use cookies and similar technologies to keep you signed in, remember preferences, and understand how the platform is used.</p>
      </Section>
      <Section title="Contact">
        <p>Privacy enquiries can be sent to hello@designerex.com.au.</p>
      </Section>
    </LegalPage>
  );
}
