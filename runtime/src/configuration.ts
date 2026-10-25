export function validateWorkerEnvironment(env: Record<string, string | undefined> = process.env, development = false) {
  const required = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "AVIROH_CONTROL_PLANE_URL", "RUNTIME_SHARED_SECRET"];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing worker environment variables: ${missing.join(", ")}`);
  const origin = new URL(env.AVIROH_CONTROL_PLANE_URL!);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || (origin.protocol !== "https:" && !(development && origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) throw new Error("AVIROH_CONTROL_PLANE_URL must be an HTTPS origin without a path, query, or credentials");
  const media = new URL(env.LIVEKIT_URL!);
  if (media.protocol !== "wss:" && !(development && media.protocol === "ws:" && ["localhost", "127.0.0.1"].includes(media.hostname))) throw new Error("LIVEKIT_URL must be the project's secure WebSocket URL");
  if (env.RUNTIME_SHARED_SECRET!.length < 32) throw new Error("RUNTIME_SHARED_SECRET must contain at least 32 characters");
}
