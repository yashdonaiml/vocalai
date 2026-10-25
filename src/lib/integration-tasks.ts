// Small, supported task contracts. Application-specific adapters can use these same contracts.
export const INTEGRATION_TASKS = [
  {
    id: "customer_lookup",
    title: "Look up a customer",
    description: "Find a customer by email so your agent can answer with their details.",
    method: "GET",
    risk: "read",
    fields: [{ name: "email", label: "Customer email" }],
  },
  {
    id: "support_ticket",
    title: "Create a support ticket",
    description: "Save the caller's issue in your support system.",
    method: "POST",
    risk: "write",
    fields: [
      { name: "name", label: "Caller name" },
      { name: "email", label: "Contact email" },
      { name: "subject", label: "Subject" },
      { name: "description", label: "Issue details" },
    ],
  },
  {
    id: "capture_lead",
    title: "Save a sales lead",
    description: "Send a caller's contact details and request to your sales system.",
    method: "POST",
    risk: "write",
    fields: [
      { name: "name", label: "Caller name" },
      { name: "email", label: "Contact email" },
      { name: "phone", label: "Phone with country code" },
      { name: "reason", label: "What they need" },
    ],
  },
] as const;

export function integrationTask(id: string) {
  const task = INTEGRATION_TASKS.find((t) => t.id === id);
  if (!task) throw new Error("Choose a supported task");
  return task;
}

export function taskOperation(id: string, path: string) {
  const task = integrationTask(id);
  if (!/^\/[^\s?#{}]*$/.test(path) || path.startsWith("//"))
    throw new Error("Use an endpoint path beginning with /, without query parameters");
  return {
    opId: `guided:${task.id}`,
    slug: task.id,
    displayName: task.title,
    description: `${task.description} Collect all required details first. Only report success after a successful action result.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        task.fields.map((f) => [
          f.name,
          { type: "string", minLength: 1, maxLength: 2000, description: f.label },
        ]),
      ),
      required: task.fields.map((f) => f.name),
    },
    mapping: {
      method: task.method,
      path,
      params: Object.fromEntries(
        task.fields.map((f) => [f.name, task.method === "GET" ? "query" : "body"]),
      ),
      integration_task: task.id,
    },
    risk: task.risk,
  };
}
