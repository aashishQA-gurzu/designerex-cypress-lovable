import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <span className="mb-4 inline-block rounded-full bg-pink-soft px-3 py-1 text-[10px] tracking-wider-display text-pink">
          LEGAL
        </span>
        <h1 className="font-serif text-4xl md:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Draft — pending final review.
        </div>
        <article className="legal-prose mt-10 space-y-6 text-[15px] leading-relaxed text-ink">
          {children}
        </article>
      </div>
    </AppShell>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}
