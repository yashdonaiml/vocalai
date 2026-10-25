import { createFileRoute } from "@tanstack/react-router";
import { callTool, runtimeHandler } from "@/lib/runtime/session.server";

export const Route = createFileRoute("/api/public/runtime/tool")({
  server: { handlers: { POST: ({ request }) => runtimeHandler(request, (b) => callTool(b as never)) } },
});
