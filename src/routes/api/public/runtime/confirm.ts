import { createFileRoute } from "@tanstack/react-router";
import { runtimeHandler } from "@/lib/runtime/session.server";
import { confirmAction } from "@/lib/runtime/actions.server";

export const Route = createFileRoute("/api/public/runtime/confirm")({
  server: { handlers: { POST: ({ request }) => runtimeHandler(request, confirmAction) } },
});
