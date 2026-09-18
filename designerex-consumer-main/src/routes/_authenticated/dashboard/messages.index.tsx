import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/messages/")({
  component: () => (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      <MessageCircle className="h-10 w-10 opacity-40" />
      <p className="text-sm">Select a conversation from the list</p>
    </div>
  ),
});
