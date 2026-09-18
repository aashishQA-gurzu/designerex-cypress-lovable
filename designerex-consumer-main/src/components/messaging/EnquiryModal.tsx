import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { findOrCreateEnquiry } from "@/lib/messaging";

export function EnquiryModal({
  open,
  onClose,
  dressId = null,
  dressTitle,
  lenderId,
  lenderFirstName,
  renterId,
}: {
  open: boolean;
  onClose: () => void;
  dressId?: string | null;
  dressTitle?: string;
  lenderId: string;
  lenderFirstName: string;
  renterId: string;
}) {
  const navigate = useNavigate();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const id = await findOrCreateEnquiry({ dressId, renterId, lenderId, body: text });
      toast.success("Message sent");
      onClose();
      setBody("");
      navigate({ to: "/dashboard/messages", search: { c: id } });
    } catch (e: any) {
      console.error("[Enquiry] failed", e);
      toast.error(e?.message ?? "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {dressTitle ? `Ask ${lenderFirstName} about ${dressTitle}` : `Message ${lenderFirstName}`}
          </DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="What would you like to know? e.g. 'Does this run true to size?'"
          className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm focus:border-pink focus:outline-none"
        />
        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="rounded-full bg-pink px-4 py-2 text-sm font-medium text-pink-foreground disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
