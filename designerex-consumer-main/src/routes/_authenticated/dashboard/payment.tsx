import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CreditCard,
  Lock,
  Plus,
  MoreVertical,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated/dashboard/payment")({
  ssr: false,
  component: PaymentDetails,
});

/* ─── types ─── */
type SavedCard = {
  id: string;
  brand: "visa" | "mastercard" | "amex";
  last4: string;
  expiry: string;
  isDefault: boolean;
};

/* ─── component ─── */
function PaymentDetails() {
  const { user } = useAuth();
  const [openAddCard, setOpenAddCard] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", cvc: "" });

  /* saved cards (mock — replace with real fetch when Stripe wiring exists) */
  const [savedCards, setSavedCards] = useState<SavedCard[]>([
    { id: "card-1", brand: "visa", last4: "2542", expiry: "12/27", isDefault: true },
  ]);

  const [selectedCardId, setSelectedCardId] = useState("card-1");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  /* payout form */
  const [payout, setPayout] = useState({
    accountName: "",
    accountNumber: "",
    bsb: "",
  });
  const [payoutOriginal, setPayoutOriginal] = useState({ ...payout });
  const [savingPayout, setSavingPayout] = useState(false);

  const setDefaultCard = (id: string) => {
    setSavedCards((prev) =>
      prev.map((c) => ({ ...c, isDefault: c.id === id }))
    );
    setSelectedCardId(id);
    setMenuOpenId(null);
  };

  const removeCard = (id: string) => {
    setSavedCards((prev) => prev.filter((c) => c.id !== id));
    if (selectedCardId === id) setSelectedCardId("");
    setMenuOpenId(null);
  };

  const brandMark = (brand: SavedCard["brand"]) => {
    if (brand === "visa")
      return (
        <div className="flex h-8 w-12 items-center justify-center rounded bg-ink text-[10px] font-bold text-white tracking-wider">
          VISA
        </div>
      );
    if (brand === "mastercard")
      return (
        <div className="flex h-8 w-12 items-center justify-center rounded bg-ink text-[10px] font-bold text-white tracking-wider">
          MC
        </div>
      );
    return (
      <div className="flex h-8 w-12 items-center justify-center rounded bg-ink text-[10px] font-bold text-white tracking-wider">
        AMEX
      </div>
    );
  };

  const hasPayoutChanges =
    payout.accountName !== payoutOriginal.accountName ||
    payout.accountNumber !== payoutOriginal.accountNumber ||
    payout.bsb !== payoutOriginal.bsb;

  const cancelPayout = () => setPayout({ ...payoutOriginal });

  const savePayout = async () => {
    if (!user) return;
    setSavingPayout(true);
    /* placeholder — wire to real bank_account table when schema exists */
    await new Promise((r) => setTimeout(r, 600));
    setSavingPayout(false);
    setPayoutOriginal({ ...payout });
    toast.success("Payout details saved.");
  };

  return (
    <div>
      {/* Panel header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-ink">Payment Details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your payment method for rentals and your payout details for earnings.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* LEFT — Payment Method */}
        <section>
          <h3 className="mb-5 font-heading text-lg text-ink">Payment Method</h3>

          {/* Security note */}
          <div className="mb-5 flex items-start gap-3 rounded-lg bg-bg-tint p-4">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-magenta" />
            <p className="text-sm text-ink-muted">
              Your payment details are securely stored by Stripe.{" "}
              <strong className="text-ink">Designerex never stores your full card number.</strong>
            </p>
          </div>

          {/* Saved cards */}
          <div className="space-y-3">
            {savedCards.map((c) => (
              <div
                key={c.id}
                className={`relative flex items-center gap-4 rounded-lg border bg-surface p-4 transition-colors ${
                  selectedCardId === c.id ? "border-magenta" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  checked={selectedCardId === c.id}
                  onChange={() => setSelectedCardId(c.id)}
                  className="accent-magenta"
                />
                {brandMark(c.brand)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {c.brand.charAt(0).toUpperCase() + c.brand.slice(1)} **** {c.last4}
                  </p>
                  <p className="text-xs text-muted-foreground">Expires {c.expiry}</p>
                </div>
                {c.isDefault && (
                  <span className="rounded-full bg-pink-soft px-2.5 py-0.5 text-[10px] uppercase tracking-wider-display text-magenta">
                    Default
                  </span>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setMenuOpenId((id) => (id === c.id ? null : c.id))
                    }
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-ink"
                    aria-label="Card options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpenId === c.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-border bg-surface py-1 shadow-lg">
                        {!c.isDefault && (
                          <button
                            onClick={() => setDefaultCard(c.id)}
                            className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-muted"
                          >
                            Set as default
                          </button>
                        )}
                        <button
                          onClick={() => removeCard(c.id)}
                          className="w-full px-3 py-2 text-left text-sm text-magenta hover:bg-muted"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Afterpay (coming soon) */}
            <div className="flex items-center gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 opacity-60">
              <div className="flex h-8 w-12 items-center justify-center rounded bg-ink/60 text-[10px] font-bold text-white tracking-wider">
                AP
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  Afterpay — Rent Now. Pay Later
                </p>
                <p className="text-xs text-muted-foreground">
                  4 interest-free payments
                </p>
              </div>
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] text-muted-foreground">
                Coming soon
              </span>
            </div>
          </div>

          <button
            onClick={() => setOpenAddCard(true)}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-magenta hover:underline"
            type="button"
          >
            <Plus className="h-4 w-4" /> Add new payment method
          </button>
        </section>

        {/* RIGHT — Payout Details */}
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="mb-5 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-heading text-lg text-ink">Payout Details</h3>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            This is where your earnings from completed rentals will be paid.
          </p>

          <div className="grid gap-4">
            <Field label="Account Name *">
              <input
                className="input"
                value={payout.accountName}
                onChange={(e) =>
                  setPayout((p) => ({ ...p, accountName: e.target.value }))
                }
              />
            </Field>
            <Field label="Account Number *">
              <input
                className="input"
                inputMode="numeric"
                value={payout.accountNumber}
                onChange={(e) =>
                  setPayout((p) => ({
                    ...p,
                    accountNumber: e.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </Field>
            <Field label="BSB *">
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                placeholder="000-000"
                value={payout.bsb}
                onChange={(e) =>
                  setPayout((p) => ({
                    ...p,
                    bsb: e.target.value.replace(/\D/g, "").slice(0, 6),
                  }))
                }
              />
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={cancelPayout}
              disabled={!hasPayoutChanges}
              className="btn-outline text-xs disabled:opacity-40"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={savePayout}
              disabled={!hasPayoutChanges || savingPayout}
              className="btn-magenta text-xs"
              type="button"
            >
              {savingPayout ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </section>
      </div>

      {/* Add-card modal */}
      {openAddCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenAddCard(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-magenta" />
              <h3 className="font-display text-2xl text-ink">Add card</h3>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Test mode — no real charge.
            </p>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Card number"
                value={cardForm.number}
                onChange={(e) =>
                  setCardForm((f) => ({ ...f, number: e.target.value }))
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder="MM / YY"
                  value={cardForm.expiry}
                  onChange={(e) =>
                    setCardForm((f) => ({ ...f, expiry: e.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="CVC"
                  value={cardForm.cvc}
                  onChange={(e) =>
                    setCardForm((f) => ({ ...f, cvc: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpenAddCard(false)}
                className="btn-outline text-xs"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setOpenAddCard(false);
                  toast.success("Card saved (mock — Stripe integration pending).");
                }}
                className="btn-magenta text-xs"
                type="button"
              >
                Save card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── sub-components ─── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
