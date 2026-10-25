import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/telephony/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["TELEPHONY_RECONCILE_SECRET"];
        if (!secret || secret.length < 32) return new Response("Not configured", { status: 503 });
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        const actual = Buffer.from(token),
          expected = Buffer.from(secret);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
          return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json(
            await (await import("@/lib/managed-telephony.server")).reconcileManagedNumbers(),
          );
        } catch {
          return new Response("Could not reconcile phone numbers", { status: 503 });
        }
      },
    },
  },
});
