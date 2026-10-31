export class PilotError extends Error {
  retryAfter?: number;
  constructor(public code: string, message: string, public status = 422, public fields?: Record<string, string>) { super(message); }
}
export function apiError(error: unknown): Response {
  if (error instanceof Response) return error;
  if (error instanceof PilotError) return Response.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(error.status === 429 ? { 'Retry-After': String(error.retryAfter || 60) } : {}) } });
  console.error("Ring pilot operation failed", { code: 'UNEXPECTED_SERVICE_FAILURE' });
  return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "The ring service could not complete this request. Please retry." } }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function readJson(request: Request, limit = 800_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new PilotError("CONTENT_TYPE", "Send a JSON request.", 415);
  const text = await readText(request, limit);
  try { return JSON.parse(text); } catch { throw new PilotError("INVALID_JSON", "Invalid JSON request.", 400); }
}
export async function readText(request: Request, limit: number): Promise<string> {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new PilotError("PAYLOAD_TOO_LARGE", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PilotError("INVALID_JSON", "Missing JSON request.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new PilotError("PAYLOAD_TOO_LARGE", "The request is too large.", 413); } chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}
