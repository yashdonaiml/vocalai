import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/events/deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const result = await (await import("@/lib/events.server")).deliverEvents({ limit: 50 });
          return Response.json(result, { status: result.failed ? 503 : 200 });
        } catch {
          return new Response("Could not deliver webhook events", { status: 503 });
        }
      },
    },
  },
});
