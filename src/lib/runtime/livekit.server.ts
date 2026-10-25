import { isIP } from "node:net";
// LiveKit adapter: the media/telephony substrate. Nothing outside this file knows LiveKit terms.
export const RUNTIME_AGENT_NAME = "aviroh-runtime";

function cfg() {
  const url = process.env["LIVEKIT_URL"];
  const key = process.env["LIVEKIT_API_KEY"];
  const secret = process.env["LIVEKIT_API_SECRET"];
  if (!url || !key || !secret) throw new Error("Voice media layer is not configured yet (LiveKit credentials missing)");
  return { url, key, secret, http: url.replace(/^wss?:/, "https:") };
}

export function mediaConfigured() {
  return Boolean(process.env["LIVEKIT_URL"] && process.env["LIVEKIT_API_KEY"] && process.env["LIVEKIT_API_SECRET"]);
}

// Creates a session join grant for a browser participant and dispatches the runtime worker.
export async function createSessionJoin(opts: { sessionRef: string; identity: string; metadata: Record<string, unknown> }) {
  const { url, key, secret } = cfg();
  const { AccessToken } = await import("livekit-server-sdk");
  const { RoomConfiguration, RoomAgentDispatch } = await import("@livekit/protocol");
  const at = new AccessToken(key, secret, { identity: opts.identity, ttl: "15m" });
  at.addGrant({ room: opts.sessionRef, roomJoin: true, canPublish: true, canSubscribe: true });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: RUNTIME_AGENT_NAME, metadata: JSON.stringify(opts.metadata) })],
  });
  return { serverUrl: url, token: await at.toJwt() };
}

// Source addresses are operator configuration, not customer-supplied URLs or credentials.
export function carrierAddresses(carrier: string): string[] {
  const name = carrier === "telnyx" ? "TELNYX_SIP_ALLOWED_ADDRESSES" : "SIP_ALLOWED_ADDRESSES";
  const values = (process.env[name] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!values.length) throw new Error(`Set ${name} to the carrier's signaling IP addresses before provisioning.`);
  for (const value of values) {
    const [address, prefix, extra] = value.split("/");
    const version = isIP(address ?? "");
    if (!version || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) throw new Error(`Invalid signaling address in ${name}`);
  }
  return [...new Set(values)];
}

export function phoneServiceSetup() {
  let telnyxAllowed = false;
  try { carrierAddresses("telnyx"); telnyxAllowed = true; } catch { /* setup is incomplete */ }
  const endpoint = process.env["LIVEKIT_SIP_ENDPOINT"]?.trim() ?? "";
  return { mediaConfigured: mediaConfigured(), runtimeConfigured: Boolean(process.env["RUNTIME_SHARED_SECRET"]), telnyxAllowed, sipEndpoint: /^[a-z0-9.-]+$/i.test(endpoint) ? endpoint : "" };
}

// Deterministic resource names let retries recover after a timeout or a partial save.
export async function provisionInboundNumber(opts: { e164: string; numberId: string; carrier: string }) {
  const addresses = carrierAddresses(opts.carrier);
  const { http, key, secret } = cfg();
  const { SipClient } = await import("livekit-server-sdk");
  const { RoomConfiguration, RoomAgentDispatch, SIPMediaEncryption, ListUpdate } = await import("@livekit/protocol");
  const sip = new SipClient(http, key, secret);
  const name = `aviroh-${opts.numberId}`;
  const trunks = (await sip.listSipInboundTrunk({ numbers: [opts.e164] })).filter((t) => t.name === name);
  if (trunks.length > 1) throw new Error("Duplicate inbound trunks need operator review");
  const security = { allowedAddresses: addresses, mediaEncryption: SIPMediaEncryption.SIP_MEDIA_ENCRYPT_REQUIRE };
  const trunk = trunks[0]
    ? await sip.updateSipInboundTrunkFields(trunks[0].sipTrunkId, { numbers: new ListUpdate({ set: [opts.e164] }), allowedAddresses: new ListUpdate({ set: addresses }), mediaEncryption: security.mediaEncryption })
    : await sip.createSipInboundTrunk(name, [opts.e164], security);
  const rules = (await sip.listSipDispatchRule({ trunkIds: [trunk.sipTrunkId] })).filter((r) => r.name === name);
  if (rules.length > 1) throw new Error("Duplicate dispatch rules need operator review");
  const roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: RUNTIME_AGENT_NAME, metadata: JSON.stringify({ phone_number_id: opts.numberId }) })] });
  const rule = rules[0] ?? await sip.createSipDispatchRule(
    { type: "individual", roomPrefix: `pstn-${opts.numberId}-` },
    { name, trunkIds: [trunk.sipTrunkId], roomConfig },
  );
  if (rule.trunkIds.length !== 1 || rule.trunkIds[0] !== trunk.sipTrunkId || !rule.roomConfig?.agents.some((a) => a.agentName === RUNTIME_AGENT_NAME && a.metadata === JSON.stringify({ phone_number_id: opts.numberId }))) throw new Error("Dispatch configuration changed; review it in LiveKit before retrying");
  return { trunkRef: trunk.sipTrunkId, ruleRef: rule.sipDispatchRuleId };
}

export async function removeInboundNumber(opts: { numberId: string; e164: string; ruleRef: string | null }) {
  const { http, key, secret } = cfg();
  const { SipClient } = await import("livekit-server-sdk");
  const sip = new SipClient(http, key, secret);
  const name = `aviroh-${opts.numberId}`;
  if (opts.ruleRef) {
    for (const rule of (await sip.listSipDispatchRule({ dispatchRuleIds: [opts.ruleRef] })).filter((r) => r?.name === name)) await sip.deleteSipDispatchRule(rule.sipDispatchRuleId);
  }
  for (const trunk of (await sip.listSipInboundTrunk({ numbers: [opts.e164] })).filter((t) => t.name === name)) {
    for (const rule of (await sip.listSipDispatchRule({ trunkIds: [trunk.sipTrunkId] })).filter((r) => r.name === name)) await sip.deleteSipDispatchRule(rule.sipDispatchRuleId);
    await sip.deleteSipTrunk(trunk.sipTrunkId);
  }
}
