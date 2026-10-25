import { createFileRoute } from "@tanstack/react-router";
import { retrieve, runtimeHandler } from "@/lib/runtime/session.server";

export const Route = createFileRoute("/api/public/runtime/retrieve")({
  server: { handlers: { POST: ({ request }) => runtimeHandler(request, (b) => retrieve(b as never)) } },
});
