// Platform carrier infrastructure. No customer keys or caller-controlled URLs.
type Available = {
  phone_number?: string;
  features?: { name?: string }[];
  region_information?: { region_name?: string }[];
  cost_information?: { currency?: string; monthly_cost?: string; upfront_cost?: string };
};
export type CarrierOrder = {
  id: string;
  customer_reference?: string;
  connection_id?: string;
  status?: string;
  requirements_met?: boolean;
  phone_numbers?: { phone_number?: string; status?: string; requirements_met?: boolean }[];
};
export type CarrierNumber = {
  id: string;
  phone_number: string;
  status?: string;
  connection_id?: string;
  customer_reference?: string;
};

export class CarrierRequestError extends Error {
  constructor(
    public readonly uncertain: boolean,
    public readonly status?: number,
  ) {
    super(
      uncertain
        ? "Carrier response is pending. Check status before trying again."
        : "The number service could not complete this request. Try again or contact support.",
    );
  }
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const key = process.env["TELNYX_API_KEY"];
  if (!key) throw new Error("Managed numbers are not available yet. Contact support.");
  let response: Response;
  try {
    response = await fetch(`https://api.telnyx.com/v2${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new CarrierRequestError(true);
  }
  if (!response.ok)
    throw new CarrierRequestError(
      response.status >= 500 || response.status === 408 || response.status === 429,
      response.status,
    );
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new CarrierRequestError(true);
  }
}

function query(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}
function ref(value: string) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(value)) throw new Error("Invalid carrier reference.");
  return encodeURIComponent(value);
}
export function cents(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,6}(\.\d{1,4})?$/.test(value))
    throw new Error("Number pricing is unavailable. Search again later.");
  return Math.ceil(Number(value) * 100 - 0.000001);
}

export async function searchNumbers(areaCode?: string, exact?: string) {
  const filters: Record<string, string> = {
    "filter[country_code]": "US",
    "filter[phone_number_type]": "local",
    "filter[features][]": "voice",
    "filter[limit]": exact ? "1" : "10",
    "filter[best_effort]": "false",
  };
  if (areaCode) filters["filter[national_destination_code]"] = areaCode;
  if (exact) filters["filter[phone_number][starts_with]"] = exact;
  const result = await request<{ data: Available[] }>(`/available_phone_numbers?${query(filters)}`);
  if (!Array.isArray(result.data))
    throw new Error("Number search is unavailable. Try again later.");
  return result.data
    .filter(
      (n) =>
        /^\+1\d{10}$/.test(n.phone_number ?? "") &&
        n.features?.some((f) => f.name === "voice") &&
        n.cost_information?.currency === "USD" &&
        (!exact || n.phone_number === exact),
    )
    .flatMap((n) => {
      try {
        return [
          {
            e164: n.phone_number!,
            locality:
              n.region_information
                ?.map((r) => r.region_name)
                .filter(Boolean)
                .join(", ") ?? "United States",
            monthlyCents: cents(n.cost_information?.monthly_cost),
            setupCents: cents(n.cost_information?.upfront_cost),
          },
        ];
      } catch {
        return [];
      }
    });
}

// Per-number connections avoid a cross-workspace mutation of shared carrier routing.
export async function ensureConnection(orderId: string, destination: string) {
  if (!/^[a-z0-9.-]+$/i.test(destination)) throw new Error("Managed voice routing is unavailable.");
  const name = `aviroh-${orderId}`;
  const result = await request<{ data: { id: string; connection_name?: string }[] }>(
    `/fqdn_connections?${query({ "filter[connection_name][contains]": name, "page[size]": "100" })}`,
  );
  const existing = result.data.filter((c) => c.connection_name === name);
  if (existing.length > 1) throw new Error("Number routing needs support review.");
  const settings = {
    active: true,
    connection_name: name,
    transport_protocol: "TLS",
    encrypted_media: "SRTP",
    inbound: {
      ani_number_format: "+E.164",
      dnis_number_format: "+e164",
      sip_region: "US",
      default_routing_method: "sequential",
    },
  };
  const connection =
    existing[0] ??
    (await request<{ data: { id: string } }>("/fqdn_connections", "POST", settings)).data;
  const fqdns = await request<{ data: { id: string; fqdn?: string; port?: number }[] }>(
    `/fqdns?${query({ "filter[connection_id]": connection.id, "page[size]": "100" })}`,
  );
  if (fqdns.data.some((f) => f.fqdn !== destination || f.port !== 5061))
    throw new Error("Number routing needs support review.");
  const fqdn =
    fqdns.data[0] ??
    (
      await request<{ data: { id: string } }>("/fqdns", "POST", {
        connection_id: connection.id,
        fqdn: destination,
        port: 5061,
        dns_record_type: "a",
      })
    ).data;
  await request(`/fqdn_connections/${ref(connection.id)}`, "PATCH", {
    ...settings,
    inbound: { ...settings.inbound, default_primary_fqdn_id: fqdn.id },
  });
  return connection.id;
}

export async function submitNumberOrder(orderId: string, e164: string, connectionId: string) {
  return (
    await request<{ data: CarrierOrder }>("/number_orders", "POST", {
      customer_reference: `aviroh-${orderId}`,
      connection_id: connectionId,
      phone_numbers: [{ phone_number: e164 }],
    })
  ).data;
}

export async function findNumberOrder(orderId: string, e164: string, knownRef?: string | null) {
  const orders = knownRef
    ? [(await request<{ data: CarrierOrder }>(`/number_orders/${ref(knownRef)}`)).data]
    : (
        await request<{ data: CarrierOrder[] }>(
          `/number_orders?${query({ "filter[customer_reference]": `aviroh-${orderId}`, "page[size]": "100" })}`,
        )
      ).data;
  if (orders.length > 1) throw new Error("Number purchase needs support review.");
  const order = orders[0];
  if (
    order &&
    (order.customer_reference !== `aviroh-${orderId}` ||
      order.phone_numbers?.length !== 1 ||
      order.phone_numbers[0]?.phone_number !== e164)
  )
    throw new Error("Number purchase needs support review.");
  return order ?? null;
}

export async function findOwnedNumber(
  e164: string,
  connectionId: string,
): Promise<CarrierNumber | null> {
  const result = await request<{ data: CarrierNumber[] }>(
    `/phone_numbers?${query({ "filter[phone_number]": e164, "filter[connection_id]": connectionId, "page[size]": "100" })}`,
  );
  const numbers = result.data.filter(
    (n) => n.phone_number === e164 && n.connection_id === connectionId,
  );
  if (numbers.length > 1) throw new Error("Number ownership needs support review.");
  return numbers[0] ?? null;
}

export async function releaseNumber(numberId: string, e164: string, connectionId: string) {
  // A missing inventory entry alone is insufficient proof that DELETE succeeded.
  let number: CarrierNumber;
  try {
    number = (await request<{ data: CarrierNumber }>(`/phone_numbers/${ref(numberId)}`)).data;
  } catch (e) {
    if (e instanceof CarrierRequestError && e.status === 404) return;
    throw e;
  }
  if (number.phone_number !== e164 || number.connection_id !== connectionId)
    throw new Error("Number ownership needs support review.");
  if (number.status !== "deleted") await request(`/phone_numbers/${ref(numberId)}`, "DELETE");
}

export async function removeConnection(connectionId: string, orderId: string) {
  try {
    const { data } = await request<{ data: { connection_name?: string } }>(
      `/fqdn_connections/${ref(connectionId)}`,
    );
    if (data.connection_name !== `aviroh-${orderId}`)
      throw new Error("Number routing needs support review.");
    await request(`/fqdn_connections/${ref(connectionId)}`, "DELETE");
  } catch (e) {
    if (e instanceof CarrierRequestError && e.status === 404) return;
    throw e;
  }
}
