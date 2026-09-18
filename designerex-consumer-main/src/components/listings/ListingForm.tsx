import { SimpleSelect } from "@/components/ui/simple-select";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VerifyEmailModal } from "@/components/auth/VerifyEmailPrompt";
import { useEmailVerified, isEmailNotVerifiedError } from "@/hooks/useEmailVerified";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ImageUploader } from "./ImageUploader";
import { BrandCombobox } from "./BrandCombobox";
import { ColorCombobox } from "./ColorCombobox";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useFeePreview } from "@/lib/fee-preview";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const todayISO = () => new Date().toISOString().slice(0, 10);
const toISO = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

type ColorPair = { parentId: string | null; shadeId: string | null };
type ShippingRow = { shipping_type: string; is_enabled: boolean; price: number; transit_days: number };
type LinkRow = { label: string; url: string };

const SHIPPING_DEFS: { type: string; label: string; helper: string }[] = [
  { type: "standard", label: "Standard post", helper: "Australia Post Standard" },
  { type: "express", label: "Express post", helper: "Australia Post Express" },
  { type: "pickup", label: "Pickup", helper: "Renter collects from your pickup address" },
  { type: "two_hour_uber", label: "2-hour delivery", helper: "Same-day courier (Uber)" },
];

const FIT_RUNS: { value: string; label: string }[] = [
  { value: "true", label: "True to size" },
  { value: "small", label: "Runs small" },
  { value: "large", label: "Runs large" },
];
const normalizeFitRuns = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).toLowerCase().trim();
  if (["true", "true_to_size", "true to size"].includes(s)) return "true";
  if (["small", "runs_small", "runs small"].includes(s)) return "small";
  if (["large", "runs_large", "runs large"].includes(s)) return "large";
  return null;
};
const ATTR_CATEGORIES = ["neckline", "sleeve", "back_style", "fit_note"];
const CAT_LABEL: Record<string, string> = {
  neckline: "Neckline",
  sleeve: "Sleeve",
  back_style: "Back style",
  fit_note: "Fit note",
};

function Section({ title, description, children, defaultOpen = true }: {
  title: string; description?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b py-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <h3 className="font-display text-xl">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-5 space-y-4">{children}</div>}
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wider-display text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <Switch
      checked={on}
      onCheckedChange={onChange}
      aria-label={label}
      className="data-[state=checked]:bg-pink"
    />
  );
}

export function ListingForm({ dressId }: { dressId: string }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const { verified: emailVerified } = useEmailVerified();
  const [discardOpen, setDiscardOpen] = useState(false);

  // -------- Lookups
  const { data: lookups } = useQuery({
    queryKey: ["listing-lookups"],
    queryFn: async () => {
      const [types, occ, sz, col, attrs] = await Promise.all([
        supabase.from("dress_types").select("id, name").order("name"),
        supabase.from("occasions").select("id, name").order("name"),
        supabase.from("sizes").select("id, name, sort_order").order("sort_order"),
        supabase.from("colors").select("id, name, parent_color_id").order("name"),
        supabase.from("attributes").select("id, name, category").order("name"),
      ]);
      return {
        types: types.data ?? [],
        occasions: occ.data ?? [],
        sizes: sz.data ?? [],
        colors: col.data ?? [],
        attributes: attrs.data ?? [],
      };
    },
  });

  // -------- Dress + children
  const { data: dress, isLoading: dressLoading } = useQuery({
    queryKey: ["edit-dress", dressId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dresses").select("*").eq("id", dressId).single();
      if (error) throw error;
      return data as any;
    },
  });

  // Ownership check — redirect if the current user isn't the lender.
  useEffect(() => {
    if (!dress || !user) return;
    if (dress.lender_id && dress.lender_id !== user.id) {
      toast.error("You don't have permission to edit this dress");
      navigate({ to: "/dashboard/listings" });
    }
  }, [dress, user, navigate]);


  const { data: existingColors = [] } = useQuery({
    queryKey: ["edit-dress-colors", dressId],
    queryFn: async () => {
      const { data } = await supabase.from("dress_colors").select("color_id").eq("dress_id", dressId);
      return (data ?? []).map((r: any) => r.color_id as string);
    },
  });

  const { data: existingAttrs = [] } = useQuery({
    queryKey: ["edit-dress-attrs", dressId],
    queryFn: async () => {
      const { data } = await supabase.from("dress_attributes").select("attribute_id").eq("dress_id", dressId);
      return (data ?? []) as { attribute_id: string }[];
    },
  });

  const { data: existingShipping = [] } = useQuery({
    queryKey: ["edit-dress-shipping", dressId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dress_shipping_options")
        .select("shipping_type, is_enabled, price, transit_days")
        .eq("dress_id", dressId);
      return (data ?? []) as ShippingRow[];
    },
  });

  const { data: imagesCount = 0 } = useQuery({
    queryKey: ["dress-images-count", dressId],
    queryFn: async () => {
      const { count } = await supabase
        .from("dress_images")
        .select("id", { count: "exact", head: true })
        .eq("dress_id", dressId);
      return count ?? 0;
    },
  });

  // Sizes this listing offers (dress_sizes — one row per size).
  const { data: existingSizeIds = [] } = useQuery({
    queryKey: ["edit-dress-sizes", dressId],
    queryFn: async () => {
      const { data } = await supabase.from("dress_sizes").select("size_id").eq("dress_id", dressId);
      return (data ?? []).map((r: any) => String(r.size_id));
    },
  });

  const { data: existingBlackouts = [] } = useQuery({
    queryKey: ["edit-dress-blackouts", dressId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dress_blackouts")
        .select("blackout_date, size_id")
        .eq("dress_id", dressId)
        .gte("blackout_date", todayISO());
      return (data ?? []) as { blackout_date: string; size_id: string | null }[];
    },
  });

  // -------- Form state (initialized from dress)
  const [form, setForm] = useState<any>(null);
  const [colorPairs, setColorPairs] = useState<ColorPair[]>([{ parentId: null, shadeId: null }]);
  const [attrSet, setAttrSet] = useState<Set<string>>(new Set());
  const [shipping, setShipping] = useState<ShippingRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [sizesInit, setSizesInit] = useState(false);
  // Blackouts are scoped per size. Key "" = every size (legacy rows with a null size_id).
  const [blackoutsBySize, setBlackoutsBySize] = useState<Record<string, string[]>>({});
  const [blackoutSizeId, setBlackoutSizeId] = useState<string>("");
  const [blackoutsInit, setBlackoutsInit] = useState(false);

  useEffect(() => {
    if (sizesInit) return;
    if (existingSizeIds.length === 0) {
      if (dress?.size_id) { setSizeIds([String(dress.size_id)]); setSizesInit(true); }
      return;
    }
    setSizeIds(existingSizeIds);
    setSizesInit(true);
  }, [existingSizeIds, sizesInit, dress]);

  // Keep the availability size selector pointed at a size the listing still offers.
  useEffect(() => {
    if (sizeIds.length === 0) return;
    if (!blackoutSizeId || !sizeIds.includes(blackoutSizeId)) setBlackoutSizeId(sizeIds[0]);
  }, [sizeIds, blackoutSizeId]);

  useEffect(() => {
    if (blackoutsInit) return;
    if (existingBlackouts.length === 0) { setBlackoutsInit(true); return; }
    const map: Record<string, string[]> = {};
    for (const b of existingBlackouts) {
      const key = b.size_id ?? "";
      (map[key] ??= []).push(b.blackout_date);
    }
    setBlackoutsBySize(map);
    setBlackoutsInit(true);
  }, [existingBlackouts, blackoutsInit]);

  const blackoutDates = useMemo(() => {
    const scoped = blackoutsBySize[blackoutSizeId] ?? [];
    const allSizes = blackoutSizeId ? (blackoutsBySize[""] ?? []) : [];
    return [...new Set([...scoped, ...allSizes])].map(fromISO);
  }, [blackoutsBySize, blackoutSizeId]);

  const setBlackoutDates = (dates: Date[]) => {
    const iso = dates.map(toISO);
    const allSizes = new Set(blackoutSizeId ? (blackoutsBySize[""] ?? []) : []);
    setBlackoutsBySize((prev) => ({
      ...prev,
      // Dates inherited from an "every size" block stay where they are.
      [blackoutSizeId]: iso.filter((d) => !allSizes.has(d)),
      ...(blackoutSizeId
        ? { "": (prev[""] ?? []).filter((d) => iso.includes(d)) }
        : {}),
    }));
  };


  // Initialize once dress and lookups arrive
  useEffect(() => {
    if (!dress || !lookups || form) return;
    setForm({
      title: dress.title && dress.title !== "Untitled draft" ? dress.title : "",
      brand_id: dress.brand_id ?? null,
      dress_type_id: dress.dress_type_id ?? null,
      occasion_id: dress.occasion_id ?? null,
      size_id: dress.size_id ?? null,
      description: dress.description ?? "",
      fabric: dress.fabric_composition ?? "",
      measurements_text: dress.measurements ?? "",
      has_stretch: !!dress.has_stretch,
      has_cup_support: !!dress.cup_support,
      has_adjustable_straps: !!dress.adjustable_straps,
      fit_runs: normalizeFitRuns(dress.fit_runs),
      rrp: dress.rrp ?? "",
      hire_price_a: dress.hire_price_a ?? "",
      hire_price_b: dress.hire_price_b ?? "",
      cleaning_fee: dress.cleaning_fee ?? 0,
      insurance_fee: dress.insurance_fee ?? 0,
      requires_deposit: !!dress.requires_deposit,
      deposit_amount: dress.deposit_amount ?? "",
      try_on_available: !!dress.try_on_available,
      try_on_address: dress.try_on_address ?? (profile as any)?.pickup_address ?? "",
      try_on_price: dress.try_on_price ?? 0,
    });

    setLinks(Array.isArray(dress.external_links) ? dress.external_links : []);
  }, [dress, lookups, form, profile]);

  // Initialize colour pairs
  useEffect(() => {
    if (!lookups || existingColors.length === 0) return;
    const byId = new Map<string, any>(lookups.colors.map((c: any) => [c.id, c]));
    const pairs: ColorPair[] = [];
    const seenParents = new Set<string>();
    for (const id of existingColors) {
      const c = byId.get(id);
      if (!c) continue;
      if (c.parent_color_id) {
        pairs.push({ parentId: c.parent_color_id, shadeId: id });
        seenParents.add(c.parent_color_id);
      }
    }
    // Standalone parents (no shade selected)
    for (const id of existingColors) {
      const c = byId.get(id);
      if (c && !c.parent_color_id && !seenParents.has(id)) {
        pairs.push({ parentId: id, shadeId: null });
      }
    }
    if (pairs.length) setColorPairs(pairs);
  }, [lookups, existingColors]);

  useEffect(() => {
    setAttrSet((prev) => {
      const next = new Set(existingAttrs.map((a) => a.attribute_id));
      if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [existingAttrs]);

  // Initialize shipping rows
  useEffect(() => {
    if (shipping.length > 0) return;
    const enableTwoHour = !!(profile as any)?.enable_two_hour_delivery;
    const defaults = SHIPPING_DEFS.map((d) => {
      const ex = existingShipping.find((s) => s.shipping_type === d.type);
      if (ex) return { ...ex };
      if (d.type === "pickup") return { shipping_type: d.type, is_enabled: false, price: 0, transit_days: 0 };
      if (d.type === "standard") {
        return {
          shipping_type: d.type,
          is_enabled: existingShipping.length === 0,
          price: Number((profile as any)?.default_shipping_fee ?? 15),
          transit_days: 3,
        };
      }
      if (d.type === "express") return { shipping_type: d.type, is_enabled: false, price: 20, transit_days: 1 };
      return { shipping_type: d.type, is_enabled: false, price: 25, transit_days: 0 };
    });
    // hide two_hour from list if not enabled
    setShipping(enableTwoHour ? defaults : defaults.filter((s) => s.shipping_type !== "two_hour_uber"));
  }, [existingShipping, profile, shipping.length]);

  // -------- Derived
  const parentColors = useMemo(
    () => (lookups?.colors ?? []).filter((c: any) => !c.parent_color_id),
    [lookups],
  );
  const shadeColorsFor = (parentId: string | null) =>
    (lookups?.colors ?? []).filter((c: any) => c.parent_color_id === parentId);

  const status: string = dress?.status ?? "draft";
  const isDraft = status === "draft";

  const missing: string[] = [];
  if (form) {
    if (!form.title?.trim()) missing.push("Title");
    if (!form.brand_id) missing.push("Brand");
    if (!form.dress_type_id) missing.push("Dress type");
    if (!form.occasion_id) missing.push("Occasion");
    if (sizeIds.length === 0) missing.push("Size");
    if (!form.rrp || Number(form.rrp) <= 0) missing.push("RRP");
    if (!form.hire_price_a || Number(form.hire_price_a) <= 0) missing.push("4-day hire price");
    if (imagesCount < 3) missing.push(`At least 3 photos (${imagesCount}/3)`);
    const colorOk = colorPairs.some((p) => p.parentId);
    if (!colorOk) missing.push("At least 1 colour");
    const anyShipping = shipping.some((s) => s.is_enabled);
    if (!anyShipping) missing.push("At least 1 shipping option enabled");
  }

  // Deposit cap: 30% of RRP
  const rrpNum = form ? Number(form.rrp) || 0 : 0;
  const depositCap = rrpNum > 0 ? Math.round(rrpNum * 0.3 * 100) / 100 : 0;
  const depositNum = form ? Number(form.deposit_amount) || 0 : 0;
  let depositError: string | null = null;
  if (form?.requires_deposit) {
    if (rrpNum <= 0) depositError = "Enter an RRP before setting a deposit.";
    else if (depositNum <= 0) depositError = "Deposit must be greater than $0.";
    else if (depositNum > depositCap) depositError = `Deposit exceeds the 30% cap ($${depositCap.toFixed(2)}).`;
  }
  if (depositError) missing.push(`Security deposit — ${depositError}`);


  const buildDressPayload = () => {
    const primarySizeId = sizeIds[0] ?? form.size_id ?? null;
    const sizeRow = lookups?.sizes.find((s: any) => s.id === primarySizeId);

    const hireA = form.hire_price_a === "" ? null : Number(form.hire_price_a);
    const hireBRaw = form.hire_price_b === "" ? null : Number(form.hire_price_b);
    const hireB = hireBRaw && hireBRaw > 0 ? hireBRaw : null;
    return {
      title: form.title?.trim() || "Untitled draft",
      brand_id: form.brand_id,
      dress_type_id: form.dress_type_id,
      occasion_id: form.occasion_id,
      size_id: primarySizeId,
      size: sizeRow?.name ?? null,
      description: form.description || null,
      fabric_composition: form.fabric || null,
      measurements: form.measurements_text || null,
      has_stretch: form.has_stretch,
      cup_support: form.has_cup_support,
      adjustable_straps: form.has_adjustable_straps,
      fit_runs: normalizeFitRuns(form.fit_runs),
      rrp: form.rrp === "" ? null : Number(form.rrp),
      hire_price_a: hireA,
      rental_fee: hireA,
      hire_price_b: hireB,
      cleaning_fee: Number(form.cleaning_fee || 0),
      insurance_fee: Number(form.insurance_fee || 0),
      requires_deposit: !!form.requires_deposit,
      deposit_amount: form.requires_deposit
        ? (form.deposit_amount === "" ? null : Number(form.deposit_amount))
        : null,
      try_on_available: form.try_on_available,
      try_on_address: form.try_on_available ? form.try_on_address || null : null,
      try_on_price: form.try_on_available ? Number(form.try_on_price || 0) : null,
      external_links: links.filter((l) => l.label && l.url),
    };

  };

  const reconcileChildren = async () => {
    // Colors
    console.log("[ListingForm] dress_colors: delete");
    const { error: cDel } = await supabase.from("dress_colors").delete().eq("dress_id", dressId);
    if (cDel) throw new Error(`dress_colors delete: ${cDel.message}`);
    const colorRows: { dress_id: string; color_id: string }[] = [];
    for (const p of colorPairs) {
      if (p.parentId) colorRows.push({ dress_id: dressId, color_id: p.parentId });
      if (p.shadeId) colorRows.push({ dress_id: dressId, color_id: p.shadeId });
    }
    console.log("[ListingForm] dress_colors: insert", colorRows);
    if (colorRows.length) {
      const { error } = await supabase.from("dress_colors").insert(colorRows);
      if (error) throw new Error(`dress_colors insert: ${error.message}`);
    }

    // Attributes (table has no `category` column)
    console.log("[ListingForm] dress_attributes: delete");
    const { error: aDel } = await supabase.from("dress_attributes").delete().eq("dress_id", dressId);
    if (aDel) throw new Error(`dress_attributes delete: ${aDel.message}`);
    const attrRows: { dress_id: string; attribute_id: string }[] = [];
    for (const a of lookups?.attributes ?? []) {
      if (attrSet.has(a.id)) attrRows.push({ dress_id: dressId, attribute_id: a.id });
    }
    console.log("[ListingForm] dress_attributes: insert", attrRows);
    if (attrRows.length) {
      const { error } = await supabase.from("dress_attributes").insert(attrRows);
      if (error) throw new Error(`dress_attributes insert: ${error.message}`);
    }

    // Shipping
    console.log("[ListingForm] dress_shipping_options: delete");
    const { error: sDel } = await supabase.from("dress_shipping_options").delete().eq("dress_id", dressId);
    if (sDel) throw new Error(`dress_shipping_options delete: ${sDel.message}`);
    const shipRows = shipping.map((s) => ({
      dress_id: dressId,
      shipping_type: s.shipping_type,
      price: s.shipping_type === "pickup" ? 0 : Number(s.price || 0),
      transit_days: s.shipping_type === "pickup" ? 0 : Number(s.transit_days || 0),
      is_enabled: s.is_enabled,
    }));
    console.log("[ListingForm] dress_shipping_options: insert", shipRows);
    if (shipRows.length) {
      const { error } = await supabase.from("dress_shipping_options").insert(shipRows);
      if (error) throw new Error(`dress_shipping_options insert: ${error.message}`);
    }

    // Sizes offered (one dress_sizes row per size)
    console.log("[ListingForm] dress_sizes: reconcile", sizeIds);
    const { error: szDel } = await supabase.from("dress_sizes").delete().eq("dress_id", dressId);
    if (szDel) throw new Error(`dress_sizes delete: ${szDel.message}`);
    if (sizeIds.length) {
      const { error } = await supabase
        .from("dress_sizes")
        .insert(sizeIds.map((size_id) => ({ dress_id: dressId, size_id })));
      if (error) throw new Error(`dress_sizes insert: ${error.message}`);
    }

    // Blackouts (only reconcile future dates; preserve past as historical record).
    // Blocks are scoped per size — key "" means every size.
    const today = todayISO();
    console.log("[ListingForm] dress_blackouts: delete future");
    const { error: bDel } = await supabase
      .from("dress_blackouts")
      .delete()
      .eq("dress_id", dressId)
      .gte("blackout_date", today);
    if (bDel) throw new Error(`dress_blackouts delete: ${bDel.message}`);
    const blackoutRows = Object.entries(blackoutsBySize).flatMap(([sizeKey, dates]) =>
      [...new Set(dates)]
        .filter((d) => d >= today)
        .map((d) => ({
          dress_id: dressId,
          blackout_date: d,
          size_id: sizeKey || null,
          source: "lender",
        })),
    );
    console.log("[ListingForm] dress_blackouts: insert", blackoutRows);
    if (blackoutRows.length) {
      let { error } = await supabase.from("dress_blackouts").insert(blackoutRows);
      if (error && /source/.test(error.message)) {
        const stripped = blackoutRows.map(({ source: _s, ...rest }) => rest);
        ({ error } = await supabase.from("dress_blackouts").insert(stripped));
      }
      if (error) throw new Error(`dress_blackouts insert: ${error.message}`);
    }

  };

  const save = async (publish = false, stayOnPage = false) => {
    if (!user || !form) return;
    if (depositError) {
      toast.error(depositError);
      return;
    }
    if (publish && missing.length > 0) {
      toast.error(`Can't publish — missing: ${missing.join(", ")}`);
      return;
    }
    if (publish && !emailVerified) {
      // Save the work as a draft, then explain why we can't publish yet.
      await save(false, true);
      setVerifyOpen(true);
      return;
    }

    if (publish) setPublishing(true); else setSaving(true);
    console.log("[ListingForm] Save started", { publish, dressId, userId: user.id });
    try {
      const payload: any = buildDressPayload();
      if (publish) payload.status = "active";
      else if (isDraft) payload.status = "draft";
      console.log("[ListingForm] dresses: update", payload);
      console.log("[ListingForm] fit_runs being sent:", payload.fit_runs);
      console.log("[ListingForm] brand_id being sent:", payload.brand_id);
      const { data: dData, error } = await supabase
        .from("dresses")
        .update(payload)
        .eq("id", dressId)
        .eq("lender_id", user.id)
        .select()
        .single();
      console.log("[ListingForm] dresses: update result", { dData, error });
      if (error) throw new Error(`dresses update: ${error.message}`);
      await reconcileChildren();
      qc.invalidateQueries({ queryKey: ["edit-dress", dressId] });
      qc.invalidateQueries({ queryKey: ["edit-dress-blackouts", dressId] });
      qc.invalidateQueries({ queryKey: ["edit-dress-sizes", dressId] });
      qc.invalidateQueries({ queryKey: ["dress-sizes", dressId] });

      qc.invalidateQueries({ queryKey: ["lender-listings"] });
      if (publish) {
        toast.success("Listing is now live.");
      } else if (isDraft) {
        toast.success("Draft saved.");
      } else {
        toast.success("Changes saved.");
      }
      if (!stayOnPage) navigate({ to: "/dashboard/listings" });
    } catch (e: any) {
      console.error("[ListingForm] SAVE FAILED:", e);
      if (isEmailNotVerifiedError(e)) {
        setVerifyOpen(true);
      } else {
        toast.error(`Save failed: ${e?.message ?? "unknown error"}`);
      }
      // Swallow — do not rethrow. Prevents component crash / auth reset.
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  const discardDraft = async () => {
    if (!user) return;
    const { error } = await supabase.from("dresses").delete().eq("id", dressId).eq("lender_id", user.id);
    setDiscardOpen(false);
    if (error) { toast.error(`Couldn't discard: ${error.message}`); return; }
    qc.invalidateQueries({ queryKey: ["lender-listings"] });
    toast.success("Draft discarded.");
    navigate({ to: "/dashboard/listings" });
  };

  if (dressLoading || !form || !lookups) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-wider-display text-muted-foreground">
            {isDraft ? "DRAFT" : status.toUpperCase()}
          </p>
          <h2 className="font-display text-3xl">
            {isDraft ? "New listing" : "Edit listing"}
          </h2>
        </div>
        {isDraft && (
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" /> Discard draft
          </button>
        )}
      </div>

      {/* PHOTOS */}
      <Section title="Photos" description="Add 3+ high-quality images. The first photo is the cover.">
        <ImageUploader dressId={dressId} />
      </Section>

      {/* UNAVAILABLE DATES */}
      <Section
        title="Unavailable dates"
        description="Block specific dates when this dress can't be hired (e.g. you're wearing it yourself, or it's already booked elsewhere)."
        defaultOpen={false}
      >
        <div className="flex flex-col items-start gap-3">
          <div className="w-full max-w-xs">
            <span className="mb-1.5 block text-xs font-medium">Size</span>
            <SimpleSelect
              className="w-full"
              aria-label="Size"
              value={blackoutSizeId}
              onValueChange={setBlackoutSizeId}
              options={
                sizeIds.length === 0
                  ? [{ value: "", label: "All sizes" }]
                  : sizeIds.map((sid) => ({
                      value: sid,
                      label: lookups?.sizes.find((s: any) => s.id === sid)?.name ?? "Size",
                    }))
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Blocking dates here only blocks the selected size.
            </p>
          </div>
          <Calendar
            mode="multiple"
            selected={blackoutDates}
            onSelect={(dates) => setBlackoutDates(dates ?? [])}
            disabled={(date) => {
              const d = new Date(date);
              d.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return d < today;
            }}
            className={cn("rounded-md border p-3 pointer-events-auto")}
          />
          <p className="text-xs text-muted-foreground">
            {(blackoutDates?.length ?? 0) === 0
              ? "No blocked dates."
              : `${blackoutDates!.length} date${blackoutDates!.length === 1 ? "" : "s"} blocked. Click a date again to unblock.`}
          </p>

          {(blackoutDates?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setBlackoutDates([])}
              className="text-xs text-pink hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </Section>


      {/* BASICS */}
      <Section title="Basics" description="Title, brand, type, occasion, and size.">
        <Field label="Title">
          <input
            className="input w-full"
            maxLength={100}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Midi silk wrap dress in emerald"
          />
        </Field>
        <Field label="Designer / brand">
          <BrandCombobox
            value={form.brand_id}
            onChange={(id) => setForm({ ...form, brand_id: id })}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Dress type">
            <SimpleSelect
              className="w-full"
              aria-label="Dress type"
              placeholder="Select…"
              value={form.dress_type_id ?? ""}
              onValueChange={(v) => setForm({ ...form, dress_type_id: v || null })}
              options={lookups.types.map((t: any) => ({ value: t.id, label: t.name }))}
            />
          </Field>
          <Field label="Occasion">
            <SimpleSelect
              className="w-full"
              aria-label="Occasion"
              placeholder="Select…"
              value={form.occasion_id ?? ""}
              onValueChange={(v) => setForm({ ...form, occasion_id: v || null })}
              options={lookups.occasions.map((o: any) => ({ value: o.id, label: o.name }))}
            />
          </Field>
          <Field label="Sizes available">
            <div className="flex flex-wrap gap-2">
              {lookups.sizes.map((s: any) => {
                const on = sizeIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSizeIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      on ? "border-magenta bg-magenta text-white" : "hover:bg-muted",
                    )}
                    aria-pressed={on}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Pick every size this dress is available in. Availability is tracked per size.
            </p>
          </Field>

        </div>
      </Section>

      {/* COLOURS */}
      <Section title="Colours" description="Pick a parent colour, then narrow down to the shade.">
        <div className="space-y-3">
          {colorPairs.map((p, idx) => {
            const shades = shadeColorsFor(p.parentId);
            const hasShades = !!p.parentId && shades.length > 0;
            const parentName = parentColors.find((c: any) => c.id === p.parentId)?.name;
            return (
            <div key={idx} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <Field label="Colour">
                  <ColorCombobox
                    value={p.parentId}
                    options={parentColors.map((c: any) => ({ id: c.id, name: c.name }))}
                    placeholder="Search colours…"
                    onChange={(id) => {
                      const next = [...colorPairs];
                      next[idx] = { parentId: id, shadeId: null };
                      setColorPairs(next);
                    }}
                  />
                </Field>
              </div>
              <div className="flex-1 min-w-[180px]">
                <Field label="Shade">
                  <ColorCombobox
                    value={p.shadeId}
                    options={shades.map((c: any) => ({ id: c.id, name: c.name }))}
                    disabled={!p.parentId || !hasShades}
                    placeholder={
                      !p.parentId
                        ? "Pick colour first"
                        : !hasShades
                          ? `No shades available — using ${parentName}`
                          : "Search shades…"
                    }
                    onChange={(id) => {
                      const next = [...colorPairs];
                      next[idx] = { ...p, shadeId: id };
                      setColorPairs(next);
                    }}
                  />
                </Field>
              </div>
              {colorPairs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setColorPairs(colorPairs.filter((_, i) => i !== idx))}
                  className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
                  aria-label="Remove colour"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            );
          })}
          <button
            type="button"
            onClick={() => setColorPairs([...colorPairs, { parentId: null, shadeId: null }])}
            className="inline-flex items-center gap-1 text-xs text-pink hover:underline"
          >
            <Plus className="h-3 w-3" /> Add another colour
          </button>
        </div>
      </Section>

      {/* DETAILS */}
      <Section title="Details" description="Description, fabric, measurements, and fit notes.">
        <Field label="Description">
          <textarea className="input w-full" rows={4} maxLength={2000}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Tell renters about the look and feel…" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Fabric composition">
            <input className="input w-full" value={form.fabric}
              onChange={(e) => setForm({ ...form, fabric: e.target.value })}
              placeholder="e.g. 100% polyester satin" />
          </Field>
          <Field label="Fit runs">
            <SimpleSelect
              className="w-full"
              aria-label="Fit runs"
              placeholder="— Select —"
              value={form.fit_runs ?? ""}
              onValueChange={(raw) => {
                const normalized = normalizeFitRuns(raw);
                setForm({ ...form, fit_runs: normalized });
              }}
              options={FIT_RUNS.map((f) => ({ value: f.value, label: f.label }))}
            />
          </Field>
        </div>
        <Field label="Measurements" hint="One per line, e.g. Bust 86cm, Waist 70cm, Length 145cm">
          <textarea className="input w-full" rows={4}
            value={form.measurements_text}
            onChange={(e) => setForm({ ...form, measurements_text: e.target.value })} />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["has_stretch", "Has stretch"],
            ["has_cup_support", "Cup support"],
            ["has_adjustable_straps", "Adjustable straps"],
          ].map(([k, l]) => (
            <div key={k} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
              <span className="text-sm">{l}</span>
              <Toggle on={!!form[k]} onChange={(v) => setForm({ ...form, [k]: v })} label={l} />
            </div>
          ))}
        </div>
      </Section>

      {/* STYLE ATTRIBUTES */}
      <Section title="Style attributes" description="Tap to add the cuts and silhouettes that apply.">
        {ATTR_CATEGORIES.map((cat) => {
          const opts = (lookups.attributes ?? []).filter((a: any) => a.category === cat);
          if (opts.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2 text-xs uppercase tracking-wider-display text-muted-foreground">{CAT_LABEL[cat]}</p>
              <div className="flex flex-wrap gap-2">
                {opts.map((a: any) => {
                  const on = attrSet.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(attrSet);
                        if (on) next.delete(a.id); else next.add(a.id);
                        setAttrSet(next);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        on ? "border-pink bg-pink text-white" : "border-border bg-white hover:bg-muted",
                      )}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>

      {/* PRICING */}
      <Section title="Pricing" description="Set what renters pay and what you'd charge to cover cleaning or damage.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="RRP (AUD)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input type="number" min={0} className="input w-full pl-7" value={form.rrp}
                onChange={(e) => setForm({ ...form, rrp: e.target.value })} placeholder="800" />
            </div>
          </Field>
          <Field label="4-day hire price (AUD)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input type="number" min={0} className="input w-full pl-7" value={form.hire_price_a}
                onChange={(e) => setForm({ ...form, hire_price_a: e.target.value })} placeholder="100" />
            </div>
          </Field>
          <Field label="8-day hire price (AUD)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input type="number" min={0} className="input w-full pl-7" value={form.hire_price_b}
                placeholder="160"
                onChange={(e) => setForm({ ...form, hire_price_b: e.target.value })} />
            </div>
          </Field>
          <Field label="Cleaning fee (AUD)">
            <input type="number" min={0} className="input w-full" value={form.cleaning_fee}
              onChange={(e) => setForm({ ...form, cleaning_fee: e.target.value })} />
          </Field>
        </div>

        {/* Security deposit (bond) */}
        <div className="mt-4 rounded-md border bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Require a security deposit</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A refundable hold placed on the renter's card, released after the dress is returned in good condition. You can charge against it for damage or loss.
              </p>
            </div>
            <Toggle
              on={!!form.requires_deposit}
              onChange={(v) => setForm({ ...form, requires_deposit: v })}
              label="Require a security deposit"
            />
          </div>
          {form.requires_deposit && (
            <div className="mt-3">
              <Field label="Deposit amount (AUD)">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="input w-full pl-7"
                    value={form.deposit_amount}
                    onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </Field>
              <p className={cn(
                "mt-1 text-[11px]",
                depositError ? "text-red-600" : "text-muted-foreground",
              )}>
                {depositError
                  ? depositError
                  : rrpNum > 0
                    ? `Max deposit for this RRP: $${depositCap.toFixed(2)}`
                    : "Enter an RRP above to see the maximum deposit."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                The deposit is a hold, not income — it isn't added to your earnings.
              </p>
            </div>
          )}
        </div>

        <EarningsPreview
          rental={Number(form.hire_price_a) || 0}
          cleaning={Number(form.cleaning_fee) || 0}
          shipping={Number(
            shipping.find((s) => s.shipping_type === "standard" && s.is_enabled)?.price ?? 0,
          )}
        />
      </Section>



      {/* SHIPPING */}
      <Section title="Shipping" description="Choose how renters can receive the dress. At least one option is required.">
        <div className="space-y-3">
          {shipping.map((s, idx) => {
            const def = SHIPPING_DEFS.find((d) => d.type === s.shipping_type)!;
            const locked = s.shipping_type === "pickup";
            return (
              <div key={s.shipping_type} className="rounded-md border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{def.label}</p>
                    <p className="text-xs text-muted-foreground">{def.helper}</p>
                    {s.shipping_type === "pickup" && s.is_enabled && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Pickup from: {((profile as any)?.pickup_address ?? "—")}. Edit in your profile.
                      </p>
                    )}
                  </div>
                  <Toggle
                    on={s.is_enabled}
                    onChange={(v) => {
                      const next = [...shipping];
                      next[idx] = { ...s, is_enabled: v };
                      setShipping(next);
                    }}
                    label={def.label}
                  />
                </div>
                {s.is_enabled && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Price (AUD)">
                      <input type="number" min={0} className="input w-full" disabled={locked}
                        value={locked ? 0 : s.price}
                        onChange={(e) => {
                          const next = [...shipping];
                          next[idx] = { ...s, price: Number(e.target.value) };
                          setShipping(next);
                        }} />
                    </Field>
                    <Field label="Transit days">
                      <input type="number" min={0} className="input w-full" disabled={locked}
                        value={locked ? 0 : s.transit_days}
                        onChange={(e) => {
                          const next = [...shipping];
                          next[idx] = { ...s, transit_days: Number(e.target.value) };
                          setShipping(next);
                        }} />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
          {!(profile as any)?.enable_two_hour_delivery && (
            <p className="text-xs text-muted-foreground">
              2-hour delivery isn't enabled on your account.{" "}
              <a href="/dashboard/two-hour-delivery" className="text-pink hover:underline">Enable it →</a>
            </p>
          )}
        </div>
      </Section>

      {/* TRY ON */}
      <Section title="Try-on (optional)" description="Let local renters try the dress before booking.">
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
          <span className="text-sm">Try-on available</span>
          <Toggle on={form.try_on_available} onChange={(v) => setForm({ ...form, try_on_available: v })} />
        </div>
        {form.try_on_available && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Try-on address">
              <input className="input w-full" value={form.try_on_address}
                onChange={(e) => setForm({ ...form, try_on_address: e.target.value })} />
            </Field>
            <Field label="Try-on price (AUD)">
              <input type="number" min={0} className="input w-full" value={form.try_on_price}
                onChange={(e) => setForm({ ...form, try_on_price: e.target.value })} />
            </Field>
          </div>
        )}
      </Section>

      {/* EXTERNAL LINKS */}
      <Section title="External links (optional)" description="Link the original product page, press, or designer site." defaultOpen={false}>
        <div className="space-y-2">
          {links.map((l, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-2">
              <input className="input" placeholder="Label" value={l.label}
                onChange={(e) => {
                  const next = [...links]; next[idx] = { ...l, label: e.target.value }; setLinks(next);
                }} />
              <input className="input" placeholder="https://…" value={l.url}
                onChange={(e) => {
                  const next = [...links]; next[idx] = { ...l, url: e.target.value }; setLinks(next);
                }} />
              <button type="button" onClick={() => setLinks(links.filter((_, i) => i !== idx))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLinks([...links, { label: "", url: "" }])}
            className="inline-flex items-center gap-1 text-xs text-pink hover:underline">
            <Plus className="h-3 w-3" /> Add link
          </button>
        </div>
      </Section>

      {/* Validation summary when draft */}
      {isDraft && missing.length > 0 && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-medium">To publish, complete:</p>
          <ul className="ml-4 mt-1 list-disc space-y-0.5">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white/95 backdrop-blur px-4 py-3 lg:left-[260px]">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
          {isDraft ? (
            <>
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving || publishing}
                className="rounded-md border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => save(true)}
                  disabled={publishing || saving || missing.length > 0}
                  title={missing.length ? `Missing: ${missing.join(", ")}` : ""}
                  className="rounded-md bg-pink px-4 py-2 text-xs font-medium text-white hover:bg-pink/90 disabled:opacity-50"
                >
                  {publishing ? "Publishing…" : "Publish listing"}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              className="rounded-md bg-pink px-4 py-2 text-xs font-medium text-white hover:bg-pink/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. All uploaded photos will be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discardDraft} className="bg-red-600 hover:bg-red-700">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VerifyEmailModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verify your email first"
        body="Verify your email before publishing. Your listing has been saved as a draft."
      />
    </div>
  );
}

function EarningsPreview({
  rental,
  cleaning = 0,
  shipping = 0,
}: {
  rental: number;
  cleaning?: number;
  shipping?: number;
}) {
  const fee = useFeePreview(rental, cleaning, shipping, 0);
  if (!Number.isFinite(rental) || rental <= 0) {
    return (
      <p className="mt-4 text-xs text-muted-foreground">
        Enter a 4-day hire price to preview your earnings.
      </p>
    );
  }
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  return (
    <div className="mt-4 rounded-md border border-border bg-bg-tint p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider-display text-ink">
        Your earnings (per 4-day hire)
      </p>
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="font-medium text-ink">You receive</dt>
          <dd className="font-display text-lg text-magenta">
            {fee ? fmt(fee.lender_receives) : <span className="text-sm text-muted-foreground">Calculating…</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}

