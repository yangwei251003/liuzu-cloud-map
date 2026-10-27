import { createHash, randomUUID } from "node:crypto";

import { isVisitorPassphrase } from "./visitor-identity-domain";

const CONSENT_PURPOSES = [
  "LOCATION_FOREGROUND",
  "PRIVATE_SHARE",
  "ACCOUNT_STORAGE",
  "NARRATION",
] as const;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{7,127}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UnknownRecord = Record<string, unknown>;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export type ConsentWriteInput = {
  purpose: ConsentPurpose;
  granted: boolean;
  expectedRevision: number;
};

export type DeleteVisitorAccountInput = {
  currentPassphrase: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key);
}

export function isConsentPurpose(value: unknown): value is ConsentPurpose {
  return typeof value === "string" && (CONSENT_PURPOSES as readonly string[]).includes(value);
}

export function isEmptyDataRightsRequest(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function parseConsentWriteInput(value: unknown): ConsentWriteInput | null {
  if (!isRecord(value) || !exactKeys(value, ["expectedRevision", "granted", "purpose"])) return null;
  const expectedRevision = value.expectedRevision;
  if (
    !isConsentPurpose(value.purpose) ||
    typeof value.granted !== "boolean" ||
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= 2_147_483_647
  ) {
    return null;
  }
  return {
    purpose: value.purpose,
    granted: value.granted,
    expectedRevision,
  };
}

export function parseDeleteVisitorAccountInput(value: unknown): DeleteVisitorAccountInput | null {
  if (!isRecord(value) || !exactKeys(value, ["currentPassphrase"]) || !isVisitorPassphrase(value.currentPassphrase)) {
    return null;
  }
  return { currentPassphrase: value.currentPassphrase };
}

export function parseDataRightsIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

export function hashDataRightsIdempotencyKey(value: string) {
  const parsed = parseDataRightsIdempotencyKey(value);
  if (!parsed) throw new Error("invalid_data_rights_idempotency_key");
  return createHash("sha256").update(parsed, "utf8").digest("hex");
}

export function createDataSubjectRequestReference(uuid: () => string = randomUUID) {
  const value = uuid();
  if (!UUID_PATTERN.test(value)) throw new Error("invalid_data_subject_request_reference");
  return `dsr-${value}`;
}
