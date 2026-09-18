import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  lenderId: string;
  /** Compact pill button vs full magenta button */
  size?: "sm" | "md";
  className?: string;
};

type ExistingReview = { id: string; rating: number | null } | null;

export function WriteReviewButton({ bookingId, lenderId, size = "sm", className }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const key = ["my-review", bookingId, user?.id];
  const { data: existing, isLoading } = useQuery<ExistingReview>({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews" as any)
        .select("id, rating")
        .eq("booking_id", bookingId)
        .eq("reviewer_id", user!.id)
        .maybeSingle();
      if (error && (error as any).code !== "PGRST116") {
        // Table missing or other read error — treat as none, don't blow up the card.
        return null;
      }
      return (data as any) ?? null;
    },
  });

  if (!user) return null;
  if (isLoading) return null;

  if (existing) {
    return <ReviewedPill rating={existing.rating ?? 0} className={className} />;
  }

  const isFull = size === "md";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          isFull
            ? "btn-magenta inline-flex items-center justify-center gap-1.5 text-xs"
            : "inline-flex items-center gap-1.5 rounded-full border border-magenta px-3 py-1.5 text-[11px] font-medium text-magenta hover:bg-magenta hover:text-white transition-colors",
          className,
        )}
      >
        <Star className={cn(isFull ? "h-3.5 w-3.5" : "h-3 w-3")} />
        Write a review
      </button>
      <ReviewDialog
        open={open}
        onOpenChange={setOpen}
        bookingId={bookingId}
        lenderId={lenderId}
        onSubmitted={(rating) => {
          qc.setQueryData<ExistingReview>(key, { id: "local", rating });
          qc.invalidateQueries({ queryKey: ["lender-profile-reviews", lenderId] });
        }}
      />
    </>
  );
}

function ReviewedPill({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800",
        className,
      )}
    >
      <span>Reviewed</span>
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              "h-3 w-3",
              n <= rating ? "fill-amber-500 text-amber-500" : "text-emerald-800/30",
            )}
          />
        ))}
      </span>
    </span>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  bookingId,
  lenderId,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bookingId: string;
  lenderId: string;
  onSubmitted: (rating: number) => void;
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [publicReview, setPublicReview] = useState("");
  const [privateFeedback, setPrivateFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRating(0);
    setHover(0);
    setPublicReview("");
    setPrivateFeedback("");
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (rating < 1) {
      toast.error("Please choose a star rating.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("reviews" as any).insert({
      booking_id: bookingId,
      reviewer_id: user.id,
      reviewee_id: lenderId,
      rating,
      public_review: publicReview.trim() || null,
      private_feedback: privateFeedback.trim() || null,
    });
    setBusy(false);
    if (error) {
      // Uniqueness violation = already reviewed; collapse to that state.
      if ((error as any).code === "23505") {
        toast.message("You've already reviewed this booking.");
        onSubmitted(rating);
        onOpenChange(false);
        reset();
        return;
      }
      toast.error(error.message ?? "Could not submit review.");
      return;
    }
    toast.success("Thanks for your review!");
    onSubmitted(rating);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write a review</DialogTitle>
          <DialogDescription>
            Share how your rental went. Public reviews help other renters; private feedback is only seen by the lender.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium text-ink">Your rating</label>
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = (hover || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onClick={() => setRating(n)}
                    className="p-1"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  >
                    <Star
                      className={cn(
                        "h-7 w-7 transition-colors",
                        filled ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink">Public review</label>
            <textarea
              value={publicReview}
              onChange={(e) => setPublicReview(e.target.value)}
              rows={4}
              placeholder="How was the dress and the lender? This will be visible on their profile."
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-magenta/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink">
              Private feedback <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={privateFeedback}
              onChange={(e) => setPrivateFeedback(e.target.value)}
              rows={3}
              placeholder="Anything you'd like to tell the lender privately."
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-magenta/40"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg-tint"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || rating < 1}
            className="rounded-md bg-magenta px-4 py-2 text-sm font-medium text-white hover:bg-magenta/90 disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
