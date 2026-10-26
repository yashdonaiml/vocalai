import { createFileRoute } from "@tanstack/react-router";
import { cancelGoogleSheetsOAuth, completeGoogleSheetsOAuth } from "@/lib/google-oauth.server";

function redirect(path: string, outcome: "connected" | "error") {
  const target = new URL(path, "http://local.invalid");
  target.searchParams.set("google", outcome);
  return new Response(null, { status: 303, headers: { location: `${target.pathname}${target.search}` } });
}

export const Route = createFileRoute("/api/public/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        try {
          if (url.searchParams.get("error")) {
            const cancelled = await cancelGoogleSheetsOAuth(state);
            return redirect(cancelled.returnTo, "error");
          }
          const result = await completeGoogleSheetsOAuth(code, state);
          return redirect(result.returnTo, "connected");
        } catch {
          // State is deliberately not decoded into a return URL. An invalid or
          // replayed callback returns to the authenticated overview safely.
          return redirect("/overview", "error");
        }
      },
    },
  },
});

