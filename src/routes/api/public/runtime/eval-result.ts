import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { runtimeHandler } from "@/lib/runtime/session.server";

// Trusted workers submit evidence for a previously frozen runtime run, never arbitrary scores.
const Body = z.object({
  runId: z.string().uuid(),
  items: z.array(z.object({ caseId: z.string().uuid(), passed: z.boolean(), notes: z.string().min(1).max(2000), response: z.string().min(1).max(12000) }).strict()).min(1).max(20),
}).strict();

export const Route = createFileRoute("/api/public/runtime/eval-result")({
  server: {
    handlers: {
      POST: ({ request }) =>
        runtimeHandler(request, async (raw) => {
          const b = Body.parse(raw);
          const { completeEvaluation } = await import("@/lib/evals.server");
          return completeEvaluation(b.runId, "runtime", b.items);
        }),
    },
  },
});
