import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { BrandCombobox } from "@/components/listings/BrandCombobox";
import { SimpleSelect } from "@/components/ui/simple-select";

export const Route = createFileRoute("/_authenticated/dashboard/listings_/new")({
  ssr: false,
  component: () => (
    <LenderGate>
      <NewListingPage />
    </LenderGate>
  ),
});

type Lookup = { id: string; name: string };

const FIT_RUNS = [
  { value: "small", label: "Runs small" },
  { value: "true", label: "True to size" },
  { value: "large", label: "Runs large" },
];

function NewListingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [dressTypes, setDressTypes] = useState<Lookup[]>([]);
  const [occasions, setOccasions] = useState<Lookup[]>([]);
  const [sizes, setSizes] = useState<Lookup[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    brand_id: null as string | null,
    dress_type_id: "",
    occasion_id: "",
    size_id: "",
    fit_runs: "",
    has_stretch: false,
    cup_support: false,
    adjustable_straps: false,
    fabric_composition: "",
    rrp: "",
    hire_price_a: "",
    hire_price_b: "",
    cleaning_fee: "0",
    insurance_fee: "0",
    requires_deposit: false,
    deposit_amount: "",
    pickup_available: false,
    pickup_address: "",
    try_on_available: false,
    try_on_address: "",
    try_on_price: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [dt, occ, sz] = await Promise.all([
        supabase.from("dress_types").select("id, name").order("name"),
        supabase.from("occasions").select("id, name").eq("is_active", true).order("name"),
        supabase.from("sizes").select("id, name, sort_order").order("sort_order"),
      ]);
      setDressTypes((dt.data ?? []) as Lookup[]);
      setOccasions((occ.data ?? []) as Lookup[]);
      setSizes((sz.data ?? []) as Lookup[]);
    })();
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Required";
    if (!form.description.trim()) e.description = "Required";
    if (!form.brand_id) e.brand_id = "Required";
    if (!form.dress_type_id) e.dress_type_id = "Required";
    if (!form.size_id) e.size_id = "Required";
    if (!form.hire_price_a || Number(form.hire_price_a) <= 0) e.hire_price_a = "Required";
    if (form.pickup_available && !form.pickup_address.trim()) e.pickup_address = "Required";
    if (form.requires_deposit) {
      const rrp = Number(form.rrp) || 0;
      const dep = Number(form.deposit_amount) || 0;
      const cap = Math.round(rrp * 0.3 * 100) / 100;
      if (rrp <= 0) e.deposit_amount = "Enter an RRP before setting a deposit";
      else if (dep <= 0) e.deposit_amount = "Must be greater than $0";
      else if (dep > cap) e.deposit_amount = `Exceeds 30% cap ($${cap.toFixed(2)})`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };


  const save = async () => {
    if (!user) return;
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    const hireA = Number(form.hire_price_a);
    const payload = {
      lender_id: user.id,
      title: form.title.trim(),
      description: form.description.trim(),
      brand_id: form.brand_id,
      dress_type_id: form.dress_type_id,
      occasion_id: form.occasion_id || null,
      size_id: form.size_id,
      fit_runs: form.fit_runs || null,
      has_stretch: form.has_stretch,
      cup_support: form.cup_support,
      adjustable_straps: form.adjustable_straps,
      fabric_composition: form.fabric_composition.trim() || null,
      rrp: form.rrp ? Number(form.rrp) : null,
      hire_price_a: hireA,
      hire_price_b: form.hire_price_b ? Number(form.hire_price_b) : null,
      rental_fee: hireA,
      cleaning_fee: form.cleaning_fee ? Number(form.cleaning_fee) : 0,
      insurance_fee: form.insurance_fee ? Number(form.insurance_fee) : 0,
      requires_deposit: form.requires_deposit,
      deposit_amount: form.requires_deposit && form.deposit_amount ? Number(form.deposit_amount) : null,
      shipping_fee: 0,
      pickup_available: form.pickup_available,
      pickup_address: form.pickup_available ? form.pickup_address.trim() : null,

      try_on_available: form.try_on_available,
      try_on_address: form.try_on_available ? form.try_on_address.trim() || null : null,
      try_on_price: form.try_on_available && form.try_on_price ? Number(form.try_on_price) : null,
      status: "draft" as const,
      designer: "",
      size: "",
      color: "",
    };
    const { data, error } = await supabase
      .from("dresses")
      .insert(payload)
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      console.error("Create draft failed:", error);
      toast.error(`Couldn't save draft: ${error?.message ?? "unknown error"}`);
      return;
    }
    toast.success("Draft saved.");
    navigate({ to: "/dashboard/listings" });
    navigate({
      to: "/dashboard/listings/$id/edit",
      params: { id: data.id },
      search: { step: "images" } as any,
    });
  };

  const inputCls = (key: string) =>
    `mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring ${
      errors[key] ? "border-destructive" : "border-input"
    }`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link to="/dashboard/listings" className="hover:text-foreground">
          Listings
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">New listing</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl">List a new dress</h1>
        <p className="mt-2 text-muted-foreground">
          Fill in the details below. You can save as a draft and finish later.
        </p>
      </header>

      <div className="space-y-10">
        {/* Section 1: Basics */}
        <FormSection title="Basics">
          <div className="md:col-span-2">
            <Label required>Title</Label>
            <input
              className={inputCls("title")}
              placeholder="e.g. Diamond Days Maxi"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
            {errors.title && <ErrorText>{errors.title}</ErrorText>}
          </div>
          <div className="md:col-span-2">
            <Label required>Description</Label>
            <textarea
              rows={5}
              className={inputCls("description")}
              placeholder="Tell renters about the dress, fit, and any special details"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
            {errors.description && <ErrorText>{errors.description}</ErrorText>}
          </div>
        </FormSection>

        {/* Section 2: Brand & category */}
        <FormSection title="Brand & category">
          <div className="md:col-span-2">
            <Label required>Brand</Label>
            <BrandCombobox
              value={form.brand_id}
              onChange={(id) => set("brand_id", id)}
            />
            {errors.brand_id && <ErrorText>{errors.brand_id}</ErrorText>}
          </div>
          <div>
            <Label required>Dress type</Label>
            <SimpleSelect
              className={inputCls("dress_type_id")}
              aria-label="Dress type"
              placeholder="Select…"
              value={form.dress_type_id}
              onValueChange={(v) => set("dress_type_id", v)}
              options={dressTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
            {errors.dress_type_id && <ErrorText>{errors.dress_type_id}</ErrorText>}
          </div>
          <div>
            <Label>Occasion</Label>
            <SimpleSelect
              className={inputCls("occasion_id")}
              aria-label="Occasion"
              placeholder="Select…"
              value={form.occasion_id}
              onValueChange={(v) => set("occasion_id", v)}
              options={occasions.map((o) => ({ value: o.id, label: o.name }))}
            />
          </div>
        </FormSection>

        {/* Section 3: Size & fit */}
        <FormSection title="Size & fit">
          <div>
            <Label required>Size</Label>
            <SimpleSelect
              className={inputCls("size_id")}
              aria-label="Size"
              placeholder="Select…"
              value={form.size_id}
              onValueChange={(v) => set("size_id", v)}
              options={sizes.map((s) => ({ value: s.id, label: s.name }))}
            />
            {errors.size_id && <ErrorText>{errors.size_id}</ErrorText>}
          </div>
          <div>
            <Label>Fit</Label>
            <SimpleSelect
              className={inputCls("fit_runs")}
              aria-label="Fit runs"
              placeholder="Select…"
              value={form.fit_runs}
              onValueChange={(v) => set("fit_runs", v)}
              options={FIT_RUNS.map((f) => ({ value: f.value, label: f.label }))}
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <CheckboxRow
              checked={form.has_stretch}
              onChange={(v) => set("has_stretch", v)}
              label="Has stretch"
            />
            <CheckboxRow
              checked={form.cup_support}
              onChange={(v) => set("cup_support", v)}
              label="Built-in cup support"
            />
            <CheckboxRow
              checked={form.adjustable_straps}
              onChange={(v) => set("adjustable_straps", v)}
              label="Adjustable straps"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Fabric composition</Label>
            <input
              className={inputCls("fabric_composition")}
              placeholder="e.g. 100% silk"
              value={form.fabric_composition}
              onChange={(e) => set("fabric_composition", e.target.value)}
            />
          </div>
        </FormSection>

        {/* Section 4: Pricing */}
        <FormSection title="Pricing">
          <div>
            <Label>Recommended retail price (AUD)</Label>
            <CurrencyInput
              value={form.rrp}
              onChange={(v) => set("rrp", v)}
              className={inputCls("rrp")}
            />
          </div>
          <div>
            <Label required>4-day hire price</Label>
            <CurrencyInput
              value={form.hire_price_a}
              onChange={(v) => set("hire_price_a", v)}
              className={inputCls("hire_price_a")}
            />
            {errors.hire_price_a && <ErrorText>{errors.hire_price_a}</ErrorText>}
          </div>
          <div>
            <Label>8-day hire price</Label>
            <CurrencyInput
              value={form.hire_price_b}
              onChange={(v) => set("hire_price_b", v)}
              className={inputCls("hire_price_b")}
            />
          </div>
          <div>
            <Label>Cleaning fee</Label>
            <CurrencyInput
              value={form.cleaning_fee}
              onChange={(v) => set("cleaning_fee", v)}
              className={inputCls("cleaning_fee")}
            />
          </div>
        </FormSection>


        {/* Section 4b: Security deposit */}
        <FormSection title="Security deposit (optional)">
          <div className="md:col-span-2">
            <CheckboxRow
              checked={form.requires_deposit}
              onChange={(v) => set("requires_deposit", v)}
              label="Require a security deposit"
            />
            <p className="mt-1 ml-7 text-xs text-muted-foreground">
              A refundable hold placed on the renter's card, released after the dress is returned in good condition. You can charge against it for damage or loss.
            </p>
          </div>
          {form.requires_deposit && (() => {
            const rrp = Number(form.rrp) || 0;
            const cap = Math.round(rrp * 0.3 * 100) / 100;
            return (
              <div className="md:col-span-2 ml-7">
                <Label required>Deposit amount (AUD)</Label>
                <CurrencyInput
                  value={form.deposit_amount}
                  onChange={(v) => set("deposit_amount", v)}
                  className={inputCls("deposit_amount")}
                />
                {errors.deposit_amount ? (
                  <ErrorText>{errors.deposit_amount}</ErrorText>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rrp > 0
                      ? `Max deposit for this RRP: $${cap.toFixed(2)}`
                      : "Enter an RRP above to see the maximum deposit."}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  The deposit is a hold, not income — it isn't added to your earnings.
                </p>
              </div>
            );
          })()}
        </FormSection>



        {/* Section 5: Pickup & try-on */}
        <FormSection title="Pickup & try-on (optional)">
          <div className="md:col-span-2 space-y-3">
            <CheckboxRow
              checked={form.pickup_available}
              onChange={(v) => set("pickup_available", v)}
              label="Available for pickup"
            />
            {form.pickup_available && (
              <div className="ml-7">
                <Label required>Pickup address</Label>
                <input
                  className={inputCls("pickup_address")}
                  value={form.pickup_address}
                  onChange={(e) => set("pickup_address", e.target.value)}
                />
                {errors.pickup_address && <ErrorText>{errors.pickup_address}</ErrorText>}
              </div>
            )}

            <CheckboxRow
              checked={form.try_on_available}
              onChange={(v) => set("try_on_available", v)}
              label="Available for try-on appointment"
            />
            {form.try_on_available && (
              <div className="ml-7 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Try-on address</Label>
                  <input
                    className={inputCls("try_on_address")}
                    value={form.try_on_address}
                    onChange={(e) => set("try_on_address", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Try-on price</Label>
                  <CurrencyInput
                    value={form.try_on_price}
                    onChange={(v) => set("try_on_price", v)}
                    className={inputCls("try_on_price")}
                  />
                </div>
              </div>
            )}
          </div>
        </FormSection>

        {/* Action bar */}
        <div className="flex items-center justify-between border-t pt-6">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard/listings" })}
            className="rounded-md border border-input bg-background px-5 py-2 text-sm font-medium hover:bg-accent"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 font-serif text-xl">{title}</h2>
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Label({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      <span>{label}</span>
    </label>
  );
}

function CurrencyInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        className={`${className ?? ""} pl-7`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
