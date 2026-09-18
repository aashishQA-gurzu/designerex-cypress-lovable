import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  Search,
  CalendarDays,
  Sparkles,
  Package,
  Shirt,
  Bell,
  Truck,
  Banknote,
  ShieldCheck,
  BadgeCheck,
  Droplets,
  Headphones,
} from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — Designerex" },
      {
        name: "description",
        content:
          "Rent designer dresses from women across Australia, or turn your own wardrobe into income. Learn how Designerex works for renters and lenders.",
      },
      { property: "og:title", content: "How it works — Designerex" },
      {
        property: "og:description",
        content:
          "Rent designer dresses from women across Australia, or turn your own wardrobe into income.",
      },
    ],
  }),
  component: HowItWorksPage,
});

/* ------------------------------------------------------------------ */

const RENTER_STEPS = [
  {
    num: "01",
    title: "Find your dress",
    body: "Browse thousands of designer pieces from lenders across the country. Filter by designer, occasion, size and the dates you need.",
    icon: Search,
  },
  {
    num: "02",
    title: "Book your dates",
    body: "Choose your rental length and how you'd like it delivered. We only place a hold on your card — you're not charged until the lender confirms your booking.",
    icon: CalendarDays,
  },
  {
    num: "03",
    title: "Wear it",
    body: "Your dress arrives ready to go. Turn up feeling like the best version of yourself.",
    icon: Sparkles,
  },
  {
    num: "04",
    title: "Send it back",
    body: "Return it with the prepaid label included in your order — that's all there is to it.",
    icon: Package,
  },
];

const LENDER_STEPS = [
  {
    num: "01",
    title: "List your dresses",
    body: "Add photos, sizes, pricing and availability in minutes. Your wardrobe starts earning while it would otherwise sit in the closet.",
    icon: Shirt,
  },
  {
    num: "02",
    title: "Accept requests",
    body: "Get notified the moment someone wants to rent. Approve the bookings that work for you.",
    icon: Bell,
  },
  {
    num: "03",
    title: "Send it out",
    body: "Ship with a prepaid label or offer local pickup — we walk you through every step.",
    icon: Truck,
  },
  {
    num: "04",
    title: "Get paid",
    body: "Your earnings land in your bank account on a regular weekly payout. The more you lend, the more you make.",
    icon: Banknote,
  },
];

const TRUST_ITEMS = [
  {
    label: "Secure payments",
    body: "Card details are handled by Stripe and you're never charged until a booking is confirmed.",
    icon: ShieldCheck,
  },
  {
    label: "Verified members",
    body: "Renters and lenders are ID-verified for everyone's peace of mind.",
    icon: BadgeCheck,
  },
  {
    label: "Prepaid returns",
    body: "Every order includes a prepaid return label, so sending your dress back is effortless.",
    icon: Droplets,
  },
  {
    label: "Real support",
    body: "A real Australian team, Mon–Fri 9am–5pm AEST, whenever you need a hand.",
    icon: Headphones,
  },
];

/* ------------------------------------------------------------------ */

function HowItWorksPage() {
  return (
    <AppShell>
      <Intro />
      <StepsSection
        eyebrow="RENTING A DRESS"
        heading="Renting a dress"
        steps={RENTER_STEPS}
        bg="bg-cream"
      />
      <StepsSection
        eyebrow="LENDING YOUR DRESSES"
        heading="Lending your dresses"
        steps={LENDER_STEPS}
        bg="bg-background"
      />
      <TrustStrip />
      <ClosingCta />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function Intro() {
  return (
    <section className="bg-cream pt-16 pb-12 md:pt-24 md:pb-16">
      <div className="mx-auto max-w-[1400px] px-6 text-center">
        <p className="text-[10px] tracking-wider-display text-pink">
          SIMPLE &amp; SEAMLESS
        </p>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] md:text-5xl lg:text-6xl">
          How Designerex works
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Rent designer dresses from women across Australia, or turn your own
          wardrobe into income. Here's how — whichever side you're on.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function StepsSection({
  eyebrow,
  heading,
  steps,
  bg,
}: {
  eyebrow: string;
  heading: string;
  steps: typeof RENTER_STEPS;
  bg: string;
}) {
  return (
    <section className={`${bg} py-14 md:py-20`}>
      <div className="mx-auto max-w-[1400px] px-6">
        <p className="text-[10px] tracking-wider-display text-pink">{eyebrow}</p>
        <h2 className="mt-3 font-serif text-3xl md:text-4xl">{heading}</h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <StepCard key={s.num} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StepCard({
  num,
  title,
  body,
  icon: Icon,
}: {
  num: string;
  title: string;
  body: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-soft text-pink">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-display text-2xl text-muted-foreground/30">
          {num}
        </span>
      </div>
      <h3 className="mt-5 font-serif text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TrustStrip() {
  return (
    <section className="bg-ink py-14 md:py-20">
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_ITEMS.map((item) => (
            <div key={item.label} className="text-center lg:text-left">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-pink">
                <item.icon className="h-5 w-5" />
              </span>
              <h4 className="mt-4 text-sm font-medium tracking-wide text-ink-foreground">
                {item.label}
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-foreground/70">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ClosingCta() {
  return (
    <section className="bg-cream py-16 md:py-24">
      <div className="mx-auto max-w-[1400px] px-6 text-center">
        <h2 className="font-display text-3xl md:text-4xl">
          Ready to get started?
        </h2>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link to="/browse" className="btn-primary w-full sm:w-auto">
            Find your next dress
          </Link>
          <Link to="/dashboard/listings/new" className="btn-outline w-full sm:w-auto">
            Start lending
          </Link>
        </div>
      </div>
    </section>
  );
}
