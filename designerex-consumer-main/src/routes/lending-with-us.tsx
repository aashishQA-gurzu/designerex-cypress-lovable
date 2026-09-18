import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  Wallet,
  SlidersHorizontal,
  ShieldCheck,
  Headphones,
  Shirt,
  Bell,
  Truck,
  Banknote,
} from "lucide-react";

export const Route = createFileRoute("/lending-with-us")({
  head: () => ({
    meta: [
      { title: "Lending With Us — Designerex" },
      {
        name: "description",
        content:
          "Turn your wardrobe into income. List your designer dresses on Designerex and rent them to women across Australia.",
      },
      { property: "og:title", content: "Lending With Us — Designerex" },
      {
        property: "og:description",
        content:
          "Turn your wardrobe into income. List your designer dresses on Designerex and rent them to women across Australia.",
      },
    ],
  }),
  component: LendingWithUsPage,
});

/* ------------------------------------------------------------------ */

const BENEFITS = [
  {
    title: "Earn from what you already own",
    body: "Your wardrobe works for you instead of gathering dust.",
    icon: Wallet,
  },
  {
    title: "You're in control",
    body: "Set your own prices, approve every booking, and pause anytime with Vacation Mode.",
    icon: SlidersHorizontal,
  },
  {
    title: "We handle the hard parts",
    body: "Secure payments, prepaid shipping labels, and payouts straight to your bank — we take care of the logistics.",
    icon: ShieldCheck,
  },
  {
    title: "Real support",
    body: "An Australian team to help whenever you need it.",
    icon: Headphones,
  },
];

const STEPS = [
  {
    num: "01",
    title: "List your dresses",
    body: "Add photos, sizes and pricing in minutes.",
    icon: Shirt,
  },
  {
    num: "02",
    title: "Accept requests",
    body: "Approve the bookings that work for you.",
    icon: Bell,
  },
  {
    num: "03",
    title: "Send it out",
    body: "Ship with a prepaid label or offer local pickup.",
    icon: Truck,
  },
  {
    num: "04",
    title: "Get paid",
    body: "Earnings land in your bank account on a regular weekly payout.",
    icon: Banknote,
  },
];

/* ------------------------------------------------------------------ */

function LendingWithUsPage() {
  return (
    <AppShell>
      <Hero />
      <BenefitsSection />
      <HowItWorksStrip />
      <ClosingCta />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="bg-cream pt-16 pb-12 md:pt-24 md:pb-16">
      <div className="mx-auto max-w-[1400px] px-6 text-center">
        <p className="text-[10px] tracking-wider-display text-pink">
          BECOME A LENDER
        </p>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] md:text-5xl lg:text-6xl">
          Turn your wardrobe into income
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Those designer pieces sitting in your closet could be earning. List
          them on Designerex and rent them to women across Australia — entirely
          on your terms.
        </p>
        <div className="mt-8">
          <Link to="/dashboard/listings/new" className="btn-primary">
            Start lending
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function BenefitsSection() {
  return (
    <section className="bg-background py-14 md:py-20">
      <div className="mx-auto max-w-[1400px] px-6">
        <p className="text-[10px] tracking-wider-display text-pink">
          WHY LEND WITH US
        </p>
        <h2 className="mt-3 font-serif text-3xl md:text-4xl">
          The benefits of lending
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="rounded-xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-soft text-pink">
                <b.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-serif text-xl">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function HowItWorksStrip() {
  return (
    <section className="bg-cream py-14 md:py-20">
      <div className="mx-auto max-w-[1400px] px-6">
        <p className="text-[10px] tracking-wider-display text-pink">
          HOW LENDING WORKS
        </p>
        <h2 className="mt-3 font-serif text-3xl md:text-4xl">
          Four simple steps
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.num} className="text-center lg:text-left">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-soft text-pink">
                <s.icon className="h-5 w-5" />
              </span>
              <div className="mt-4 font-display text-xs text-muted-foreground/40">
                {s.num}
              </div>
              <h4 className="mt-1 text-sm font-medium tracking-wide">
                {s.title}
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/how-it-works"
            className="inline-flex items-center text-sm font-medium text-pink underline-offset-4 hover:underline"
          >
            See how it all works
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ClosingCta() {
  return (
    <section className="bg-ink py-16 md:py-24">
      <div className="mx-auto max-w-[1400px] px-6 text-center">
        <h2 className="font-display text-3xl text-ink-foreground md:text-4xl">
          Ready to start earning?
        </h2>
        <div className="mt-8">
          <Link
            to="/dashboard/listings/new"
            className="inline-flex items-center justify-center rounded-full bg-pink px-8 py-3 text-sm font-medium text-pink-foreground transition-opacity hover:opacity-92"
          >
            List your first dress
          </Link>
        </div>
      </div>
    </section>
  );
}
