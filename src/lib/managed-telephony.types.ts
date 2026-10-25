export type ManagedQuote = {
  id: string;
  workspace_id: string;
  e164: string;
  currency: string;
  monthly_cents: number;
  setup_cents: number;
  inbound_rate: string;
  carrier_monthly_cents: number;
  carrier_setup_cents: number;
  expires_at: string;
  created_at: string;
};

export type ManagedOrder = {
  id: string;
  workspace_id: string;
  quote_id: string;
  number_id: string;
  state: string;
  connection_ref: string | null;
  carrier_order_ref: string | null;
  carrier_number_ref: string | null;
  submitted_at: string | null;
  activated_at: string | null;
  carrier_released_at: string | null;
  lease_token: string | null;
  lease_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type PhoneVerification = {
  id: string;
  workspace_id: string;
  number_id: string;
  agent_id: string;
  environment_id: string;
  agent_version: number;
  challenge: string;
  expires_at: string;
  requested_at: string;
  verified_at: string | null;
  conversation_id: string | null;
};

export type NumberCharge = {
  id: string;
  workspace_id: string;
  order_id: string;
  period: number;
  currency: string;
  amount_cents: number;
  description: string;
  created_at: string;
};

export type ManagedTable<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};
