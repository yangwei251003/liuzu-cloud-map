export const VISITOR_SCENIC_AREA_ID = "liuzu-town";
export const VISITOR_AUTH_STATE_EVENT = "liuzu-cloud-tour:visitor-auth-state";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

type UnknownRecord = Record<string, unknown>;

export type VisitorSummary = {
  subject: string;
  scenicAreaId: string;
  handle: string;
};

export type VisitorSessionResponse = {
  schemaVersion: 1;
  visitor: VisitorSummary;
  expiresAt: string | null;
};

export type VisitorApiError = {
  code: string;
  message: string;
  retryable: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function parseVisitor(value: unknown): VisitorSummary | null {
  if (!isRecord(value) || !exactKeys(value, ["handle", "scenicAreaId", "subject"])) return null;
  if (
    typeof value.handle !== "string" ||
    !HANDLE_PATTERN.test(value.handle) ||
    value.scenicAreaId !== VISITOR_SCENIC_AREA_ID ||
    typeof value.subject !== "string" ||
    !value.subject.startsWith(`visitor:${VISITOR_SCENIC_AREA_ID}:`)
  ) {
    return null;
  }
  return { handle: value.handle, scenicAreaId: value.scenicAreaId, subject: value.subject };
}

export function parseVisitorSessionResponse(value: unknown): VisitorSessionResponse | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.visitor)) return null;
  const visitor = parseVisitor(value.visitor);
  if (!visitor) return null;
  if (exactKeys(value, ["schemaVersion", "visitor"])) {
    return { schemaVersion: 1, visitor, expiresAt: null };
  }
  if (!exactKeys(value, ["expiresAt", "schemaVersion", "visitor"]) || !isIsoDate(value.expiresAt)) return null;
  return { schemaVersion: 1, visitor, expiresAt: value.expiresAt };
}

export function parseVisitorApiError(value: unknown): VisitorApiError | null {
  if (!isRecord(value) || !exactKeys(value, ["error"]) || !isRecord(value.error)) return null;
  if (!exactKeys(value.error, ["code", "message", "retryable"])) return null;
  if (
    typeof value.error.code !== "string" ||
    typeof value.error.message !== "string" ||
    typeof value.error.retryable !== "boolean"
  ) {
    return null;
  }
  return { code: value.error.code, message: value.error.message, retryable: value.error.retryable };
}

export function normalizeVisitorHandle(value: string) {
  return value.trim().toLowerCase();
}

export function validateVisitorCredentials(handleInput: string, passphrase: string) {
  const handle = normalizeVisitorHandle(handleInput);
  if (!HANDLE_PATTERN.test(handle)) {
    return { ok: false as const, error: "账号名需为 3 至 32 位小写字母、数字、下划线或短横线，并以字母或数字开头。" };
  }
  if (passphrase.length < 12 || passphrase.length > 128 || new TextEncoder().encode(passphrase).length > 512) {
    return { ok: false as const, error: "口令需为 12 至 128 个字符；请使用只属于你的长口令。" };
  }
  return {
    ok: true as const,
    credentials: { scenicAreaId: VISITOR_SCENIC_AREA_ID, handle, passphrase },
  };
}
