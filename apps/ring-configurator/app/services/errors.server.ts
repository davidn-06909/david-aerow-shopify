export class PilotError extends Error {
  constructor(public code: string, message: string, public status = 422, public fields?: Record<string, string>) { super(message); }
}
export function apiError(error: unknown): Response {
  if (error instanceof Response) return error;
  if (error instanceof PilotError) return Response.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status });
  console.error("Ring pilot operation failed", error instanceof Error ? error.message : "Unknown failure");
  return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "The ring service could not complete this request. Please retry." } }, { status: 503 });
}
export async function readJson(request: Request, limit = 800_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new PilotError("CONTENT_TYPE", "Send a JSON request.", 415);
  if (Number(request.headers.get("content-length") || 0) > limit) throw new PilotError("PAYLOAD_TOO_LARGE", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PilotError("INVALID_JSON", "Missing JSON request.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new PilotError("PAYLOAD_TOO_LARGE", "The request is too large.", 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new PilotError("INVALID_JSON", "Invalid JSON request.", 400); }
}
