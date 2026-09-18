import { Link } from "@tanstack/react-router";
import { Instagram } from "lucide-react";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.74a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.17z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 bg-cream">
      {/* As seen in */}
      <div className="border-y border-border/60 py-10">
        <div className="mx-auto max-w-[1600px] px-6">
          <p className="mb-6 text-center text-[10px] tracking-wider-display text-muted-foreground">
            AS SEEN IN
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-muted-foreground/70">
            {["7NEWS", "RAGTRADER", "news.com.au", "The Daily Telegraph", "ELLE", "VOGUE", "marie claire"].map(
              (n) => (
                <span key={n} className="font-serif text-sm uppercase tracking-wider opacity-70">
                  {n}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="mx-auto grid max-w-[1600px] gap-10 px-6 py-14 md:grid-cols-2 lg:grid-cols-5">
        <Column title="TOP SEARCHES" items={[
          { label: "Wedding Guest Dresses", to: "/browse?occasion=wedding-guest" },
          { label: "Formal Dresses", to: "/browse?occasion=formal" },
          { label: "Cocktail Dresses", to: "/browse?occasion=cocktail" },
          { label: "Black Dresses", to: "/browse?color=black" },
          { label: "Designer Dresses", to: "/designers" },
        ]} />
        <Column title="TERMS & POLICIES" items={[
          { label: "Terms & Conditions", to: "/legal/terms" },
          { label: "Privacy Policy", to: "/legal/privacy" },
          { label: "Refund Policy", to: "/legal/refunds" },
          { label: "Delivery & Returns", to: "/legal/delivery" },
          { label: "Lender Terms", to: "/legal/lender" },
        ]} />
        <Column title="HELP & SUPPORT" items={[
          { label: "FAQs", to: "/faq" },
          { label: "Customer Service", to: "/customer-service" },
          { label: "Contact Us", to: "/contact" },
          { label: "How It Works", to: "/how-it-works" },
          { label: "Lending With Us", to: "/lending-with-us" },
        ]} />
        <div>
          <h4 className="mb-4 text-[10px] tracking-wider-display text-muted-foreground">CONTACT US</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="mailto:Support@designerex.com.au" className="hover:text-pink">Support@designerex.com.au</a></li>
            <li><a href="tel:1300123456" className="hover:text-pink">1300 123 456</a></li>
            <li className="text-muted-foreground">Mon–Fri 9am–5pm AEST</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 text-[10px] tracking-wider-display text-muted-foreground">FOLLOW US</h4>
          <div className="flex gap-3">
            <Social href="https://www.instagram.com/_designerex/?hl=en" Icon={Instagram} label="instagram" />
            <Social href="https://www.tiktok.com/@_designerexoffici" Icon={TikTokIcon} label="tiktok" />
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 py-6">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-6 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} Designerex Pty Ltd. All rights reserved.</p>
          <p className="font-serif tracking-wider">DESIGNED IN AUSTRALIA</p>
        </div>
      </div>
    </footer>
  );
}

function Column({ title, items }: { title: string; items: { label: string; to: string }[] }) {
  return (
    <div>
      <h4 className="mb-4 text-[10px] tracking-wider-display text-muted-foreground">{title}</h4>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.label}>
            <Link to={i.to} className="transition-colors hover:text-pink">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Social({ href, Icon, label }: { href: string; Icon?: React.ComponentType<{ className?: string }>; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label ?? href}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-pink hover:text-pink"
    >
      {Icon ? <Icon className="h-4 w-4 pointer-events-none" /> : <span className="text-xs font-medium">{label}</span>}
    </a>
  );
}
