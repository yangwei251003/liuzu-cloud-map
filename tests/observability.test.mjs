import assert from "node:assert/strict";
import test from "node:test";

import { recordOperationalEvent, recordOperationalMetric, setOpenTelemetrySink } from "../src/lib/server/observability.ts";

test("observability adapter removes credential, content and precise-location fields before export", () => {
  const received = [];
  setOpenTelemetrySink({
    emitLog(event) { received.push({ type: "log", event }); },
    emitMetric(name, value, attributes) { received.push({ type: "metric", name, value, attributes }); },
  });
  recordOperationalEvent({
    name: "request.completed",
    requestId: "req-1",
    severity: "INFO",
    code: "OK",
    attributes: { route: "/api/x", token: "must-not-export", question: "must-not-export", coordinate: "must-not-export" },
  });
  recordOperationalMetric("request.duration", 12, { status: 200, passphrase: "must-not-export" });
  setOpenTelemetrySink(null);
  assert.deepEqual(received[0].event.attributes, { route: "/api/x" });
  assert.deepEqual(received[1].attributes, { status: 200 });
});
