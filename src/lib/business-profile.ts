import { z } from "zod";
import { buildEnquiryPack } from "./enquiry-pack";
import type { AgentConfig, ConversationFlow } from "./agent-config";

export const BUSINESS_PROFILE_VERSION = 1 as const;
export const BUSINESS_PROFILE_LANGUAGE_OPTIONS = [{ value: "en", label: "English" }] as const;
export const BUSINESS_PROFILE_ESCALATION_OPTIONS = [
  { value: "take_message", label: "Take a message for my team" },
] as const;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time such as 09:00.");
const interval = z.object({ open: time, close: time }).strict();
const daySchedule = z.array(interval).max(4);
const weeklySchedule = z
  .object({
    mon: daySchedule,
    tue: daySchedule,
    wed: daySchedule,
    thu: daySchedule,
    fri: daySchedule,
    sat: daySchedule,
    sun: daySchedule,
  })
  .strict();

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validateSchedule(weekly: z.infer<typeof weeklySchedule>, ctx: z.RefinementCtx) {
  for (const [day, ranges] of Object.entries(weekly)) {
    const ordered = [...ranges].sort((a, b) => a.open.localeCompare(b.open));
    for (let index = 0; index < ordered.length; index += 1) {
      const range = ordered[index]!;
      if (range.open >= range.close)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [day],
          message: "Opening time must be before closing time.",
        });
      if (index > 0 && ordered[index - 1]!.close > range.open)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [day],
          message: "Business-hour ranges cannot overlap.",
        });
    }
  }
}

const hoursSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("not_provided") }).strict(),
    z.object({ mode: z.literal("always_open") }).strict(),
    z.object({ mode: z.literal("schedule"), weekly: weeklySchedule }).strict(),
  ])
  .superRefine((hours, ctx) => {
    if (hours.mode === "schedule") validateSchedule(hours.weekly, ctx);
  });

export const businessProfileSchema = z
  .object({
    version: z.literal(BUSINESS_PROFILE_VERSION),
    business: z
      .object({
        name: shortText(120),
        description: z.string().trim().max(4000).optional(),
        timezone: shortText(100).refine(validTimezone, "Choose a valid IANA timezone."),
        language: z.literal("en"),
      })
      .strict(),
    services: z
      .array(
        z
          .object({
            id: shortText(80).regex(/^[a-zA-Z0-9_-]+$/),
            name: shortText(120),
            description: z.string().trim().max(1000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    hours: hoursSchema,
    escalation: z
      .object({
        mode: z.literal("take_message"),
        instructions: z.string().trim().max(1000).optional(),
      })
      .strict(),
    prohibitedClaims: z.array(shortText(300)).max(30),
  })
  .strict()
  .superRefine((profile, ctx) => {
    const ids = profile.services.map((service) => service.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["services"],
        message: "Each service needs a unique ID.",
      });
  });

export type BusinessProfileV1 = z.infer<typeof businessProfileSchema>;
export type BusinessProfileReadiness = {
  business: boolean;
  behavior: boolean;
  issues: string[];
};
export type BusinessProfileAgentConfig = AgentConfig & {
  business_profile: BusinessProfileV1;
  business_profile_version: typeof BUSINESS_PROFILE_VERSION;
};

export function parseBusinessProfile(input: unknown): BusinessProfileV1 {
  return businessProfileSchema.parse(input);
}

export function businessProfileReadiness(input: unknown): BusinessProfileReadiness {
  const parsed = businessProfileSchema.safeParse(input);
  if (parsed.success) return { business: true, behavior: true, issues: [] };
  const business = !parsed.error.issues.some((issue) =>
    ["business", "services", "hours"].includes(String(issue.path[0])),
  );
  const behavior = !parsed.error.issues.some((issue) =>
    ["escalation", "prohibitedClaims"].includes(String(issue.path[0])),
  );
  return {
    business,
    behavior,
    issues: [...new Set(parsed.error.issues.map((issue) => issue.message))],
  };
}

function businessFlow(): ConversationFlow {
  return {
    enabled: true,
    nodes: [
      {
        id: "profile_greet",
        type: "start",
        title: "Welcome",
        say: "Use the configured greeting and ask how you can help.",
        x: 40,
        y: 120,
      },
      {
        id: "profile_understand",
        type: "step",
        title: "Understand",
        say: "Ask one question at a time until you understand the caller's request.",
        x: 300,
        y: 120,
      },
      {
        id: "profile_answer",
        type: "step",
        title: "Help",
        say: "Answer only with owner-supplied business facts or approved knowledge.",
        x: 560,
        y: 120,
      },
      {
        id: "profile_message",
        type: "step",
        title: "Take a message",
        say: "If follow-up is needed, offer the approved message-taking action and confirm the details before saving.",
        x: 820,
        y: 120,
      },
      {
        id: "profile_end",
        type: "end",
        title: "Wrap up",
        say: "State only verified next steps and say goodbye.",
        x: 1080,
        y: 120,
      },
    ],
    edges: [
      { id: "profile_e1", source: "profile_greet", target: "profile_understand", when: "" },
      { id: "profile_e2", source: "profile_understand", target: "profile_answer", when: "" },
      {
        id: "profile_e3",
        source: "profile_answer",
        target: "profile_message",
        when: "follow-up is needed",
      },
      {
        id: "profile_e4",
        source: "profile_answer",
        target: "profile_end",
        when: "the request is resolved",
      },
      { id: "profile_e5", source: "profile_message", target: "profile_end", when: "" },
    ],
  };
}

export function compileBusinessProfile(
  input: unknown,
  existingConfig?: unknown,
): BusinessProfileAgentConfig {
  const profile = parseBusinessProfile(input);
  const serviceFacts = profile.services.map(({ name, description }) =>
    description ? { name, description } : { name },
  );
  const brief =
    profile.business.description ||
    `The business offers: ${profile.services.map((service) => service.name).join(", ")}.`;
  const base = buildEnquiryPack({ name: profile.business.name, brief }, existingConfig);
  const facts = {
    description: profile.business.description || undefined,
    services: serviceFacts,
    timezone: profile.business.timezone,
    hours: profile.hours,
  };
  const prohibited = profile.prohibitedClaims.length
    ? `Owner-prohibited claims (never make these claims): ${JSON.stringify(profile.prohibitedClaims)}`
    : "The owner supplied no additional prohibited-claim list.";
  const escalation = profile.escalation.instructions
    ? `Message-taking guidance supplied by the owner: ${JSON.stringify(profile.escalation.instructions)}`
    : "Take a message for manual review when follow-up is needed; do not promise a response time.";
  return {
    ...base,
    flow: businessFlow(),
    instructions: [
      base.instructions,
      `Structured business facts supplied by the owner: ${JSON.stringify(facts)}`,
      profile.hours.mode === "not_provided"
        ? "Business hours were not provided. Say they are unknown; never infer whether the business is open."
        : "Interpret supplied business hours only in the configured timezone.",
      escalation,
      prohibited,
    ].join("\n\n"),
    guardrails: [
      base.guardrails,
      "Do not make an owner-prohibited claim. Missing profile fields are unknown, not permission to infer them.",
    ].join(" "),
    business_profile: profile,
    business_profile_version: BUSINESS_PROFILE_VERSION,
  };
}
