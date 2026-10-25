export type EnquiryBusinessDraft = { name: string; brief: string };
export type EnquiryReceipt = { invocationId: string; conversationId: string; savedAt: string; destination: "callback_inbox"; notificationSent: false };
export type EnquirySetupState = {
  setupId: string; agentId: string; revision: number; businessDraft: EnquiryBusinessDraft;
  stage: "draft" | "preview" | "saved";
  readiness: { ready: boolean; reasons: string[] };
  latestSessionId: string | null; receipt: EnquiryReceipt | null;
};
export type EnquiryPreviewJoin = { serverUrl: string; token: string; sessionId: string; snapshotHash: string };
export type EnquiryPreviewResult = {
  state: "connecting" | "active" | "saving" | "saved" | "not_saved" | "unknown" | "failed";
  receipt?: EnquiryReceipt | null; safeError?: string; nextAction?: string;
};
