import { createFileRoute } from "@tanstack/react-router";
import { AssistantSetup } from "@/components/assistant-setup";
import { DeveloperAccessGate } from "@/components/developer-access-gate";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/assistant-setup/$agentId")({
  head: () => ({
    meta: [
      { title: "Set up your enquiry assistant: VocollAI" },
      {
        name: "description",
        content: "Describe your business, try a voice preview, and verify a saved enquiry.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupRoute,
});

function SetupRoute() {
  const { agentId } = Route.useParams();
  const workspace = useWorkspace();
  return (
    <DeveloperAccessGate>
      <AssistantSetup
        key={`${workspace.id}:${agentId}`}
        workspaceId={workspace.id}
        agentId={agentId}
      />
    </DeveloperAccessGate>
  );
}
