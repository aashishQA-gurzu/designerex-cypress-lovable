import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resilientAddressWrite } from "@/lib/address-write";
import { SimpleSelect } from "@/components/ui/simple-select";

const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

export const Route = createFileRoute("/_authenticated/dashboard/addresses")({
  ssr: false,
  component: AddressesPage,
});

type Address = {
  id: string;
  user_id: string;
  label: string | null;
  address_line_1: string;
  address_line_2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  city_id?: string | null;
  is_default: boolean | null;
};

const blank = {
  label: "",
  address_line_1: "",
  address_line_2: "",
  suburb: "",
  postcode: "",
  state: "",
  country: "Australia",
  is_default: false,
  city_id: null as string | null,
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider-display text-muted-foreground">
        {label} {required && <span className="text-magenta">*</span>}
      </span>
      {children}
    </label>
  );
}

function AddressesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Address> | null>(null);

  const { data: addresses } = useQuery({
    queryKey: ["dashboard-addresses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Address[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["dashboard-addresses", user?.id] });

  const save = async () => {
    if (!user || !editing) return;
    if (!editing.address_line_1 || !editing.suburb || !editing.postcode || !editing.state) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!/^\d{4}$/.test(editing.postcode)) {
      toast.error("Postcode must be 4 digits.");
      return;
    }
    const payload: Record<string, any> = {
      user_id: user.id,
      label: editing.label || null,
      address_line_1: editing.address_line_1,
      address_line_2: editing.address_line_2 || null,
      suburb: editing.suburb,
      postcode: editing.postcode,
      state: editing.state,
      country: editing.country || "Australia",
      is_default: Boolean(editing.is_default),
    };
    if (editing.id && editing.city_id) payload.city_id = editing.city_id;
    if (payload.is_default) {
      await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id);
    }
    const { error } = await resilientAddressWrite(payload, editing.id ? { update: editing.id } : {});
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Address saved.");
    setEditing(null);
    refresh();
  };

  const setDefault = async (id: string) => {
    if (!user) return;
    await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id);
    const { error } = await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this address?")) return;
    const { error } = await supabase.from("user_addresses").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Address removed.");
    refresh();
  };

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-magenta";

  return (
    <div>
      {/* Panel header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-ink">Delivery Address</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your delivery addresses for rentals and returns.
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          <span className="text-magenta">*</span> Required
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* LEFT — Add / Edit form */}
        <section className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-5 font-heading text-lg text-ink">
            {editing?.id ? "Edit Address" : "Add / Edit Address"}
          </h3>

          <div className="grid gap-4">
            <Field label="Label (e.g. Home, Work)">
              <input
                className={inputCls}
                value={editing?.label ?? ""}
                onChange={(e) => setEditing({ ...(editing ?? blank), label: e.target.value })}
              />
            </Field>

            <Field label="Address Line 1" required>
              <input
                className={inputCls}
                value={editing?.address_line_1 ?? ""}
                onChange={(e) => setEditing({ ...(editing ?? blank), address_line_1: e.target.value })}
              />
            </Field>

            <Field label="Address Line 2">
              <input
                className={inputCls}
                value={editing?.address_line_2 ?? ""}
                onChange={(e) => setEditing({ ...(editing ?? blank), address_line_2: e.target.value })}
              />
            </Field>

            <Field label="Suburb" required>
              <input
                className={inputCls}
                value={editing?.suburb ?? ""}
                onChange={(e) => setEditing({ ...(editing ?? blank), suburb: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="State" required>
                <SimpleSelect
                  className={inputCls}
                  aria-label="State"
                  placeholder="Select"
                  value={editing?.state ?? ""}
                  onValueChange={(v) => setEditing({ ...(editing ?? blank), state: v })}
                  options={AU_STATES.map((s) => ({ value: s, label: s }))}
                />
              </Field>

              <Field label="Postcode" required>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  maxLength={4}
                  value={editing?.postcode ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...(editing ?? blank),
                      postcode: e.target.value.replace(/\D/g, "").slice(0, 4),
                    })
                  }
                />
              </Field>
            </div>

            <Field label="Country" required>
              <input
                className={`${inputCls} bg-muted text-muted-foreground`}
                value={editing?.country ?? "Australia"}
                readOnly
              />
            </Field>

            <label className="mt-1 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="accent-magenta"
                checked={Boolean(editing?.is_default)}
                onChange={(e) =>
                  setEditing({ ...(editing ?? blank), is_default: e.target.checked })
                }
              />
              Set as default address
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setEditing(null)}
              className="btn-outline text-xs"
              type="button"
            >
              Cancel
            </button>
            <button onClick={save} className="btn-magenta text-xs" type="button">
              Validate & Save
            </button>
          </div>
        </section>

        {/* RIGHT — Saved addresses */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-heading text-lg text-ink">Saved Addresses</h3>
          </div>

          <div className="grid gap-4">
            {(addresses ?? []).map((a) => (
              <article
                key={a.id}
                className="relative rounded-lg border border-border bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {a.label && (
                      <p className="font-heading text-sm text-ink">{a.label}</p>
                    )}
                    <p className="mt-1 text-sm text-ink leading-relaxed">
                      {a.address_line_1}
                      {a.address_line_2 ? `, ${a.address_line_2}` : ""}
                      <br />
                      {a.suburb} {a.state} {a.postcode}
                      <br />
                      <span className="text-muted-foreground">{a.country}</span>
                    </p>
                    {a.is_default && (
                      <span className="mt-3 inline-block rounded-full bg-pink-soft px-2.5 py-0.5 text-[10px] uppercase tracking-wider-display text-magenta">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!a.is_default && (
                      <button
                        onClick={() => setDefault(a.id)}
                        title="Set as default"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-ink"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setEditing(a)}
                      title="Edit"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(a.id)}
                      title="Delete"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-magenta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {(addresses ?? []).length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted-foreground">
                No addresses saved yet.
              </div>
            )}

            <button
              onClick={() => setEditing(blank)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-magenta/40 bg-pink-soft/40 px-4 py-3 text-sm font-medium text-magenta transition hover:bg-pink-soft"
              type="button"
            >
              <Plus className="h-4 w-4" /> Add New Address
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
