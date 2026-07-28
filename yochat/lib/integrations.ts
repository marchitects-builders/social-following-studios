export async function emitIntegrationEvent(name: string, payload: Record<string, unknown>): Promise<void> {
  const target = process.env.YOCHAT_EVENT_WEBHOOK_URL;
  if (!target) return;

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.YOCHAT_EVENT_WEBHOOK_SECRET
        ? { Authorization: `Bearer ${process.env.YOCHAT_EVENT_WEBHOOK_SECRET}` }
        : {}),
    },
    body: JSON.stringify({ name, occurredAt: new Date().toISOString(), ...payload }),
  });

  if (!response.ok) throw new Error(`Integration webhook returned HTTP ${response.status}`);
}
