import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VerifyEmailModal } from "@/components/auth/VerifyEmailPrompt";
import { useEmailVerified } from "@/hooks/useEmailVerified";
import { useQuery } from "@tanstack/react-query";
import { Heart, Star, Truck, MapPin, Zap, Clock, ChevronLeft, ChevronRight, Sparkles, ChevronDown, ShieldCheck, BellRing, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  addDays,
  eachDayOfInterval,
  format,
  formatDistanceToNow,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { recordDressView } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { shippingLabel as shippingLabelFor, shippingName } from "@/lib/shipping-labels";
import { Skeleton } from "@/components/ui/skeleton";
import { DressCard, type DressCardData } from "@/components/home/DressCard";
import { EnquiryModal } from "@/components/messaging/EnquiryModal";
import { UltraResponsiveBadge } from "@/components/UltraResponsiveBadge";
import { SuperLenderBadge } from "@/components/SuperLenderBadge";
import { useFeePreview } from "@/lib/fee-preview";
import { useTryOnForDress } from "@/lib/try-on";
import { formatTryOnWhen } from "@/components/dashboard/TryOnBadge";
import { fetchMySavedCheckout } from "@/lib/saved-checkout";
import { useDressSizes, fetchBlockedDatesForSize } from "@/lib/sizes";
import { SimpleSelect } from "@/components/ui/simple-select";



export const Route = createFileRoute("/dresses/$id")({
  ssr: false,
  component: DressDetailPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">{(error as Error)?.message ?? "Please try again."}</p>
        <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Dress not found</h1>
        <p className="mt-3 text-muted-foreground">This piece may have been removed.</p>
        <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
      </div>
    </AppShell>
  ),
});

type HireOption = "a" | "b" | "tryon";
type ShippingType = "standard" | "express" | "pickup" | "two_hour_uber";

function DressDetailPage() {
  const { id } = Route.useParams();
  const { user, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  useEffect(() => {
    console.log("[ProductDetail] mounted", { dressId: id });
    recordDressView(id, user?.id);
  }, [id, user?.id]);

  useEffect(() => {
    if (!id) return;
    supabase
      .rpc("increment_dress_visit_count", { p_dress_id: id })
      .then(({ error }) => {
        if (error) console.warn("Visit count increment failed:", error);
      });
  }, [id]);

  /* ---------- main fetch ---------- */
  const { data, isLoading, error } = useQuery({
    queryKey: ["dress", id],
    staleTime: 60_000,
    queryFn: async () => {
      console.time(`[ProductDetail] dresses ${id}`);
      const { data: dress, error: dErr } = await supabase
        .from("dresses")
        .select(`
          *,
          brand:brands!dresses_brand_id_fkey(id, name, slug),
          dress_type:dress_types!dresses_dress_type_id_fkey(id, name, slug),
          occasion:occasions!dresses_occasion_id_fkey(id, name, slug),
          size:sizes!dresses_size_id_fkey(id, name, slug),
          lender:profiles!dresses_lender_id_fkey(*),
          images:dress_images(url, position),
          colors:dress_colors(color:colors(id, name, slug, parent_color_id)),
          attributes:dress_attributes(attribute:attributes(category, name, slug)),
          shipping_options:dress_shipping_options(shipping_type, price, transit_days, is_enabled)
        `)
        .eq("id", id)
        .maybeSingle();
      console.timeEnd(`[ProductDetail] dresses ${id}`);
      if (dErr) throw dErr;
      return (dress ?? null) as any;
    },
  });

  /* ---------- sizes ---------- */
  const { data: dressSizes = [] } = useDressSizes(id);
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  useEffect(() => {
    if (dressSizes.length === 0) return;
    setSelectedSizeId((prev) => (prev && dressSizes.some((s) => s.id === prev) ? prev : (dressSizes.length === 1 ? dressSizes[0].id : null)));
  }, [dressSizes]);
  const sizeRequired = dressSizes.length > 0;
  const sizeMissing = sizeRequired && !selectedSizeId;

  /* ---------- availability (scoped to the chosen size) ---------- */
  const lenderId = data?.lender?.id as string | undefined;
  const { data: blockers } = useQuery({
    queryKey: ["dress-availability", id, lenderId, selectedSizeId],
    enabled: !!data,
    staleTime: 30_000,
    queryFn: async () => {
      const iso = await fetchBlockedDatesForSize(id, selectedSizeId);
      return iso.map((s) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      });
    },
  });


  /* ---------- reviews ---------- */
  const { data: reviews } = useQuery({
    queryKey: ["lender-reviews", lenderId],
    enabled: !!lenderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("reviews")
        .select("id, rating, public_review, created_at, reviewer_id")
        .eq("reviewee_id", lenderId)
        .order("created_at", { ascending: false })
        .limit(5);
      const reviewerIds = [...new Set((rows ?? []).map((r: any) => r.reviewer_id).filter(Boolean))];
      const { data: reviewers } = reviewerIds.length
        ? await supabase.from("profiles").select("id, first_name").in("id", reviewerIds)
        : { data: [] as any[] };
      const map = new Map((reviewers ?? []).map((p: any) => [p.id, p.first_name]));
      return (rows ?? []).map((r: any) => ({ ...r, reviewer_name: map.get(r.reviewer_id) ?? "Anonymous" }));
    },
  });

  /* ---------- similar dresses ---------- */
  const { data: similar } = useQuery({
    queryKey: ["similar-dresses", id],
    enabled: !!data,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const later = addDays(new Date(), 30).toISOString().slice(0, 10);
      const { data: rows } = await supabase.rpc("get_similar_dresses", {
        p_dress_id: id,
        p_start_date: today,
        p_end_date: later,
        p_limit: 10,
      });
      const ids = (rows ?? []).map((r: any) => r.id ?? r.dress_id).filter(Boolean);
      if (!ids.length) return [] as DressCardData[];
      const { data: dresses } = await supabase
        .from("dresses")
        .select("id, title, advertised_hire_a, lender_id, brand_id, size_id")
        .in("id", ids);
      const brandIds = [...new Set((dresses ?? []).map((d: any) => d.brand_id).filter(Boolean))];
      const sIds = [...new Set((dresses ?? []).map((d: any) => d.size_id).filter(Boolean))];
      const [brandsRes, sizesRes, imagesRes, lendersRes] = await Promise.all([
        brandIds.length ? supabase.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] as any[] }),
        sIds.length ? supabase.from("sizes").select("id, name").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from("dress_images").select("dress_id, url, position").in("dress_id", ids),
        supabase.from("profiles").select("id, hire_period_a_days, is_ultra_responsive, is_super_lender").in("id", [...new Set((dresses ?? []).map((d: any) => d.lender_id))]),
      ]);
      const bMap = new Map((brandsRes.data ?? []).map((b: any) => [b.id, b.name]));
      const sMap = new Map((sizesRes.data ?? []).map((s: any) => [s.id, s.name]));
      const lMap = new Map((lendersRes.data ?? []).map((l: any) => [l.id, l]));
      const iMap = new Map<string, { url: string; position: number }[]>();
      for (const img of imagesRes.data ?? []) {
        const arr = iMap.get(img.dress_id) ?? [];
        arr.push({ url: img.url, position: img.position ?? 0 });
        iMap.set(img.dress_id, arr);
      }
      return ids
        .map((rid: string) => (dresses ?? []).find((d: any) => d.id === rid))
        .filter(Boolean)
        .map((d: any): DressCardData => {
          const imgs = (iMap.get(d.id) ?? []).sort((a, b) => a.position - b.position);
          const lender: any = lMap.get(d.lender_id);
          return {
            id: d.id,
            title: d.title,
            advertised_hire_a: d.advertised_hire_a,
            lender_id: d.lender_id,
            brand_name: bMap.get(d.brand_id) ?? null,
            size_name: sMap.get(d.size_id) ?? null,
            image_url: imgs[0]?.url ?? null,
            hire_days: lender?.hire_period_a_days ?? null,
            lender_is_ultra_responsive: !!lender?.is_ultra_responsive,
            lender_is_super_lender: !!lender?.is_super_lender,
          };
        });
    },
  });

  /* ---------- saved ---------- */
  const { data: savedSet, refetch: refetchSaved } = useQuery({
    queryKey: ["saved-dress-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase.from("saved_dresses").select("dress_id").eq("user_id", user!.id);
      return new Set((rows ?? []).map((r: any) => r.dress_id));
    },
  });
  const isSaved = !!(savedSet && savedSet.has(id));
  const toggleSave = async () => {
    if (!user) return openAuthModal("login");
    if (isSaved) await supabase.from("saved_dresses").delete().eq("user_id", user.id).eq("dress_id", id);
    else await supabase.from("saved_dresses").insert({ user_id: user.id, dress_id: id });
    refetchSaved();
  };

  /* ---------- ui state ---------- */
  const [imgIdx, setImgIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [hireOption, setHireOption] = useState<HireOption>("a");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [unavailableRange, setUnavailableRange] = useState<{ start: Date; end: Date } | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [tryOnDate, setTryOnDate] = useState<Date | undefined>();
  const [tryOnPeriod, setTryOnPeriod] = useState<"am" | "pm" | null>(null);
  const [periodStepOpen, setPeriodStepOpen] = useState(false);
  const [showTryOnAddress, setShowTryOnAddress] = useState(false);
  const { data: tryOn } = useTryOnForDress(id, !!user);
  const [shippingType, setShippingType] = useState<ShippingType>("standard");
  const restoredCheckoutRef = useRef<string | null>(null);

  const { data: savedCheckout } = useQuery({
    queryKey: ["my-saved-checkout", user?.id],
    enabled: !!user,
    queryFn: fetchMySavedCheckout,
    staleTime: 30_000,
  });
  const savedCheckoutForDress = savedCheckout?.dressId === id ? savedCheckout : null;

  useEffect(() => {
    if (!savedCheckoutForDress) return;
    const restoreKey = savedCheckoutForDress.reservationId ?? `${savedCheckoutForDress.dressId}:${savedCheckoutForDress.start}`;
    if (restoredCheckoutRef.current === restoreKey) return;
    restoredCheckoutRef.current = restoreKey;
    setHireOption(savedCheckoutForDress.hireOption);
    if (savedCheckoutForDress.hireOption === "tryon") {
      setTryOnDate(parseISO(savedCheckoutForDress.start));
      setTryOnPeriod(savedCheckoutForDress.tryOnPeriod);
      setShippingType("pickup");
    } else {
      setStartDate(parseISO(savedCheckoutForDress.start));
      if (savedCheckoutForDress.shippingOption) setShippingType(savedCheckoutForDress.shippingOption);
    }
  }, [savedCheckoutForDress]);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const { verified: emailVerified } = useEmailVerified();

  const images = useMemo(() => {
    const imgs = (data?.images ?? []) as { url: string; position: number }[];
    return [...imgs].sort((a, b) => a.position - b.position);
  }, [data]);

  const hireDaysA = (data?.lender?.hire_period_a_days as number | undefined) ?? 4;
  const hireDaysB = (data?.lender?.hire_period_b_days as number | undefined) ?? 8;
  const hireDays = hireOption === "a" ? hireDaysA : hireOption === "b" ? hireDaysB : 0;

  const shippingOptions = useMemo(() => {
    const so = (data?.shipping_options ?? []) as any[];
    return so.filter((s) => s.is_enabled !== false);
  }, [data]);

  // Default shipping to first available
  useEffect(() => {
    if (shippingOptions.length && !shippingOptions.find((s) => s.shipping_type === shippingType)) {
      setShippingType(shippingOptions[0].shipping_type as ShippingType);
    }
  }, [shippingOptions, shippingType]);

  /* ---------- pricing ---------- */
  const hirePrice = useMemo(() => {
    if (!data) return 0;
    if (hireOption === "a") return Number(data.hire_price_a ?? 0);
    if (hireOption === "b") return Number(data.hire_price_b ?? 0);
    return Number(data.try_on_price ?? 0);
  }, [data, hireOption]);
  const advertisedPrice = useMemo(() => {
    if (!data) return 0;
    if (hireOption === "a") return Number((data as any).advertised_hire_a ?? data.hire_price_a ?? 0);
    if (hireOption === "b") return Number((data as any).advertised_hire_b ?? data.hire_price_b ?? 0);
    return Number(data.try_on_price ?? 0);
  }, [data, hireOption]);
  const shippingPrice = useMemo(() => {
    if (shippingType === "pickup") return 0;
    const opt = shippingOptions.find((s) => s.shipping_type === shippingType);
    return Number(opt?.price ?? 0);
  }, [shippingOptions, shippingType]);
  const cleaningFee = Number((data as any)?.cleaning_fee ?? 0);
  const isTwoHour = shippingType === "two_hour_uber";
  const twoHourFee = isTwoHour ? shippingPrice : 0;
  const shippingOnly = isTwoHour ? 0 : shippingPrice;
  const feePreview = useFeePreview(hirePrice, cleaningFee, shippingOnly, twoHourFee);
  // Renter-facing total is always renter_total from dx_fee_preview — never a hand-computed sum,
  // and never service_fee_base / lender_commission / tier_rate (those are internal figures).
  const total = feePreview?.renter_total ?? null;



  /* ---------- date validation ---------- */
  const disabledDays = useMemo(() => blockers ?? [], [blockers]);
  const minDate = useMemo(() => addDays(startOfDay(new Date()), 2), []);
  const maxDate = useMemo(() => addDays(startOfDay(new Date()), 90), []);
  const isDayDisabled = useCallback((d: Date) => {
    const day = startOfDay(d);
    if (isBefore(day, minDate)) return true;
    if (isAfter(day, maxDate)) return true;
    return disabledDays.some((x) => isSameDay(x, day));
  }, [disabledDays, minDate, maxDate]);
  const rangeHasConflict = useCallback((from: Date, days: number) => {
    const to = addDays(from, days - 1);
    return eachDayOfInterval({ start: from, end: to }).some((d) =>
      disabledDays.some((x) => isSameDay(x, d)) || isAfter(startOfDay(d), maxDate)
    );
  }, [disabledDays, maxDate]);

  const endDate = useMemo(() => {
    if (hireOption === "tryon" || !startDate || !hireDays) return undefined;
    return addDays(startDate, hireDays - 1);
  }, [startDate, hireDays, hireOption]);

  // When hire option changes, re-validate the locked range
  useEffect(() => {
    if (hireOption === "tryon" || !startDate || !hireDays) return;
    if (rangeHasConflict(startDate, hireDays)) {
      setStartDate(undefined);
      setRangeError("This date doesn't work — part of your hire would overlap an unavailable day. Pick a new start date.");
    } else {
      setRangeError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hireOption, hireDays]);

  // Changing size re-checks the chosen dates against that size's availability.
  useEffect(() => {
    if (!selectedSizeId) return;
    if (hireOption === "tryon") {
      if (tryOnDate && isDayDisabled(tryOnDate)) {
        setTryOnDate(undefined);
        setTryOnPeriod(null);
        setRangeError("Those dates aren't available in this size. Please pick a new date.");
      }
      return;
    }
    if (startDate && hireDays && rangeHasConflict(startDate, hireDays)) {
      setStartDate(undefined);
      setRangeError("Those dates aren't available in this size. Please pick new dates.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSizeId, blockers]);



  const handlePickStart = (d: Date | undefined) => {
    if (!d || !hireDays) {
      setStartDate(undefined);
      setRangeError(null);
      setUnavailableRange(null);
      return;
    }
    if (rangeHasConflict(d, hireDays)) {
      setStartDate(undefined);
      setUnavailableRange({ start: d, end: addDays(d, hireDays - 1) });
      setRangeError("Those dates aren't available — but you can ask us to notify you if they free up.");
      return;
    }
    setStartDate(d);
    setRangeError(null);
    setUnavailableRange(null);
  };

  const handleNotifyWhenAvailable = async () => {
    if (!unavailableRange) return;
    if (!user) {
      openAuthModal("login", `/dresses/${id}`);
      return;
    }
    setNotifyLoading(true);
    const { error: insErr } = await supabase
      .from("availability_alerts")
      .insert({
        user_id: user.id,
        dress_id: id,
        desired_start: format(unavailableRange.start, "yyyy-MM-dd"),
        desired_end: format(unavailableRange.end, "yyyy-MM-dd"),
      } as any);
    setNotifyLoading(false);
    if (insErr) {
      // 23505 = unique violation → already on the list
      if ((insErr as any).code === "23505") {
        toast.success("You're already on the list.");
        return;
      }
      toast.error(insErr.message ?? "Couldn't save your alert.");
      return;
    }
    toast.success("We'll let you know when it's free for those dates.");
  };

  const rangeModifiers = useMemo(() => {
    if (!startDate || !endDate) return undefined;
    const all = eachDayOfInterval({ start: startDate, end: endDate });
    return {
      range_start: startDate,
      range_end: endDate,
      range_middle: all.slice(1, -1),
    };
  }, [startDate, endDate]);

  /* ---------- date requirement ---------- */
  const datesMissing = hireOption === "tryon" ? !tryOnDate : !startDate || !endDate;
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [flashDates, setFlashDates] = useState(false);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const promptForDates = useCallback(() => {
    // Desktop: open the in-panel picker. Everywhere: reveal + highlight the full calendar.
    setDatePopoverOpen(true);
    datePickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashDates(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashDates(false), 1800);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const dateFieldLabel = hireOption === "tryon"
    ? (tryOnDate ? formatTryOnWhen(format(tryOnDate, "EEE d MMM"), tryOnPeriod) : "Select a date")
    : (startDate && endDate ? `${format(startDate, "d MMM")} – ${format(endDate, "d MMM")}` : "Select dates");

  /* ---------- CTA ---------- */


  const sizeSelectRef = useRef<HTMLDivElement | null>(null);
  const promptForSize = useCallback(() => {
    sizeSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    toast.error("Choose a size first.");
  }, []);

  const startTryOnBooking = useCallback(() => {
    if (sizeMissing) { promptForSize(); return; }
    if (!user) {
      openAuthModal("login", `/dresses/${id}`);
      return;
    }
    if (!emailVerified) {
      setVerifyOpen(true);
      return;
    }
    if (!tryOnDate) return;
    setPeriodStepOpen(true);
  }, [user, emailVerified, tryOnDate, openAuthModal, id, sizeMissing, promptForSize]);

  const handleBook = useCallback(() => {
    if (hireOption === "tryon") {
      startTryOnBooking();
      return;
    }
    if (sizeMissing) { promptForSize(); return; }
    if (!user) {
      openAuthModal("login", `/dresses/${id}`);
      return;
    }
    if (!emailVerified) {
      setVerifyOpen(true);
      return;
    }
    if (!startDate || !endDate) return;
    navigate({
      to: "/checkout",
      search: {
        dress_id: id,
        from: format(startDate, "yyyy-MM-dd"),
        to: format(endDate, "yyyy-MM-dd"),
        hire_option: hireOption,
        shipping_option: shippingType,
        size_id: selectedSizeId ?? undefined,
      } as any,
    });
  }, [hireOption, startTryOnBooking, user, emailVerified, startDate, endDate, navigate, id, shippingType, openAuthModal, selectedSizeId, sizeMissing, promptForSize]);

  const resumeSavedCheckout = useCallback(() => {
    if (!savedCheckoutForDress) return;
    if (savedCheckoutForDress.hireOption === "tryon") {
      if (!savedCheckoutForDress.tryOnPeriod) {
        setPeriodStepOpen(true);
        return;
      }
      navigate({
        to: "/checkout",
        search: {
          dress_id: id,
          tryon_date: savedCheckoutForDress.start,
          tryon_period: savedCheckoutForDress.tryOnPeriod,
          hire_option: "try_on",
          size_id: selectedSizeId ?? undefined,
        } as any,
      });
      return;
    }
    navigate({
      to: "/checkout",
      search: {
        dress_id: id,
        from: savedCheckoutForDress.start,
        to: savedCheckoutForDress.end,
        hire_option: savedCheckoutForDress.hireOption,
        shipping_option: savedCheckoutForDress.shippingOption ?? shippingType,
        size_id: selectedSizeId ?? undefined,
      } as any,
    });
  }, [savedCheckoutForDress, navigate, id, shippingType, selectedSizeId]);

  // (per-render log removed for perf — was firing 8+ times)
  if (isLoading) return <DressDetailSkeleton />;
  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="font-display text-3xl">Couldn't load this dress</h1>
          <p className="mt-3 text-muted-foreground">{(error as Error)?.message ?? "Please try again."}</p>
          <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
        </div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="font-display text-3xl">Dress not available</h1>
          <p className="mt-3 text-muted-foreground">
            This piece isn't currently visible — it may have been removed, archived, or the lender has paused their listings.
          </p>
          <Link to="/browse" className="mt-6 inline-block text-pink underline">Back to browse</Link>
        </div>
      </AppShell>
    );
  }

  const lender = data.lender as any;
  const inactive = data.status && data.status !== "active";

  const colorNames: string[] = (data.colors ?? [])
    .map(({ color: c }: any) => c?.name)
    .filter(Boolean);

  const hireOptionRows: { key: HireOption; label: string; price: number }[] = [
    { key: "a" as HireOption, label: `${hireDaysA} Day Hire`, price: Number((data as any).advertised_hire_a ?? data.hire_price_a ?? 0), visible: true },
    { key: "b" as HireOption, label: `${hireDaysB} Day Hire`, price: Number((data as any).advertised_hire_b ?? data.hire_price_b ?? 0), visible: Number(data.hire_price_b ?? 0) > 0 },
  ].filter((o) => o.visible).map(({ visible: _v, ...rest }) => rest);


  const shippingLabel = (s: any): string => shippingLabelFor(s.shipping_type, s.price);

  return (
    <AppShell>
      {inactive && (
        <div className="bg-muted py-3 text-center text-sm">
          This dress is no longer available.{" "}
          <Link to="/browse" className="text-magenta underline">Browse all dresses</Link>
        </div>
      )}

      <div className="mx-auto max-w-[1500px] px-4 pb-32 pt-6 lg:px-8 lg:pb-16">
        {/* breadcrumb */}
        <nav className="mb-6 text-xs text-ink-muted">
          <Link to="/browse" className="hover:text-ink">Browse</Link>
          {data.brand && (
            <>
              {" / "}
              <Link to="/designers/$slug" params={{ slug: data.brand.slug }} className="hover:text-ink">
                {data.brand.name}
              </Link>
            </>
          )}
          {" / "}<span className="text-ink">{data.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          {/* ---------- LEFT COLUMN ---------- */}
          <div className="lg:col-span-7">
            {/* Title block */}
            <h1 className="font-display text-4xl leading-[1.05] md:text-5xl">{data.title}</h1>
            <p className="mt-2 text-[11px] tracking-wider-display text-ink-muted">
              {[
                data.brand?.name?.toUpperCase(),
                data.size?.name ? `SIZE ${data.size.name}` : null,
                colorNames.length ? `COLOUR: ${colorNames.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join("  |  ")}
            </p>

            {/* Gallery */}
            <div className="mt-6">
              <div className="relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-lg bg-muted"
                onClick={() => setLightbox(true)}
              >
                {images[imgIdx] ? (
                  <img src={images[imgIdx].url} alt={data.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-ink-muted">No image</div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleSave(); }}
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur hover:bg-white"
                  aria-label={isSaved ? "Unsave" : "Save"}
                >
                  <Heart className={cn("h-5 w-5", isSaved ? "fill-magenta text-magenta" : "text-ink/70")} />
                </button>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgIdx((i) => (i - 1 + images.length) % images.length); }}
                      className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 backdrop-blur hover:bg-white"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgIdx((i) => (i + 1) % images.length); }}
                      className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 backdrop-blur hover:bg-white"
                      aria-label="Next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumb strip */}
              {images.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <button
                      key={`${i}-${img.url}`}
                      onClick={() => setImgIdx(i)}
                      className={cn(
                        "h-20 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                        i === imgIdx ? "border-ink" : "border-transparent opacity-70 hover:opacity-100",
                      )}
                    >
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar */}
            <div
              id="select-dates"
              ref={datePickerRef}
              className={cn(
                "mt-10 scroll-mt-24 rounded-lg border bg-surface p-5 transition-shadow duration-300",
                flashDates ? "border-magenta shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-magenta)_20%,transparent)]" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-xl">Select your dates</h2>
                <div className="flex items-center gap-4 text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full bg-magenta/80" />
                    Unavailable
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: "var(--success-ink)" }} />
                    Available
                  </span>
                </div>
              </div>

              {sizeMissing ? (
                <p className="mt-4 text-sm text-ink-muted">
                  Choose a size above to see which dates are available.
                </p>
              ) : hireOption === "tryon" ? (
                <>
                  <Calendar
                    mode="single"
                    selected={tryOnDate}
                    onSelect={(d) => { setTryOnDate(d); setTryOnPeriod(null); }}
                    disabled={isDayDisabled}
                    className="pointer-events-auto mx-auto mt-4"
                  />
                  {tryOnDate && (
                    <p className="mt-3 text-sm">
                      <span className="text-ink-muted">Try-on:&nbsp;</span>
                      <span className="font-medium text-ink">
                        {formatTryOnWhen(format(tryOnDate, "EEE d MMM"), tryOnPeriod)}
                      </span>
                      <span className="ml-2 text-ink">— ${hirePrice.toFixed(2)}</span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={handlePickStart}
                    disabled={isDayDisabled}
                    modifiers={rangeModifiers}
                    numberOfMonths={1}
                    className="pointer-events-auto mx-auto mt-4"
                  />
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                    <p className="font-heading text-base">
                      {hireDays} day hire — <span className="text-magenta">${advertisedPrice.toFixed(2)}</span>
                    </p>
                    {startDate && endDate && (
                      <p className="text-xs text-ink-muted">
                        {format(startDate, "d MMM")} – {format(endDate, "d MMM")}
                      </p>
                    )}
                  </div>
                  {rangeError && (
                    <p className="mt-2 text-xs text-destructive">{rangeError}</p>
                  )}
                </>
              )}
            </div>

            {/* Tabs */}
            <div id="details" className="mt-12 scroll-mt-24">
              <Tabs defaultValue="details">
                <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
                  {[
                    { v: "details", l: "Details" },
                    { v: "size", l: "Size & Fit" },
                    { v: "delivery", l: "Delivery" },
                    { v: "reviews", l: `Reviews${reviews?.length ? ` (${reviews.length})` : ""}` },
                  ].map((t) => (
                    <TabsTrigger
                      key={t.v}
                      value={t.v}
                      className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-sm text-ink-muted shadow-none data-[state=active]:border-magenta data-[state=active]:bg-transparent data-[state=active]:text-magenta data-[state=active]:shadow-none"
                    >
                      {t.l}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="details" className="mt-6">
                  {data.description && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{data.description}</p>
                  )}
                  <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                    {data.brand && (
                      <DetailRow label="Designer">
                        <Link to="/designers/$slug" params={{ slug: data.brand.slug }} className="text-magenta hover:underline">
                          {data.brand.name}
                        </Link>
                      </DetailRow>
                    )}
                    {data.dress_type && (
                      <DetailRow label="Type">
                        <Link to="/browse" search={{ type: data.dress_type.slug } as any} className="text-magenta hover:underline">
                          {data.dress_type.name}
                        </Link>
                      </DetailRow>
                    )}
                    {data.occasion && (
                      <DetailRow label="Occasion">
                        <Link to="/occasions/$slug" params={{ slug: data.occasion.slug }} className="text-magenta hover:underline">
                          {data.occasion.name}
                        </Link>
                      </DetailRow>
                    )}
                    {data.fabric && <DetailRow label="Fabric">{data.fabric}</DetailRow>}
                    <DetailRow label="Cleaning">
                      {cleaningFee > 0 ? "Cleaning included" : "Free cleaning"}
                    </DetailRow>
                  </dl>
                  {data.attributes && data.attributes.length > 0 && (
                    <div className="mt-8">
                      <h3 className="font-heading text-lg">Style</h3>
                      {Object.entries(
                        (data.attributes as any[]).reduce((acc: Record<string, string[]>, a) => {
                          const cat = a.attribute?.category ?? "Other";
                          const name = a.attribute?.name;
                          if (!name) return acc;
                          (acc[cat] ??= []).push(name);
                          return acc;
                        }, {})
                      ).map(([cat, names]) => (
                        <div key={cat} className="mt-3">
                          <p className="text-[11px] tracking-wider-display text-ink-muted">{cat.toUpperCase()}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(names as string[]).map((n) => (
                              <span key={n} className="rounded-full bg-bg-tint px-2.5 py-1 text-xs">
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="size" className="mt-6">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                    {data.size?.name && <DetailRow label="Size">{data.size.name}</DetailRow>}
                    {data.fit && <DetailRow label="Fit">{data.fit}</DetailRow>}
                    {data.has_cup_support != null && <DetailRow label="Cup support">{data.has_cup_support ? "Yes" : "No"}</DetailRow>}
                    {data.has_adjustable_straps != null && <DetailRow label="Adjustable straps">{data.has_adjustable_straps ? "Yes" : "No"}</DetailRow>}
                    {data.has_stretch != null && <DetailRow label="Has stretch">{data.has_stretch ? "Yes" : "No"}</DetailRow>}
                  </dl>
                  {data.measurements && typeof data.measurements === "object" && (
                    <div className="mt-6">
                      <h3 className="font-heading text-lg">Measurements</h3>
                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
                        {Object.entries(data.measurements).map(([k, v]) =>
                          v ? <DetailRow key={k} label={k.replace(/_/g, " ")}>{String(v)}</DetailRow> : null
                        )}
                      </dl>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="delivery" className="mt-6">
                  {shippingOptions.length > 0 ? (
                    <div className="space-y-2">
                      {shippingOptions.map((s: any) => (
                        <ShippingOptionRow
                          key={s.shipping_type}
                          option={s}
                          lenderCity={lender?.location}
                          active={shippingType === s.shipping_type}
                          onClick={() => setShippingType(s.shipping_type)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">Delivery options will be confirmed at checkout.</p>
                  )}
                </TabsContent>

                <TabsContent value="reviews" className="mt-6">
                  {reviews && reviews.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {reviews.map((r: any) => (
                        <div key={r.id} className="rounded-lg border border-border bg-surface p-5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{r.reviewer_name}</span>
                            <span className="text-xs text-ink-muted">
                              {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="mt-1 flex gap-0.5">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-current text-ink" : "text-muted")} />
                            ))}
                          </div>
                          {r.public_review && <p className="mt-2 text-sm leading-relaxed text-ink/80">{r.public_review}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">No reviews yet — be the first!</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Similar styles */}
            <section className="mt-14">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-xl md:text-2xl">Similar styles</h2>
                <button
                  type="button"
                  onClick={() => {
                    const colorSlugs: string[] = (data.colors ?? [])
                      .map(({ color: c }: any) => c?.slug)
                      .filter(Boolean);
                    const next: Record<string, unknown> = { exclude: id };
                    if (colorSlugs.length) next.color = colorSlugs.join(",");
                    if (hireOption !== "tryon" && startDate && endDate) {
                      next.start = format(startDate, "yyyy-MM-dd");
                      next.end = format(endDate, "yyyy-MM-dd");
                    }
                    navigate({ to: "/browse", search: next as never });
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-ink bg-ink px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-magenta hover:border-magenta"
                >
                  <Sparkles className="h-4 w-4" />
                  Similar dresses
                </button>
              </div>
              {similar && similar.length > 0 && (
                <div className="mt-5 flex gap-5 overflow-x-auto pb-4 [&>*]:w-56 [&>*]:flex-shrink-0">
                  {(similar as DressCardData[]).map((d) => (
                    <DressCard key={d.id} dress={d} saved={!!savedSet?.has(d.id)} />
                  ))}
                </div>
              )}
            </section>

          </div>

          {/* ---------- RIGHT RAIL ---------- */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_8px_24px_rgba(20,20,20,0.06)]">
                {/* Lender block */}
                {lender && (
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                        {lender.avatar_url ? (
                          <img src={lender.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm">
                            {(lender.first_name ?? "L")[0]}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-heading text-lg leading-tight">{lender.first_name}</p>
                        {lender.location && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                            <MapPin className="h-3 w-3" />
                            {lender.location}
                          </p>
                        )}
                      </div>
                    </div>
                    <Link
                      to="/lenders/$lenderId"
                      params={{ lenderId: lender.id }}
                      className="mt-3 inline-flex items-center gap-1 text-xs text-magenta hover:underline"
                    >
                      Browse more of {lender.first_name}'s collection →
                    </Link>
                  </div>
                )}

                {/* Badges */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="badge-success inline-flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Availability Verified
                  </span>
                  <UltraResponsiveBadge active={lender?.is_ultra_responsive} />
                  <SuperLenderBadge active={lender?.is_super_lender} />
                  {lender?.is_top_rated && (
                    <span className="inline-flex items-center rounded-full bg-bg-tint px-2.5 py-0.5 text-xs font-medium text-ink">
                      Top Rated Lender
                    </span>
                  )}
                  {lender?.response_rate != null && (
                    <span className="inline-flex items-center rounded-full bg-bg-tint px-2.5 py-0.5 text-xs font-medium text-ink">
                      Response rate {Number(lender.response_rate).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Info row */}
                <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 text-magenta" />
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {cleaningFee > 0 ? "Cleaning included" : "Free cleaning"}
                      </p>
                      <p className="text-xs text-ink-muted">We take care of it</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 text-magenta" />
                    <div>
                      <p className="text-sm font-medium text-ink">{hireDaysA} day hire period</p>
                      <p className="text-xs text-ink-muted">Standard hire</p>
                    </div>
                  </div>
                </div>

                {/* Rent now dropdown */}
                <div className="mt-6">
                  <label className="text-[11px] font-medium uppercase tracking-wider-display text-ink-muted">
                    Rent now:
                  </label>
                  <div className="relative mt-2">
                    <SimpleSelect
                      value={hireOption}
                      onValueChange={(v) => setHireOption(v as HireOption)}
                      aria-label="Rent now"
                      className="w-full rounded-md border-border bg-white px-3 py-2.5 text-sm focus:border-magenta"
                      options={hireOptionRows.map((o) => ({
                        value: o.key,
                        label: `${o.label} ($${o.price.toFixed(0)})`,
                      }))}
                    />
                  </div>
                </div>

                {/* Delivery dropdown */}
                {hireOption !== "tryon" && shippingOptions.length > 0 && (
                  <div className="mt-4">
                    {savedCheckoutForDress && (
                      <button
                        type="button"
                        onClick={resumeSavedCheckout}
                        className="mb-4 w-full rounded-md border border-magenta/40 bg-magenta/5 px-4 py-3 text-sm font-medium text-magenta hover:bg-magenta/10"
                      >
                        Pick up where you left off
                      </button>
                    )}
                    <label className="text-[11px] font-medium uppercase tracking-wider-display text-ink-muted">
                      Delivery / Collection:
                    </label>
                    <div className="relative mt-2">
                      <SimpleSelect
                        value={shippingType}
                        onValueChange={(v) => setShippingType(v as ShippingType)}
                        aria-label="Delivery or collection"
                        className="w-full rounded-md border-border bg-white px-3 py-2.5 text-sm focus:border-magenta"
                        options={shippingOptions.map((s: any) => ({
                          value: s.shipping_type,
                          label: shippingLabel(s),
                        }))}
                      />
                    </div>
                  </div>
                )}

                {/* Size — must be chosen before dates */}
                {dressSizes.length > 0 && (
                  <div className="mt-4" ref={sizeSelectRef}>
                    <label className="text-[11px] font-medium uppercase tracking-wider-display text-ink-muted">
                      Size:
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dressSizes.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedSizeId(s.id)}
                          aria-pressed={selectedSizeId === s.id}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm transition-colors",
                            selectedSizeId === s.id
                              ? "border-magenta bg-magenta text-white"
                              : "border-border bg-white text-ink hover:border-magenta",
                          )}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                    {sizeMissing && (
                      <p className="mt-1.5 text-xs text-ink-muted">Choose a size to see availability.</p>
                    )}
                  </div>
                )}

                {/* Dates */}
                <div className="mt-4">
                  <label className="text-[11px] font-medium uppercase tracking-wider-display text-ink-muted">
                    {hireOption === "tryon" ? "Try-on date:" : "Hire dates:"}
                  </label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "mt-2 flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-magenta",
                          datesMissing ? "border-magenta/60 text-ink-muted" : "border-border text-ink",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-magenta" />
                          {dateFieldLabel}
                        </span>
                        <ChevronDown className="h-4 w-4 text-ink-muted" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      {hireOption === "tryon" ? (
                        <div className="p-2">
                          <Calendar
                            mode="single"
                            selected={tryOnDate}
                            onSelect={(d) => { setTryOnDate(d); setTryOnPeriod(null); if (d) setDatePopoverOpen(false); }}
                            disabled={isDayDisabled}
                            className="pointer-events-auto p-3"
                          />
                        </div>
                      ) : (
                        <div className="p-2">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={(d) => { handlePickStart(d); if (d) setDatePopoverOpen(false); }}
                            disabled={isDayDisabled}
                            modifiers={rangeModifiers}
                            className="pointer-events-auto p-3"
                          />
                          <p className="px-3 pb-2 text-xs text-ink-muted">
                            Pick a start date — your {hireDays} day hire is set automatically.
                          </p>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {datesMissing && (
                    <p className="mt-1.5 text-xs text-ink-muted">Choose your dates to see the final total.</p>
                  )}
                </div>

                {/* Total — indicative until dates are chosen */}
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-sm text-ink-muted">{datesMissing ? "Indicative total" : "Total"}</span>
                  <span className={cn("font-display text-2xl", datesMissing && "text-ink-muted")}>
                    {total != null ? `${datesMissing ? "from " : ""}$${total.toFixed(2)}` : "—"}
                  </span>
                </div>


                {/* Refundable security deposit (hold, not charged) */}
                {data.requires_deposit && Number(data.deposit_amount) > 0 && (
                  <div className="mt-3 rounded-md border border-dashed border-border bg-bg-tint p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink">Refundable security deposit</span>
                      <span className="font-medium text-ink">${Number(data.deposit_amount).toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      Held on your card, not charged. Released after the dress is returned in good condition.
                    </p>
                  </div>
                )}

                {/* Checkout / Notify button */}
                {hireOption !== "tryon" && unavailableRange && !startDate ? (
                  <button
                    onClick={handleNotifyWhenAvailable}
                    disabled={notifyLoading}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-magenta bg-white py-3.5 text-sm font-medium text-magenta tracking-wider-display hover:bg-magenta/5 disabled:opacity-50"
                  >
                    <BellRing className="h-4 w-4" />
                    {notifyLoading ? "SAVING…" : "NOTIFY ME WHEN AVAILABLE"}
                  </button>
                ) : (
                  <button
                    onClick={datesMissing ? promptForDates : handleBook}
                    disabled={inactive}
                    aria-disabled={datesMissing || undefined}
                    className={cn(
                      "btn-primary mt-4 w-full py-3.5 text-sm tracking-wider-display disabled:opacity-40",
                      datesMissing && "opacity-50",
                    )}
                  >
                    {datesMissing
                      ? (hireOption === "tryon" ? "SELECT A DATE TO CONTINUE" : "SELECT DATES TO CONTINUE")
                      : "CHECKOUT"}
                  </button>
                )}

                {/* Scroll to details */}
                <a
                  href="#details"
                  className="mt-3 flex items-center justify-center gap-1 text-xs text-ink-muted hover:text-ink"
                >
                  For details, scroll down
                  <ChevronDown className="h-3.5 w-3.5" />
                </a>

                {/* Ask the lender */}
                {data.lender && data.lender.id !== user?.id && (
                  <button
                    onClick={() => {
                      if (!user) { openAuthModal("login"); return; }
                      setEnquiryOpen(true);
                    }}
                    className="mt-3 hidden w-full rounded-full border border-border bg-white py-2.5 text-xs font-medium text-ink hover:bg-bg-tint lg:block"
                  >
                    Ask the lender a question
                  </button>
                )}
              </div>

              {/* ---------- TRY IT ON FIRST ---------- */}
              {tryOn?.try_on_offered && (
                <div className="mt-5 rounded-xl border-2 border-dashed border-magenta/40 bg-bg-tint p-6">
                  <p className="text-[11px] font-medium uppercase tracking-wider-display text-magenta">
                    Try it on first
                  </p>

                  <p className="mt-3 font-heading text-lg text-ink">
                    Try-on — ${tryOn.try_on_price.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Renter pays ${tryOn.renter_total.toFixed(2)} including a $
                    {tryOn.renter_service_fee.toFixed(2)} service fee
                  </p>
                  <p className="mt-2 text-xs text-ink-muted">
                    In-person try-on, one day, collected from the lender.
                  </p>

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="flex items-center gap-1.5 text-sm text-ink">
                      <MapPin className="h-4 w-4 text-magenta" />
                      Pickup: {tryOn.try_on_location ?? "Address provided by the lender"}
                    </p>
                    {user ? (
                      showTryOnAddress ? (
                        <p className="mt-2 text-sm text-ink-muted">
                          {tryOn.try_on_address ?? "Address unavailable."}
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowTryOnAddress(true)}
                          className="mt-2 text-xs text-magenta hover:underline"
                        >
                          Show full address
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAuthModal("login", `/dresses/${id}`)}
                        className="mt-2 text-xs text-magenta hover:underline"
                      >
                        Sign in to see the pickup address
                      </button>
                    )}
                  </div>

                  <div className="mt-4">
                    <label className="text-[11px] font-medium uppercase tracking-wider-display text-ink-muted">
                      Try-on date:
                    </label>
                    <Calendar
                      mode="single"
                      selected={tryOnDate}
                      onSelect={(d) => { setTryOnDate(d); setTryOnPeriod(null); }}
                      disabled={isDayDisabled}
                      className="pointer-events-auto mx-auto mt-2 rounded-lg border border-border bg-surface"
                    />
                    {tryOnDate && (
                      <p className="mt-2 text-center text-xs text-ink-muted">
                        {format(tryOnDate, "EEE d MMM yyyy")} · one day
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!tryOnDate || inactive}
                    onClick={startTryOnBooking}
                    className="btn-primary mt-5 w-full py-3.5 text-sm tracking-wider-display disabled:opacity-40"
                  >
                    BOOK TRY-ON
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ---------- Sticky mobile CTA ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-3 shadow-lg lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{datesMissing ? "Indicative" : "Total"}</p>
            <p className={cn("font-display text-lg", datesMissing && "text-ink-muted")}>
              {total != null ? `${datesMissing ? "from " : ""}$${total.toFixed(2)}` : "—"}
            </p>
          </div>
          {hireOption !== "tryon" && unavailableRange && !startDate ? (
            <button
              onClick={handleNotifyWhenAvailable}
              disabled={notifyLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-magenta bg-white py-3 text-xs font-medium text-magenta tracking-wider-display disabled:opacity-50"
            >
              <BellRing className="h-3.5 w-3.5" />
              {notifyLoading ? "SAVING…" : "NOTIFY ME"}
            </button>
          ) : (
            <button
              onClick={datesMissing ? promptForDates : handleBook}
              disabled={inactive}
              aria-disabled={datesMissing || undefined}
              className={cn(
                "btn-primary flex-1 py-3 text-xs tracking-wider-display disabled:opacity-40",
                datesMissing && "opacity-50",
              )}
            >
              {datesMissing ? "SELECT DATES" : "CHECKOUT"}
            </button>
          )}
        </div>
      </div>

      {/* ---------- Lightbox ---------- */}
      {lightbox && images[imgIdx] && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <img src={images[imgIdx].url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}

      {data.lender && user && data.lender.id !== user.id && (
        <EnquiryModal
          open={enquiryOpen}
          onClose={() => setEnquiryOpen(false)}
          dressId={data.id}
          dressTitle={data.title}
          lenderId={data.lender.id}
          lenderFirstName={data.lender.first_name ?? "the lender"}
          renterId={user.id}
        />
      )}

      {periodStepOpen && tryOnDate && (
        <TryOnPeriodStep
          date={tryOnDate}
          value={tryOnPeriod}
          onChange={setTryOnPeriod}
          onBack={() => { setPeriodStepOpen(false); setDatePopoverOpen(true); }}
          onContinue={(p) => {
            setTryOnPeriod(p);
            setPeriodStepOpen(false);
            if (!user) { openAuthModal("login", `/dresses/${id}`); return; }
            if (!emailVerified) { setVerifyOpen(true); return; }
            navigate({
              to: "/checkout",
              search: {
                dress_id: id,
                tryon_date: format(tryOnDate, "yyyy-MM-dd"),
                tryon_period: p,
                hire_option: "try_on",
                size_id: selectedSizeId ?? undefined,
              } as any,
            });
          }}
        />
      )}

      <VerifyEmailModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
    </AppShell>
  );
}

/* ---------- subcomponents ---------- */

function TryOnPeriodStep({
  date, value, onChange, onBack, onContinue,
}: {
  date: Date;
  value: "am" | "pm" | null;
  onChange: (p: "am" | "pm") => void;
  onBack: () => void;
  onContinue: (p: "am" | "pm") => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> Back to date
        </button>

        <p className="text-[11px] font-medium uppercase tracking-wider-display text-magenta">
          Try-on
        </p>
        <h2 className="mt-1 font-display text-2xl text-ink">{format(date, "EEEE, d MMMM yyyy")}</h2>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {([["am", "Morning"], ["pm", "Afternoon"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={value === key}
              className={cn(
                "rounded-xl border-2 px-4 py-5 text-sm font-medium transition-colors",
                value === key
                  ? "border-magenta bg-magenta/5 text-magenta"
                  : "border-border bg-white text-ink hover:border-magenta/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          You&apos;ll arrange the exact time with the lender in messages once your try-on is accepted.
        </p>

        <button
          type="button"
          disabled={!value}
          onClick={() => value && onContinue(value)}
          className={cn("btn-primary mt-5 w-full py-3 text-sm tracking-wider-display", !value && "opacity-40")}
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
}

function ShippingOptionRow({
  option, lenderCity, active, onClick,
}: { option: any; lenderCity?: string; active: boolean; onClick: () => void }) {
  const meta = (() => {
    switch (option.shipping_type) {
      case "standard": return { icon: <Truck className="h-4 w-4" />, name: shippingName(option.shipping_type), sub: option.transit_days ? `${option.transit_days}-day Australia Post` : "Australia Post" };
      case "express": return { icon: <Zap className="h-4 w-4" />, name: shippingName(option.shipping_type), sub: "1-day Express Post" };
      case "pickup": return { icon: <MapPin className="h-4 w-4" />, name: shippingName(option.shipping_type), sub: lenderCity ? `From ${lenderCity}` : "From lender" };
      case "two_hour_uber": return { icon: <Zap className="h-4 w-4" />, name: shippingName(option.shipping_type), sub: "Within 30km · same day" };
      default: return { icon: <Truck className="h-4 w-4" />, name: shippingName(option.shipping_type), sub: "" };
    }
  })();
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left text-sm transition-colors",
        active ? "border-magenta bg-bg-tint" : "border-border hover:border-ink/30",
      )}
    >
      <span className="text-ink-muted">{meta.icon}</span>
      <div className="flex-1">
        <p className="font-medium">{meta.name}</p>
        <p className="text-xs text-ink-muted">{meta.sub}</p>
      </div>
      <span className="font-medium">{Number(option.price) === 0 ? "Free" : `$${Number(option.price).toFixed(0)}`}</span>
    </button>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wider-display text-muted-foreground">{label.toUpperCase()}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] tracking-wider-display text-background">
      {children}
    </span>
  );
}

function DressDetailSkeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Skeleton className="aspect-[4/5] w-full" />
          </div>
          <div className="space-y-4 lg:col-span-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
