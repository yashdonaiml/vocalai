import { createFileRoute } from "@tanstack/react-router";
import { AgentBuilderChat } from "@/components/agent-builder-chat";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/builder/$agentId")({
  head: () => ({
    meta: [
      { title: "Build your assistant: VocollAI" },
      {
        name: "description",
        content: "Describe the business job, review proposed changes, and launch safely.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BuilderRoute,
});

function BuilderRoute() {
  const { agentId } = Route.useParams();
  const workspace = useWorkspace();
  return (
    <AgentBuilderChat
      key={`${workspace.id}:${agentId}`}
      workspaceId={workspace.id}
      agentId={agentId}
    />
  );
}
