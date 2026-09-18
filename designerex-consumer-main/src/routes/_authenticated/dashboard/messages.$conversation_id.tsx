import { createFileRoute } from "@tanstack/react-router";
import { ConversationThread } from "@/components/messaging/ConversationThread";

export const Route = createFileRoute("/_authenticated/dashboard/messages/$conversation_id")({
  component: ThreadPage,
});

function ThreadPage() {
  const { conversation_id } = Route.useParams();
  return <ConversationThread conversationId={conversation_id} />;
}
