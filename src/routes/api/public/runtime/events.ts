import { createFileRoute } from "@tanstack/react-router";
import { ingestEvents, runtimeHandler } from "@/lib/runtime/session.server";

export const Route = createFileRoute("/api/public/runtime/events")({
  server: { handlers: { POST: ({ request }) => runtimeHandler(request, (b) => ingestEvents(b as never)) } },
});
