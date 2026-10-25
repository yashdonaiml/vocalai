import { toast as sonner } from "sonner";

// Maps raw technical errors (database, network, auth) to plain messages people can act on.
const RULES: [RegExp, string][] = [
  [/invalid login credentials/i, "That email and password don't match. If you signed up with Google, use Continue with Google."],
  [/missing email or phone/i, "Please enter your email and password."],
  [/signup is disabled|signups not allowed/i, "New accounts are turned off right now. Please contact support."],
  [/provider.*not enabled|unsupported provider/i, "This sign-in method isn't available right now. Please try another."],
  [/email not confirmed/i, "Please confirm your email first. Check your inbox for the link."],
  [/user already registered/i, "An account with this email already exists. Try signing in."],
  [/password should be at least|weak password/i, "Choose a stronger password with at least 8 characters."],
  [/pwned|leaked|compromised/i, "This password has appeared in a data breach. Please choose another."],
  [/rate limit|too many requests/i, "Too many attempts. Please wait a minute and try again."],
  [/unauthorized|jwt|not authenticated|401/i, "Your session has ended. Please sign in again."],
  [/row-level security|permission denied|only organization|not a workspace member|42501/i, "You don't have permission to do this. Ask an owner or admin."],
  [/duplicate key|already exists|unique/i, "Something with this name already exists. Try a different name."],
  [/foreign key|violates.*constraint|still referenced/i, "This is still in use elsewhere. Remove it from there first."],
  [/failed to fetch|network|timeout|aborted/i, "Couldn't reach the server. Check your connection and try again."],
  [/must be valid json/i, "Please check the format. It must be valid JSON."],
  [/invalid url|startsWith|https/i, "Please enter a full web address starting with https://"],
];

export function friendly(input: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = typeof input === "string" ? input : input instanceof Error ? input.message : (input as { message?: string })?.message ?? "";
  if (!raw) return fallback;
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  // Short plain sentences written by our own server functions pass through.
  if (raw.length <= 120 && !/[{}[\]_]|\bat\b.*:\d+|error:/i.test(raw)) return raw;
  return fallback;
}

type ErrArgs = Parameters<typeof sonner.error>;
export const toast = Object.assign((...a: Parameters<typeof sonner>) => sonner(...a), sonner, {
  error: (message: ErrArgs[0], opts?: ErrArgs[1]) => sonner.error(typeof message === "string" ? friendly(message) : message, opts),
});
