import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/designers/")({
  head: () => ({
    meta: [
      { title: "Designers — Designerex" },
      {
        name: "description",
        content:
          "Browse every designer on Designerex. From iconic Australian labels to global statement-makers.",
      },
      { property: "og:title", content: "Designers — Designerex" },
      {
        property: "og:description",
        content: "From iconic Australian labels to global statement-makers.",
      },
    ],
  }),
  component: DesignersIndex,
});

type Brand = { id: string; name: string; slug: string };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function firstLetter(name: string): string {
  const c = (name || "#").trim()[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(c) ? c : "#";
}

function DesignersIndex() {
  const [q, setQ] = useState("");

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["designers-index"],
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, slug")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(needle));
  }, [brands, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Brand[]>();
    for (const b of filtered) {
      const key = firstLetter(b.name);
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const availableLetters = new Set(groups.map(([l]) => l));

  return (
    <AppShell>
      <section className="bg-cream">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:py-20 text-center">
          <p className="text-[10px] tracking-wider-display text-pink">
            BROWSE BY DESIGNER
          </p>
          <h1 className="mt-3 font-serif text-4xl md:text-6xl">
            Designers we love.
          </h1>
          <p className="mt-4 text-muted-foreground md:text-lg">
            From iconic Australian labels to global statement-makers.
          </p>

          <div className="mx-auto mt-8 max-w-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search designers..."
                className="w-full rounded-full border border-border bg-white px-10 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pink/40"
              />
            </div>
          </div>

          {!isLoading && filtered.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-1">
              {LETTERS.map((l) => {
                const has = availableLetters.has(l);
                return has ? (
                  <a
                    key={l}
                    href={`#letter-${l}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-ink hover:bg-pink hover:text-pink-foreground"
                  >
                    {l}
                  </a>
                ) : (
                  <span
                    key={l}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs text-muted-foreground/40"
                  >
                    {l}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground">Loading designers…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No designers match your search.
            </p>
          ) : (
            <div className="space-y-14">
              {groups.map(([letter, items]) => (
                <div key={letter} id={`letter-${letter}`} className="scroll-mt-24">
                  <h2 className="mb-6 font-serif text-3xl text-pink">{letter}</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((b) => (
                      <Link
                        key={b.id}
                        to="/browse"
                        search={{ designer: b.slug } as never}
                        className="group block rounded-xl border border-border bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-pink hover:shadow-md"
                      >
                        <p className="font-serif text-lg leading-tight">{b.name}</p>
                        <p className="mt-2 text-[11px] tracking-wider-display text-muted-foreground opacity-0 transition-opacity group-hover:text-pink group-hover:opacity-100">
                          VIEW DRESSES →
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
