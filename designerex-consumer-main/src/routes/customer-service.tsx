import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Sparkles, FileQuestion, Mail } from "lucide-react";

export const Route = createFileRoute("/customer-service")({
  head: () => ({
    meta: [
      { title: "Customer Service — Designerex" },
      {
        name: "description",
        content:
          "Find quick answers or get in touch with the Designerex support team.",
      },
      { property: "og:title", content: "Customer Service — Designerex" },
      {
        property: "og:description",
        content: "Find quick answers or get in touch with the Designerex support team.",
      },
    ],
  }),
  component: CustomerServicePage,
});

const HELP_CARDS = [
  {
    title: "How Designerex works",
    to: "/how-it-works",
    description: "New here? See how renting and lending work, step by step.",
    icon: Sparkles,
  },
  {
    title: "Browse FAQs",
    to: "/faq",
    description: "Quick answers to the most common questions.",
    icon: FileQuestion,
  },
  {
    title: "Contact our team",
    to: "/contact",
    description: "Can't find what you need? Send us a message.",
    icon: Mail,
  },
];

function CustomerServicePage() {
  return (
    <AppShell>
      {/* Intro */}
      <section className="bg-cream pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <p className="text-[10px] tracking-wider-display text-pink">HELP &amp; SUPPORT</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] md:text-5xl lg:text-6xl">
            How can we help?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Find quick answers or get in touch — whatever you need.
          </p>
        </div>
      </section>

      {/* Help cards */}
      <section className="bg-background py-10 md:py-16">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {HELP_CARDS.map((card) => (
              <Link
                key={card.title}
                to={card.to}
                className="group rounded-xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-soft text-pink">
                  <card.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-serif text-xl">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
                <span className="mt-4 inline-block text-sm font-medium text-pink transition-colors group-hover:underline">
                  Learn more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Support strip */}
      <section className="bg-cream py-14 md:py-20">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <p className="text-base text-muted-foreground md:text-lg">
            Our team is here Monday to Friday, 9am–5pm AEST.
          </p>
          <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground sm:flex-row sm:justify-center">
            <a
              href="mailto:hello@designerex.com.au"
              className="transition-colors hover:text-pink"
            >
              hello@designerex.com.au
            </a>
            <span className="hidden text-border sm:inline">·</span>
            <a
              href="tel:1300123456"
              className="transition-colors hover:text-pink"
            >
              1300 123 456
            </a>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
