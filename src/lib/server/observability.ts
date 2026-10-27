type SafeAttribute = boolean | number | string | null;

export type SafeLogAttributes = Record<string, SafeAttribute>;

export type ObservabilityEvent = {
  name: string;
  requestId: string;
  severity: "INFO" | "WARN" | "ERROR";
  code: string;
  durationMs?: number;
  attributes?: SafeLogAttributes;
};

export type OpenTelemetrySink = {
  emitLog(event: ObservabilityEvent): void;
  emitMetric(name: string, value: number, attributes?: SafeLogAttributes): void;
};

const SENSITIVE_ATTRIBUTE = /(?:authorization|cookie|secret|token|pass(?:word|phrase)?|question|body|content|location|coordinate|track|ip|address)/i;

function sanitizedAttributes(attributes: SafeLogAttributes | undefined) {
  if (!attributes) return undefined;
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => !SENSITIVE_ATTRIBUTE.test(key))) as SafeLogAttributes;
}

const noOpSink: OpenTelemetrySink = {
  emitLog() {},
  emitMetric() {},
};

let sink: OpenTelemetrySink = noOpSink;

/**
 * Deployment adapters may set a vendor-neutral OpenTelemetry bridge at startup.
 * The repository never installs an exporter or sends production data by itself.
 */
export function setOpenTelemetrySink(next: OpenTelemetrySink | null | undefined) {
  sink = next ?? noOpSink;
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function recordOperationalEvent(event: ObservabilityEvent) {
  sink.emitLog({ ...event, attributes: sanitizedAttributes(event.attributes) });
}

export function recordOperationalMetric(name: string, value: number, attributes?: SafeLogAttributes) {
  if (!Number.isFinite(value)) return;
  sink.emitMetric(name, value, sanitizedAttributes(attributes));
}
