import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQs — Designerex" },
      {
        name: "description",
        content:
          "Frequently asked questions about renting and lending designer dresses on Designerex.",
      },
      { property: "og:title", content: "FAQs — Designerex" },
      {
        property: "og:description",
        content:
          "Everything you need to know about renting and lending on Designerex.",
      },
    ],
  }),
  component: FaqPage,
});

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  position: number;
}

const CATEGORY_ORDER = [
  "General",
  "Renting",
  "Lending",
  "Shipping & returns",
  "Payments & security",
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function FaqPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["faqs", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("id, question, answer, category, position")
        .eq("is_published", true);
      if (error) throw error;
      return (data ?? []) as FaqRow[];
    },
  });

  // Group by category, then sort within each by position asc
  const grouped = new Map<string, FaqRow[]>();
  for (const row of data ?? []) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category)!.push(row);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const listed = CATEGORY_ORDER.filter((c) => grouped.has(c));
  const extras = Array.from(grouped.keys())
    .filter((c) => !CATEGORY_ORDER.includes(c))
    .sort((a, b) => a.localeCompare(b));
  const orderedCategories = [...listed, ...extras];

  return (
    <AppShell>
      {/* Intro */}
      <section className="bg-cream pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <p className="text-[10px] tracking-wider-display text-pink">
            HELP &amp; SUPPORT
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] md:text-5xl lg:text-6xl">
            Frequently asked questions
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Everything you need to know about renting and lending on Designerex.
          </p>

          {orderedCategories.length > 0 && (
            <nav className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {orderedCategories.map((cat) => (
                <a
                  key={cat}
                  href={`#${slugify(cat)}`}
                  className="rounded-full border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-pink hover:text-pink"
                >
                  {cat}
                </a>
              ))}
            </nav>
          )}
        </div>
      </section>

      {/* Accordion categories */}
      <section className="bg-background py-10 md:py-16">
        <div className="mx-auto max-w-[800px] px-6 space-y-14 md:space-y-20">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground">
              Loading…
            </p>
          )}
          {!isLoading && orderedCategories.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No FAQs available yet.
            </p>
          )}
          {orderedCategories.map((cat) => {
            const items = grouped.get(cat)!;
            const slug = slugify(cat);
            return (
              <div key={cat} id={slug}>
                <h2 className="mb-6 font-serif text-2xl md:text-3xl">{cat}</h2>
                <Accordion type="multiple" className="w-full">
                  {items.map((item) => (
                    <AccordionItem
                      key={item.id}
                      value={item.id}
                      className="border-b border-border"
                    >
                      <AccordionTrigger className="py-5 text-left text-sm font-medium md:text-base hover:no-underline">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground md:text-base whitespace-pre-line">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            );
          })}
        </div>
      </section>

      {/* Closing block */}
      <section className="bg-cream py-16 md:py-24">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <h2 className="font-display text-3xl md:text-4xl">
            Still have questions?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground md:text-lg">
            Our team is here to help, Monday to Friday, 9am–5pm AEST.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground sm:flex-row sm:justify-center">
            <a
              href="mailto:hello@designerex.com.au"
              className="hover:text-pink"
            >
              hello@designerex.com.au
            </a>
            <span className="hidden text-border sm:inline">·</span>
            <a href="tel:1300123456" className="hover:text-pink">
              1300 123 456
            </a>
          </div>
          <Link to="/contact" className="btn-primary mt-8 inline-flex">
            Contact us
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
