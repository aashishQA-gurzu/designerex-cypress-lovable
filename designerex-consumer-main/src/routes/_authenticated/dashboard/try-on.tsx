import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LenderGate } from "@/components/auth/LenderGate";
import { resilientProfileUpdate } from "@/lib/profile-update";
import { Switch } from "@/components/ui/switch";
import { SimpleSelect } from "@/components/ui/simple-select";

export const Route = createFileRoute("/_authenticated/dashboard/try-on")({
  ssr: false,
  component: () => (
    <LenderGate>
      <TryOnSettingsPage />
    </LenderGate>
  ),
});

type AddressRow = {
  id: string;
  label: string | null;
  address_line_1: string;
  suburb: string;
  state: string | null;
  postcode: string;
};

function addressLabel(a: AddressRow) {
  const head = a.label?.trim() || "Address";
  return `${head} — ${a.address_line_1}, ${a.suburb} ${a.state ?? ""} ${a.postcode}`.replace(/\s+/g, " ").trim();
}

function TryOnSettingsPage() {
  const { user, profile, refreshProfile } = useAuth();

  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState<string>("");
  const [addressId, setAddressId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const p: any = profile;
    setEnabled(!!p.try_on_enabled);
    setPrice(p.try_on_price != null ? String(p.try_on_price) : "");
    setAddressId(p.try_on_address_id ?? "");
  }, [profile]);

  const { data: addresses = [] } = useQuery({
    queryKey: ["user-addresses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_addresses")
        .select("id, label, address_line_1, suburb, state, postcode")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AddressRow[];
    },
  });

  const { data: lock } = useQuery({
    queryKey: ["try-on-location-locked", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_try_on_location_locked", {
        p_lender: user!.id,
      } as any);
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      return { locked: !!row?.locked, open_try_ons: Number(row?.open_try_ons ?? 0) };
    },
  });
  const locked = !!lock?.locked;

  const priceNum = Number(price);
  const { data: preview } = useQuery({
    queryKey: ["try-on-preview", price],
    enabled: Number.isFinite(priceNum) && priceNum > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dx_try_on_preview", { price: priceNum } as any);
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        renter_pays: Number(row.renter_pays ?? row.renter_total ?? 0),
        lender_receives: Number(row.lender_receives ?? row.you_receive ?? 0),
      };
    },
  });

  const save = async () => {
    if (!user) return;
    setError(null);
    setSaved(false);

    const hasFee = Number.isFinite(priceNum) && priceNum > 0;
    const hasAddress = !!addressId;

    if (enabled && (!hasFee || !hasAddress)) {
      setEnabled(false);
      setError("Set a try-on fee and pickup address before turning try-ons on");
      return;
    }

    const payload: Record<string, unknown> = {
      try_on_enabled: enabled,
      try_on_price: hasFee ? priceNum : null,
    };
    if (!locked) payload.try_on_address_id = addressId || null;

    setSaving(true);
    const { error: err } = await resilientProfileUpdate(user.id, payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      toast.error(err.message);
      return;
    }
    await refreshProfile();
    setSaved(true);
    toast.success("Try-on settings saved.");
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl text-ink">Try-Ons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Let renters see the dress in person before they commit.
          </p>
        </div>
        <Sparkles className="h-6 w-6 text-muted-foreground" />
      </div>

      <div className="card-surface mt-6 space-y-6">
        <p className="text-sm text-ink leading-relaxed">
          Let renters try a dress on in person before they book it. Turning this on offers
          try-ons across ALL your listings at a single fee. Try-ons are in-person pickup
          only, always one day, and block that date in your calendar the same way a hire does.
        </p>

        {/* Toggle row */}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-bg p-4">
          <div>
            <p className="text-sm font-medium text-ink">Offer try-ons</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Applies to every listing on your account.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(next) => { setError(null); setSaved(false); setEnabled(next); }}
            aria-label="Toggle try-ons"
          />
        </div>

        {enabled && (
          <div className="space-y-6">
            {/* Fee */}
            <div>
              <label htmlFor="try-on-fee" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                Try-on fee <span className="text-magenta">*</span>
              </label>
              <input
                id="try-on-fee"
                type="number"
                min={0}
                step="1"
                className="input w-full max-w-xs"
                value={price}
                onChange={(e) => { setError(null); setPrice(e.target.value); }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                This is what you receive. The renter pays a 10% service fee on top.
              </p>
              {preview && (
                <p className="mt-2 text-sm font-medium text-ink">
                  Renter pays ${preview.renter_pays.toFixed(2)} · You receive $
                  {preview.lender_receives.toFixed(2)}
                </p>
              )}
            </div>

            {/* Pickup address */}
            <div>
              <label htmlFor="try-on-address" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                Pickup address <span className="text-magenta">*</span>
              </label>
              <SimpleSelect
                id="try-on-address"
                className="w-full max-w-xl disabled:cursor-not-allowed disabled:opacity-60"
                value={addressId}
                disabled={locked}
                placeholder="Select an address…"
                onValueChange={(v) => { setError(null); setAddressId(v); }}
                options={addresses.map((a) => ({ value: a.id, label: addressLabel(a) }))}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Choose which of your saved addresses renters collect from. If you keep stock
                at a shop as well as at home, save both on the Delivery Address page and pick
                the right one here.
              </p>
              <Link to="/dashboard/addresses" className="mt-1.5 inline-block text-xs text-magenta hover:underline">
                Add or edit addresses
              </Link>

              {locked && (
                <div className="callout-info mt-3">
                  <Lock data-callout-icon className="mt-0.5 h-5 w-5" />
                  <div>
                    <p data-callout-body>
                      You have {lock?.open_try_ons} try-on booking(s) still to happen, so the
                      pickup address is locked until they&apos;re complete or cancelled.
                      Renters have already been told where to go.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn-magenta text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && (
            <p role="status" className="text-sm font-medium text-ink">Try-on settings saved.</p>
          )}
        </div>
      </div>
    </div>
  );
}
