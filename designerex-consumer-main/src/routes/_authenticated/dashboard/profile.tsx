import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { Check, Upload, Building2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CityAutocomplete, type CityRow } from "@/components/CityAutocomplete";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "@/components/ui/simple-select";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  ssr: false,
  component: ProfileDetails,
});

/* ─── helpers ─── */
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
const MONTHS = [
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
];
const YEARS = Array.from({ length: 100 }, (_, i) => String(1925 + i));

function parseDob(dateStr: string | null | undefined) {
  if (!dateStr) return { day: "", month: "", year: "" };
  const [y, m, d] = dateStr.split("-");
  return { day: d ?? "", month: m ?? "", year: y ?? "" };
}

function buildDob(day: string, month: string, year: string) {
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
}

/* ─── component ─── */
function ProfileDetails() {
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    date_of_birth: "",
    bio: "",
    instagram_url: "",
    city_id: "" as string | "",
    avatar_url: "" as string | null,
    /* new fields from spec */
    business_name: "",
    abn: "",
    
    rental_period: "A" as "A" | "B",
  });

  const [isBusiness, setIsBusiness] = useState(false);

  /* hydrate */
  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      phone: ((profile as any).phone ?? profile.mobile_number ?? ""),
      date_of_birth: profile.date_of_birth ?? "",
      bio: ((profile as any).bio as string) ?? "",
      instagram_url: ((profile as any).instagram_url as string) ?? "",
      city_id: ((profile as any).city_id as string) ?? "",
      avatar_url: profile.avatar_url ?? null,
      business_name: ((profile as any).business_name as string) ?? "",
      abn: ((profile as any).abn as string) ?? "",
      
      rental_period: ((profile as any).rental_period as "A" | "B") ?? "A",
    }));
    setIsBusiness(Boolean((profile as any).is_business));
  }, [profile]);

  /* city autocomplete */
  const [selectedCity, setSelectedCity] = useState<CityRow | null>(null);
  useEffect(() => {
    if (!form.city_id) { setSelectedCity(null); return; }
    if (selectedCity?.id === form.city_id) return;
    supabase.from("cities").select("id, name, slug").eq("id", form.city_id).maybeSingle()
      .then(({ data }) => { if (data) setSelectedCity(data as CityRow); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.city_id]);

  /* dob selects */
  const dob = useMemo(() => parseDob(form.date_of_birth), [form.date_of_birth]);
  const dobLocked = !!profile?.date_of_birth;
  const setDobPart = (part: "day" | "month" | "year", val: string) => {
    if (dobLocked) return;
    const next = buildDob(
      part === "day" ? val : dob.day,
      part === "month" ? val : dob.month,
      part === "year" ? val : dob.year,
    );
    setForm((f) => ({ ...f, date_of_birth: next }));
  };

  /* avatar upload */
  const handleAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (updErr) throw updErr;
      setForm((f) => ({ ...f, avatar_url: url }));
      await refreshProfile();
      toast.success("Photo updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't upload photo.");
    } finally {
      setUploading(false);
    }
  };

  /* save */
  const save = async () => {
    if (!user) return;
    if (!form.first_name || !form.last_name) {
      toast.error("First and last name are required.");
      return;
    }
    setSaving(true);
    const city = selectedCity && selectedCity.id === form.city_id ? selectedCity : null;
    const payload: Record<string, any> = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone || null,
      mobile_number: form.phone || null,
      bio: form.bio || null,
      instagram_url: form.instagram_url || null,
      city_id: form.city_id || null,
      business_name: isBusiness ? (form.business_name || null) : null,
      abn: isBusiness ? (form.abn || null) : null,
      is_business: isBusiness,
      
      rental_period: form.rental_period,
    };
    if (!profile?.date_of_birth && form.date_of_birth) payload.date_of_birth = form.date_of_birth;
    if (city) {
      payload.latitude = city.latitude ?? null;
      payload.longitude = city.longitude ?? null;
    }
    let attempt = { ...payload };
    for (let i = 0; i < 8; i++) {
      const { error } = await supabase.from("profiles").update(attempt).eq("id", user.id);
      if (!error) break;
      const m = error.message.match(/column "?([a-z_]+)"? of relation/i) ?? error.message.match(/'([^']+)' column/);
      if (m && m[1] in attempt) { delete attempt[m[1]]; continue; }
      toast.error(error.message);
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
    toast.success("Profile updated.");
  };

  const phoneVerified = Boolean((profile as any)?.phone_verified);

  return (
    <div>
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl text-ink">Profile Details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your personal and business information.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">* Required</span>
      </div>

      <div className="card-surface mt-6 space-y-10">
        {/* ── avatar ── */}
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-muted border border-border">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                {form.first_name?.[0]?.toUpperCase()}{form.last_name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-outline text-xs py-2 px-3"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">JPG or PNG, max ~5MB.</p>
          </div>
        </div>

        {/* ── Your Details ── */}
        <section>
          <SectionTitle>Your Details</SectionTitle>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="First Name *">
              <input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Last Name *">
              <input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="input"
              />
            </Field>

            <Field label="Date of Birth">
              <div className="grid grid-cols-3 gap-2">
                <SimpleSelect
                  value={dob.day}
                  disabled={dobLocked}
                  aria-label="Day of birth"
                  placeholder="Day"
                  onValueChange={(v) => setDobPart("day", v)}
                  className={cn(dobLocked && "bg-muted text-muted-foreground")}
                  options={DAYS.map((d) => ({ value: d, label: d }))}
                />
                <SimpleSelect
                  value={dob.month}
                  disabled={dobLocked}
                  aria-label="Month of birth"
                  placeholder="Month"
                  onValueChange={(v) => setDobPart("month", v)}
                  className={cn(dobLocked && "bg-muted text-muted-foreground")}
                  options={MONTHS.map((m) => ({ value: m, label: m }))}
                />
                <SimpleSelect
                  value={dob.year}
                  disabled={dobLocked}
                  aria-label="Year of birth"
                  placeholder="Year"
                  onValueChange={(v) => setDobPart("year", v)}
                  className={cn(dobLocked && "bg-muted text-muted-foreground")}
                  options={YEARS.map((y) => ({ value: y, label: y }))}
                />
              </div>
              {dobLocked && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Date of birth is set and can&apos;t be changed.
                </p>
              )}
            </Field>

            <Field label="Email Address">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input value={user?.email ?? ""} readOnly className="input min-w-0 bg-muted text-muted-foreground" />
                <span className="badge-success inline-flex shrink-0 items-center gap-1">
                  <Check className="h-3 w-3" /> Verified
                </span>
              </div>
            </Field>

            <Field label="Mobile Number" className="sm:col-span-2">
              <div className="relative">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input pr-28"
                  placeholder="04xx xxx xxx"
                />
                {phoneVerified && (
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
                    <span className="inline-flex items-center gap-1 badge-success">
                      <Check className="h-3 w-3" /> Verified
                    </span>
                    <button type="button" className="text-[11px] text-magenta hover:underline">
                      Change
                    </button>
                  </div>
                )}
              </div>
            </Field>
          </div>
        </section>

        {/* ── Business ── */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-magenta"
            checked={isBusiness}
            onChange={(e) => setIsBusiness(e.target.checked)}
          />
          <span className="text-sm text-ink">Tick only if you are a business</span>
        </label>

        {isBusiness && (
          <section className="-mt-4">
            <SectionTitle icon={Building2}>Business Information</SectionTitle>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Business Name">
                <input
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="ABN">
                <input
                  value={form.abn}
                  onChange={(e) => setForm({ ...form, abn: e.target.value })}
                  className="input"
                  placeholder="12 345 678 901"
                />
              </Field>
            </div>
          </section>
        )}

        {/* ── Additional fields (preserved from existing) ── */}
        <section>
          <SectionTitle>Additional Information</SectionTitle>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Location (city)" className="sm:col-span-2">
              <CityAutocomplete
                value={selectedCity}
                onChange={(c) => { setSelectedCity(c); setForm({ ...form, city_id: c?.id ?? "" }); }}
              />
            </Field>
            <Field label="Instagram URL" className="sm:col-span-2">
              <input
                value={form.instagram_url}
                onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
                className="input"
                placeholder="https://instagram.com/…"
              />
            </Field>
            <Field label={`Bio (${form.bio.length}/250)`} className="sm:col-span-2">
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value.slice(0, 250) })}
                rows={4}
                className="input resize-none"
              />
            </Field>
          </div>
        </section>


        {/* ── Rental Period ── */}
        <section>
          <SectionTitle icon={CalendarDays}>Rental Period</SectionTitle>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <RadioCard
              label="Days — Rental Period A"
              sub="default"
              selected={form.rental_period === "A"}
              onSelect={() => setForm({ ...form, rental_period: "A" })}
            />
            <RadioCard
              label="Days — Rental Period B"
              sub="if applicable"
              selected={form.rental_period === "B"}
              onSelect={() => setForm({ ...form, rental_period: "B" })}
            />
          </div>
        </section>

        {/* ── footer ── */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <button type="button" className="text-sm text-muted-foreground hover:text-ink transition-colors">
            Cancel my account
          </button>
          <button onClick={save} disabled={saving} className="btn-magenta text-sm">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── sub-components ─── */
function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
        {children}
      </h3>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function RadioCard({ label, sub, selected, onSelect }: { label: string; sub: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-1 items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        selected ? "border-magenta bg-bg-tint" : "border-border bg-surface hover:border-rose",
      )}
    >
      <span className={cn(
        "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border",
        selected ? "border-magenta" : "border-muted-foreground",
      )}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-magenta" />}
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </button>
  );
}