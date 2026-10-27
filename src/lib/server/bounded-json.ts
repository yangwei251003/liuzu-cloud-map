export type BoundedJsonErrorCode = "INVALID_CONTENT_TYPE" | "PAYLOAD_TOO_LARGE" | "INVALID_JSON";

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: BoundedJsonErrorCode };

export async function readBoundedJson(request: Request, maxBytes: number): Promise<BoundedJsonResult> {
  if (!Number.isInteger(maxBytes) || maxBytes < 2 || maxBytes > 1_000_000) throw new Error("invalid_json_body_limit");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { ok: false, code: "INVALID_CONTENT_TYPE" };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return { ok: false, code: "PAYLOAD_TOO_LARGE" };
      }
      chunks.push(chunk.value);
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "INVALID_JSON" };
  }
}
