import { createFileRoute } from "@tanstack/react-router";
import { runtimeHandler } from "@/lib/runtime/session.server";
import { cancelAction } from "@/lib/runtime/actions.server";

export const Route = createFileRoute("/api/public/runtime/cancel")({
  server: { handlers: { POST: ({ request }) => runtimeHandler(request, cancelAction) } },
});
