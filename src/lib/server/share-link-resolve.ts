import { isShareToken } from "./share-link-domain";

export type ShareResolveInput = {
  token: string;
};

export function parseShareResolveInput(value: unknown): ShareResolveInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, "token") || !isShareToken(record.token)) {
    return null;
  }
  return { token: record.token };
}
