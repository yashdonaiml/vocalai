import { createFileRoute } from "@tanstack/react-router";
import { openSession, runtimeHandler } from "@/lib/runtime/session.server";

// Runtime Service -> control plane: resolve bundle + credentials for a session (HMAC-signed).
export const Route = createFileRoute("/api/public/runtime/session")({
  server: { handlers: { POST: ({ request }) => runtimeHandler(request, (b) => openSession(b as never)) } },
});
