import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/occasions/")({
  head: () => ({
    meta: [
      { title: "Occasions — Designerex" },
      {
        name: "description",
        content:
          "Browse dresses by occasion. Whatever the event, find the perfect dress for it.",
      },
      { property: "og:title", content: "Occasions — Designerex" },
      {
        property: "og:description",
        content: "Whatever the event, find the perfect dress for it.",
      },
    ],
  }),
  component: OccasionsIndex,
});

type Occasion = {
  id: string;
  name: string;
  slug: string;
  landing_page_description: string | null;
  image_url: string | null;
};

const GRADIENTS = [
  "from-pink-soft to-cream",
  "from-[#F8E1E7] to-[#FFF6EE]",
  "from-[#FCEBE2] to-[#F8E1E7]",
  "from-cream to-pink-soft",
  "from-[#F3E8FF] to-[#FFE4EC]",
  "from-[#FFE9D6] to-[#FFF1E0]",
];

function OccasionsIndex() {
  const { data: occasions = [], isLoading } = useQuery({
    queryKey: ["occasions-index"],
    queryFn: async (): Promise<Occasion[]> => {
      const { data, error } = await supabase
        .from("occasions")
        .select("id, name, slug, landing_page_description, image_url")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Occasion[];
    },
  });

  return (
    <AppShell>
      <section className="bg-cream">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:py-20 text-center">
          <p className="text-[10px] tracking-wider-display text-pink">
            BROWSE BY OCCASION
          </p>
          <h1 className="mt-3 font-serif text-4xl md:text-6xl">
            Dress for the moment.
          </h1>
          <p className="mt-4 text-muted-foreground md:text-lg">
            Whatever the event, find the perfect dress for it.
          </p>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground">Loading occasions…</p>
          ) : occasions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No occasions available.
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {occasions.map((o, idx) => (
                <Link
                  key={o.id}
                  to="/browse"
                  search={{ occasion: o.slug } as never}
                  className={`group relative block overflow-hidden rounded-2xl bg-gradient-to-br ${
                    GRADIENTS[idx % GRADIENTS.length]
                  } transition-all hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-pink-soft">
                    <div className="absolute inset-0 flex items-center justify-center bg-pink-soft">
                      <span className="px-6 text-center font-display text-3xl text-ink/60">
                        {o.name}
                      </span>
                    </div>
                    {o.image_url && (
                      <img
                        src={o.image_url}
                        alt={o.name}
                        className="relative h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          console.error(
                            `[occasions] image failed: ${img.src} (status unknown — check Network tab)`,
                          );
                          img.style.display = "none";
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-col justify-end p-6">
                    <h2 className="font-serif text-2xl leading-tight text-ink">
                      {o.name}
                    </h2>
                    {o.landing_page_description && (
                      <p className="mt-1.5 line-clamp-1 text-sm text-ink/70">
                        {o.landing_page_description}
                      </p>
                    )}
                    <p className="mt-3 text-[11px] tracking-wider-display text-ink/60 transition-colors group-hover:text-pink">
                      SHOP NOW →
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
