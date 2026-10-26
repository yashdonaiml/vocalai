export type EnquiryBusinessDraft = { name: string; brief: string };
export type EnquiryDestination =
  | { kind: "callback_inbox" }
  | {
      kind: "google_sheets";
      connectionId: string;
      spreadsheetId: string;
      spreadsheetName: string;
      worksheetId: number;
      worksheetTitle: string;
      mapping: {
        name: string;
        phone: string;
        reason: string;
        preferred_time: string | null;
        language: string | null;
        request_marker: string;
        record_kind: string;
      };
    };
export type EnquiryReceipt = {
  invocationId: string;
  conversationId: string;
  savedAt: string;
  destination: "callback_inbox" | "google_sheets";
  notificationSent: false;
  providerLink?: string;
  externalReference?: string;
  recordKind?: "test" | "live";
};
export type EnquirySetupState = {
  setupId: string;
  agentId: string;
  revision: number;
  businessDraft: EnquiryBusinessDraft;
  destination: EnquiryDestination;
  stage: "draft" | "preview" | "saved";
  readiness: { ready: boolean; reasons: string[] };
  latestSessionId: string | null;
  receipt: EnquiryReceipt | null;
};
export type EnquiryPreviewJoin = {
  serverUrl: string;
  token: string;
  sessionId: string;
  snapshotHash: string;
};
export type EnquiryPreviewResult = {
  state: "connecting" | "active" | "saving" | "saved" | "not_saved" | "unknown" | "failed";
  receipt?: EnquiryReceipt | null;
  safeError?: string;
  nextAction?: string;
};
