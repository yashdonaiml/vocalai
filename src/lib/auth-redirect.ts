// Redirect targets come from URL search parameters and must remain in this app.
export function safeAuthRedirect(path?: string): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/agents";
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("//") || decoded.includes("\\") || [...decoded].some((char) => char.charCodeAt(0) <= 32)) return "/agents";
    const base = "https://vocollai.invalid";
    return new URL(path, base).origin === base ? path : "/agents";
  } catch { return "/agents"; }
}
