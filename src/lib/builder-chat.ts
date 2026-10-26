import { z } from "zod";
import { businessProfileSchema, type BusinessProfileV1 } from "./business-profile";

export const builderDestinationSchema = z.enum(["callback_inbox", "google_sheets"]);

export const builderProposalSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(4000),
    proposedProfile: businessProfileSchema.nullable(),
    requestedDestination: builderDestinationSchema.nullable(),
    questions: z.array(z.string().trim().min(1).max(300)).max(5),
    assumptions: z.array(z.string().trim().min(1).max(300)).max(10),
  })
  .strict();

export type BuilderProposalContent = z.infer<typeof builderProposalSchema>;
export type BuilderProposalRecord = BuilderProposalContent & {
  id: string;
  userMessage: string;
  status: "proposed" | "applied" | "rejected";
  basedOnRevision: number | null;
  appliedAgentId: string | null;
  createdAt: string;
};

export function summarizeProfileChange(
  current: BusinessProfileV1 | null,
  proposed: BusinessProfileV1,
) {
  const changes: string[] = [];
  if (!current || current.business.name !== proposed.business.name)
    changes.push(`Business name: ${proposed.business.name}`);
  if (!current || current.business.description !== proposed.business.description)
    changes.push("Business description updated");
  if (!current || JSON.stringify(current.services) !== JSON.stringify(proposed.services))
    changes.push(`Services: ${proposed.services.map((service) => service.name).join(", ")}`);
  if (!current || current.business.timezone !== proposed.business.timezone)
    changes.push(`Timezone: ${proposed.business.timezone}`);
  if (!current || JSON.stringify(current.hours) !== JSON.stringify(proposed.hours))
    changes.push(
      proposed.hours.mode === "not_provided"
        ? "Business hours remain unknown"
        : proposed.hours.mode === "always_open"
          ? "Business hours: open 24 hours"
          : "Weekly business hours updated",
    );
  if (!current || JSON.stringify(current.escalation) !== JSON.stringify(proposed.escalation))
    changes.push("Message-taking guidance updated");
  if (
    !current ||
    JSON.stringify(current.prohibitedClaims) !== JSON.stringify(proposed.prohibitedClaims)
  )
    changes.push("Prohibited claims updated");
  return changes;
}
