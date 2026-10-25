// Caller speech only. Model output is never evidence of authorization.
export function classifyConfirmation(transcript: string, confidence?: number): "confirm" | "deny" | "unclear" {
  const text = transcript.toLowerCase().normalize("NFC").replace(/[.!?,。！？]/g, "").trim().replace(/\s+/g, " ");
  if (/\b(no|nope|cancel|stop|don't|do not|never)\b/.test(text)) return "deny";
  if (confidence !== undefined && confidence < 0.7) return "unclear";
  if (/^(వద్దు|కాదు|లేదు|రద్దు|vaddu|vaddhu|kaadu|kadu|ledu|రద్దు చేయండి|save చేయొద్దు)$/.test(text)) return "deny";
  if (/^(అవును|అవునండి|అవును అండి|సరే|అవును సేవ్ చేయండి|అవును save చేయండి|సేవ్ చేయండి|save చేయండి|avunu|avunandi|avunu andi|sare|avunu save cheyandi|save cheyandi)$/.test(text)) return "confirm";
  if (/^(no|non|nein|нет|não|nao|いいえ|nee|नहीं)$/.test(text)) return "deny";
  if (/^(sí|si|oui|ja|да|sim|はい|हाँ|हां)$/.test(text)) return "confirm";
  return /^(yes|yeah|yep|confirm|yes please|yes go ahead|go ahead|please go ahead|that's correct|that is correct|i confirm)$/.test(text) ? "confirm" : "unclear";
}
