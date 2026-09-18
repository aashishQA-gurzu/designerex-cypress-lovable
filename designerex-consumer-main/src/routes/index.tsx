import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NAV } from "@/components/layout/Header";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ArrowRight, Instagram, Shirt, Upload, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DressCard, DressCardSkeleton, type DressCardData } from "@/components/home/DressCard";
import { AustraliaMap } from "@/components/home/AustraliaMap";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Designerex — Rent designer dresses across Australia" },
      {
        name: "description",
        content:
          "Australia's largest peer-to-peer designer dress rental. Browse thousands of designer pieces from trusted lenders nationwide.",
      },
      { property: "og:title", content: "Designerex — Designer dress rental" },
      {
        property: "og:description",
        content: "Designer dresses. Unforgettable moments. Yours to wear.",
      },
    ],
  }),
  component: HomePage,
});


type HeroBanner = {
  id: string;
  headline: string | null;
  headline_accent: string | null;
  sub_headline: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  image_focus: string | null;
};

const HERO_FALLBACK: HeroBanner = {
  id: "fallback",
  headline: "The future of fashion is",
  headline_accent: "rental.",
  sub_headline: "Designer dresses. Unforgettable moments. Yours to wear.",
  image_url:
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=2880&q=90",
  link_url: "/browse",
  cta_label: "Browse Dresses",
  image_focus: "center",
};

function retinaSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.searchParams.has("w")) u.searchParams.set("w", "3840");
    if (u.searchParams.has("q")) u.searchParams.set("q", "90");
    return u.toString();
  } catch {
    return null;
  }
}

function HomePage() {
  return (
    <AppShell>
      <Hero />
      <Trending />
      <WhoWeAre />
      <RentNewStyles />
      <HowItWorks />
      <InstagramFeed />
    </AppShell>
  );
}


type SectionBanner = {
  id: string;
  headline: string | null;
  sub_headline: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  position: number | null;
  image_focus: string | null;
};

type ImageFocus = "center" | "top" | "bottom" | "left" | "right";

function focusToObjectPosition(focus: string | null | undefined): string {
  const f = (focus ?? "center").toLowerCase() as ImageFocus;
  switch (f) {
    case "top": return "center top";
    case "bottom": return "center bottom";
    case "left": return "left center";
    case "right": return "right center";
    default: return "center center";
  }
}

function useSectionBanners(section: string) {
  return useQuery({
    queryKey: ["homepage-section", section],
    queryFn: async (): Promise<SectionBanner[]> => {
      const { data, error } = await supabase
        .from("homepage_banners")
        .select("*")
        .eq("section", section)
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SectionBanner[];
    },
  });
}

/* ---------------- RENT NEW STYLES ---------------- */

function RentNewStyles() {
  const { data: slides } = useSectionBanners("rent_new_styles");
  const [i, setI] = useState(0);
  const [hovered, setHovered] = useState(false);
  const list = slides ?? [];

  useEffect(() => {
    if (list.length < 2 || hovered) return;
    const t = setInterval(() => setI((p) => (p + 1) % list.length), 6000);
    return () => clearInterval(t);
  }, [list.length, hovered]);

  useEffect(() => {
    if (i >= list.length && list.length > 0) setI(0);
  }, [list.length, i]);

  if (list.length === 0) return null;
  const cur = list[i] ?? list[0];
  const ctaLabel = (cur.cta_label ?? "SHOP NOW").toUpperCase();
  const newInRoute = NAV.find((n) => n.label === "NEW IN")?.to ?? "/browse";
  const ctaHref = newInRoute;

  return (
    <section
      className="relative w-full overflow-hidden bg-ink"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative h-[360px] w-full md:h-[480px]">
        {list.map((s, idx) => (
          <img
            key={s.id}
            src={s.image_url ?? ""}
            alt=""
            style={{ objectPosition: focusToObjectPosition(s.image_focus) }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              idx === i ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/30 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-[1600px] items-center px-6">
          <div className="max-w-xl text-ink-foreground [text-shadow:0_2px_12px_rgba(0,0,0,0.4)]">
            <p className="text-[10px] tracking-wider-display text-pink">RENT NEW STYLES</p>
            {cur.headline && (
              <h2 className="mt-3 font-display text-3xl leading-[1.05] md:text-5xl text-white">
                {cur.headline}
              </h2>
            )}
            {cur.sub_headline && (
              <p className="mt-4 max-w-md text-base text-ink-foreground/90">
                {cur.sub_headline}
              </p>
            )}
            <Link
              to={ctaHref as any}
              className="btn-primary mt-7"
            >
              {ctaLabel}
            </Link>
          </div>
        </div>

        {list.length > 1 && (
          <>
            <button
              onClick={() => setI((p) => (p - 1 + list.length) % list.length)}
              aria-label="Previous slide"
              className="absolute left-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-ink-foreground hover:bg-ink/60 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setI((p) => (p + 1) % list.length)}
              aria-label="Next slide"
              className="absolute right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-ink-foreground hover:bg-ink/60 md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
              {list.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setI(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === i ? "w-8 bg-ink-foreground" : "w-1.5 bg-ink-foreground/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------------- HERO ---------------- */

function HeroSearchBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    // Browse route calls the existing search_dresses RPC when `search` is set.
    navigate({ to: "/browse", search: { search: query } as never });
  };
  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Search designer dresses"
      className="mt-6 flex w-full max-w-xl items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-lg ring-1 ring-white/40 backdrop-blur"
    >
      <div className="flex flex-1 items-center gap-2 pl-4">
        <Search className="h-4 w-4 text-ink/60" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search designers, styles, occasions…"
          className="h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-ink/50 focus:outline-none"
          aria-label="Search dresses"
        />
      </div>
      <button type="submit" className="btn-primary h-11 shrink-0 rounded-full px-6">
        Search
      </button>
    </form>
  );
}

function Hero() {

  const { data: heroes } = useQuery({
    queryKey: ["homepage-hero"],
    queryFn: async (): Promise<HeroBanner[]> => {
      const { data, error } = await supabase
        .from("homepage_banners")
        .select("*")
        .eq("section", "hero")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HeroBanner[];
    },
  });

  const slides: HeroBanner[] =
    heroes && heroes.length > 0 ? heroes : [HERO_FALLBACK];
  const [i, setI] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || hovered) return;
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length, hovered]);

  useEffect(() => {
    if (i >= slides.length) setI(0);
  }, [slides.length, i]);

  const cur = slides[i] ?? HERO_FALLBACK;
  const heroHeadline = cur.headline?.trim() || HERO_FALLBACK.headline;
  const heroAccent = cur.headline_accent?.trim() || HERO_FALLBACK.headline_accent;
  const heroSubHeadline = cur.sub_headline?.trim() || HERO_FALLBACK.sub_headline;
  const ctaLabel = (cur.cta_label?.trim() || HERO_FALLBACK.cta_label || "Browse Dresses").toUpperCase();
  const ctaHref = cur.link_url || "/browse";

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-ink"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative h-[400px] w-full md:h-[600px]">
        {slides.map((s, idx) => {
          const src = s.image_url ?? HERO_FALLBACK.image_url ?? "";
          const retina = retinaSrc(src);
          return (
            <img
              key={s.id}
              src={src}
              srcSet={retina ? `${src} 1x, ${retina} 2x` : undefined}
              width={2880}
              height={1620}
              loading="eager"
              decoding="async"
              alt=""
              style={{ objectPosition: focusToObjectPosition(s.image_focus) }}
              className={`pointer-events-none absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-700 ${
                idx === i ? "opacity-100" : "opacity-0"
              }`}
            />
          );
        })}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,0.6), rgba(0,0,0,0.2))",
          }}
        />
        <div className="relative z-30 mx-auto flex h-full max-w-[1600px] items-center px-6">
          <div className="max-w-xl text-white">
            <h1 className="font-display text-4xl leading-[1.02] md:text-6xl lg:text-7xl text-white">
              {heroHeadline}
              {heroAccent ? (
                <>
                  {" "}
                  <span className="font-serif italic" style={{ color: "var(--rose)" }}>
                    {heroAccent}
                  </span>
                </>
              ) : null}
            </h1>
            {heroSubHeadline && (
              <p className="mt-5 max-w-md text-base text-white/85 md:text-lg">
                {heroSubHeadline}
              </p>
            )}
            <HeroSearchBar />
            <Link
              to={ctaHref as any}
              className="mt-5 inline-flex items-center gap-1.5 text-[11px] tracking-wider-display text-white/90 hover:text-white"
            >
              {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Link>

          </div>
        </div>

        {slides.length > 1 && (
          <>
            <button
              onClick={() =>
                setI((p) => (p - 1 + slides.length) % slides.length)
              }
              aria-label="Previous slide"
              className="absolute left-4 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-white hover:bg-ink/60 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setI((p) => (p + 1) % slides.length)}
              aria-label="Next slide"
              className="absolute right-4 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-white hover:bg-ink/60 md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setI(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === i
                      ? "w-8 bg-white"
                      : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------------- WHO WE ARE ---------------- */

function WhoWeAre() {
  return (
    <section className="bg-cream py-20 md:py-24">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-6 lg:grid-cols-3 lg:gap-10">
        <div className="flex flex-col">
          <p className="text-[10px] tracking-wider-display text-pink">WHO WE ARE</p>
          <h2 className="mt-3 font-display text-3xl leading-tight md:text-4xl">
            Designerex is Australia's premier dress rental platform.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            We connect you with stunning designer pieces from top lenders across the country — so you can wear more,
            spend less, and make every occasion unforgettable.
          </p>
          <div className="mt-8">
            <Link to="/browse" className="btn-primary">
              Rent a dress
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <AustraliaMap />
        </div>

        <div className="rounded-xl border border-border bg-white p-7 shadow-sm">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-soft text-pink">
            <Shirt className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-serif text-2xl">Rent from our lenders</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Thousands of gorgeous designer pieces, available to rent from our trusted lenders all across Australia.
          </p>
          <Link
            to="/how-it-works"
            className="mt-5 inline-flex items-center gap-1.5 text-[11px] tracking-wider-display text-ink hover:text-pink"
          >
            LEARN MORE <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <div className="mt-6 border-t border-border pt-6">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-pink-soft text-pink">
              <Upload className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-serif text-2xl">List your dress</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Have a designer dress sitting in your wardrobe? List it and start earning today.
            </p>
            <Link
              to="/dashboard/listings/new"
              className="mt-5 inline-flex items-center gap-1.5 text-[11px] tracking-wider-display text-ink hover:text-pink"
            >
              LIST YOUR DRESS <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- TRENDING ---------------- */

function Trending() {
  const { user } = useAuth();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data: dresses, isLoading } = useQuery({
    queryKey: ["trending-dresses"],
    queryFn: async (): Promise<DressCardData[]> => {
      // Trending = 30-day view-window ranking via RPC (works for anon)
      const { data: trendingRows, error } = await supabase.rpc("dx_trending_dresses", {
        p_days: 30,
        p_limit: 12,
      });
      if (error) console.warn("dx_trending_dresses error", error);

      let rows: any[] = (trendingRows ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        advertised_hire_a: r.advertised_hire_a ?? r.hire_price_a,
        lender_id: r.lender_id,
        brand_id: r.brand_id,
        size_id: r.size_id,
      }));



      if (rows.length === 0) return [];


      const dressIds = rows.map((r) => r.id);
      const brandIds = [...new Set(rows.map((r) => r.brand_id).filter(Boolean))];
      const sizeIds = [...new Set(rows.map((r) => r.size_id).filter(Boolean))];
      const lenderIds = [...new Set(rows.map((r) => r.lender_id).filter(Boolean))];

      const [brandsRes, sizesRes, imagesRes, lendersRes] = await Promise.all([
        brandIds.length
          ? supabase.from("brands").select("id, name").in("id", brandIds)
          : Promise.resolve({ data: [] as any[] }),
        sizeIds.length
          ? supabase.from("sizes").select("id, name").in("id", sizeIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("dress_images")
          .select("dress_id, url, position")
          .in("dress_id", dressIds),
        lenderIds.length
          ? supabase
              .from("profiles")
              .select("id, first_name, hire_period_a_days, status, is_lending_paused")
              .in("id", lenderIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const brandMap = new Map((brandsRes.data ?? []).map((b: any) => [b.id, b.name]));
      const sizeMap = new Map((sizesRes.data ?? []).map((s: any) => [s.id, s.name]));
      const lenderMap = new Map((lendersRes.data ?? []).map((l: any) => [l.id, l]));
      const imgMap = new Map<string, { url: string; position: number }[]>();
      for (const img of imagesRes.data ?? []) {
        const arr = imgMap.get(img.dress_id) ?? [];
        arr.push({ url: img.url, position: img.position ?? 0 });
        imgMap.set(img.dress_id, arr);
      }

      return rows
        .filter((r) => {
          const l: any = lenderMap.get(r.lender_id);
          return !l || (l.status === "active" && !l.is_lending_paused);
        })
        .map((r) => {
          const imgs = (imgMap.get(r.id) ?? []).sort((a, b) => a.position - b.position);
          const lender: any = lenderMap.get(r.lender_id);
          return {
            id: r.id,
            title: r.title,
            advertised_hire_a: r.advertised_hire_a,
            lender_id: r.lender_id,
            brand_name: brandMap.get(r.brand_id) ?? null,
            size_name: sizeMap.get(r.size_id) ?? null,
            image_url: imgs[0]?.url ?? null,
            hire_days: lender?.hire_period_a_days ?? null,
          };
        });

    },
  });

  // Pull saved set for current user so hearts pre-fill
  const { data: savedIds } = useQuery({
    queryKey: ["saved-dress-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("saved_dresses")
        .select("dress_id")
        .eq("user_id", user!.id);
      return new Set((data ?? []).map((r: { dress_id: string }) => r.dress_id));
    },
  });

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 24 : 300;
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  };

  return (
    <section className="bg-background py-16 md:py-20">
      <div className="mx-auto max-w-[1600px] px-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-[10px] tracking-wider-display text-pink">BEST / MOST RENTED</p>
            <h2 className="mt-2 font-display text-3xl md:text-4xl">What's popular right now</h2>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/browse"
              search={{ sort: "most_popular" } as never}
              className="hidden items-center gap-1.5 text-[11px] tracking-wider-display text-ink hover:text-pink md:inline-flex"
            >
              VIEW ALL <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => scroll(-1)}
                aria-label="Previous"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white hover:border-pink hover:text-pink"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => scroll(1)}
                aria-label="Next"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white hover:border-pink hover:text-pink"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="mt-8 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} data-card className="w-[68vw] shrink-0 snap-start sm:w-[40vw] md:w-[28vw] lg:w-[18vw]">
                  <DressCardSkeleton />
                </div>
              ))
            : (dresses ?? []).map((d) => (
                <div
                  key={d.id}
                  data-card
                  className="w-[68vw] shrink-0 snap-start sm:w-[40vw] md:w-[28vw] lg:w-[18vw]"
                >
                  <DressCard dress={d} saved={savedIds?.has(d.id) ?? false} />
                </div>
              ))}
          {!isLoading && (dresses ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No dresses available yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}


/* ---------------- HOW IT WORKS ---------------- */

const HOW_IT_WORKS_STEPS = [
  {
    headline: "Find your perfect dress",
    sub_headline:
      "Browse thousands of designer dresses and filter by style, size, occasion and date.",
  },
  {
    headline: "Book with ease",
    sub_headline:
      "Select your dates, choose delivery and complete your secure checkout in minutes.",
  },
  {
    headline: "Wear your dress",
    sub_headline: "Your dress arrives cleaned and ready to wear — enjoy your event.",
  },
  {
    headline: "Return your dress",
    sub_headline:
      "Use the prepaid return label and drop it at any Australia Post outlet.",
  },
];

function HowItWorks() {
  const { data: steps } = useSectionBanners("how_it_works");
  const cms = steps ?? [];

  return (
    <section className="bg-cream py-20 md:py-24">
      <div className="mx-auto max-w-[1400px] px-6 text-center">
        <p className="text-[10px] tracking-wider-display text-magenta">SIMPLE & SEAMLESS</p>
        <h2 className="mt-3 font-display text-4xl md:text-5xl">How It Works</h2>

        <div className="mt-14 grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-6">
          {HOW_IT_WORKS_STEPS.map((step, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            const image = cms[idx];
            return (
              <div key={step.headline} className="relative text-left">
                <p
                  className="font-serif italic text-4xl md:text-5xl leading-none"
                  style={{ color: "var(--rose)" }}
                >
                  {num}
                </p>
                <h3 className="mt-2 font-heading text-xl md:text-2xl">{step.headline}</h3>
                <div className="mt-4 aspect-square overflow-hidden rounded-xl bg-white">
                  {image?.image_url && (
                    <img
                      src={image.image_url}
                      alt=""
                      style={{ objectPosition: focusToObjectPosition(image.image_focus) }}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="mt-4 text-sm text-ink-muted">{step.sub_headline}</p>
              </div>
            );
          })}
        </div>

        <Link to="/faq" className="btn-outline mt-14">
          READ OUR FAQ'S
        </Link>
      </div>
    </section>
  );
}


/* ---------------- INSTAGRAM FEED ---------------- */

function InstagramFeed() {
  const { data: posts } = useQuery({
    queryKey: ["instagram_posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_posts" as any)
        .select("id, image_url, post_url, caption, position")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        image_url: string;
        post_url: string;
        caption: string | null;
        position: number;
      }>;
    },
  });
  const list = posts ?? [];

  return (
    <section className="bg-bg-tint py-20">
      <div className="mx-auto grid max-w-[1600px] gap-10 px-6 lg:grid-cols-[1fr_3fr] lg:items-center">
        <div>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-magenta">
            <Instagram className="h-6 w-6" />
          </span>
          <p className="mt-5 text-[10px] tracking-wider-display text-magenta">TAG US ON INSTAGRAM</p>
          <a
            href="https://www.instagram.com/_designerex/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <h2 className="mt-3 font-display text-4xl">#designerex</h2>
          </a>
          <p className="mt-3 max-w-xs text-sm text-ink-muted">
            Be featured and inspire others. Tag us in your moments.
          </p>
          <a
            href="https://www.instagram.com/_designerex/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-[11px] tracking-wider-display text-ink hover:text-pink"
          >
            @_designerex <Instagram className="h-3.5 w-3.5" />
          </a>
        </div>

        {list.length > 0 && (
          <div
            className="flex gap-3 overflow-x-auto pb-2 md:grid md:overflow-visible"
            style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
          >
            {list.map((post) => (
              <a
                key={post.id}
                href={post.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square w-40 flex-shrink-0 overflow-hidden rounded-sm bg-muted md:w-auto"
              >
                <img
                  src={post.image_url}
                  alt={post.caption ?? "Instagram post"}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-all group-hover:bg-ink/30 group-hover:opacity-100">
                  <Instagram className="h-6 w-6 text-white" />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

