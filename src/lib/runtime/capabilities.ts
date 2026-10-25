import { normalizeConfig } from "../agent-config";

export const RUNTIME_CAPABILITY_VERSION = 1;

export function supportsExactReadback(config: unknown): boolean {
  const cfg = normalizeConfig(config);
  return cfg.runtime.mode === "composable" && (/^en(glish)?(?:[-_ ].*)?$/i.test(cfg.language) || cfg.speechStyle === "te-en");
}

export function callLimits(config: unknown) {
  const { callBehavior } = normalizeConfig(config);
  const { maxMinutes, silenceSeconds } = callBehavior;
  if (!Number.isFinite(maxMinutes) || maxMinutes < 1 || maxMinutes > 120 || !Number.isFinite(silenceSeconds) || silenceSeconds < 5 || silenceSeconds > 120) throw new Error("Call duration and silence limits are invalid. Save values within the supported ranges.");
  return { max_minutes: maxMinutes, silence_seconds: silenceSeconds };
}

export function evaluateEnquiryCapabilities(config: unknown) {
  const cfg = normalizeConfig(config);
  const reasons: string[] = [];
  if (cfg.runtime.mode !== "composable") reasons.push("This enquiry preview needs the supported separate voice pipeline so callers can confirm the exact details.");
  if (!/^en(glish)?(?:[-_ ].*)?$/i.test(cfg.language) || cfg.speechStyle === "te-en") reasons.push("This enquiry preview currently supports English. Your other agents and speaking styles are unchanged.");
  try { callLimits(cfg); } catch (error) { reasons.push(error instanceof Error ? error.message : "Call limits are invalid."); }
  return { version: RUNTIME_CAPABILITY_VERSION, supported: reasons.length === 0, reasons, implementedControls: { duration: true, silence: true, transfer: false, voicemail: false, afterHours: false, recording: false } };
}
