import assert from "node:assert/strict";
import test from "node:test";
import {
  SAVED_KNOWLEDGE_STORAGE_KEY,
  createEmptySavedKnowledgeData,
  deleteKnowledgeReference,
  parseSavedKnowledgeData,
  readSavedKnowledgeData,
  saveKnowledgeReference,
} from "../src/lib/saved-knowledge-store.ts";

function installLocalStorage() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
  };
  return values;
}

const answer = {
  requestId: "answer-1",
  answer: "这段回答正文不应被知识卡持久化。",
  factTypes: ["historical_record"],
  sources: [{
    id: "LZ-003",
    title: "第八批全国重点文物保护单位名单",
    publisher: "国务院",
    url: "https://www.gov.cn/zhengce/content/2019-10/16/content_5440577.htm",
    checkedAt: "2026-08-14",
    evidenceLevel: "A",
    factType: "historical_record",
    reviewStatus: "PROJECT_SOURCE_CHECKED",
    sourceStatus: "OFFICIAL_PRIMARY",
  }],
  provider: "local-knowledge",
  verification: "verified-context",
  refused: false,
  generatedAt: "2026-08-15T01:00:00.000Z",
  notice: "项目已核对来源，未经专业终审。",
};

test("saved knowledge parser accepts strict references and rejects malformed data", () => {
  const empty = createEmptySavedKnowledgeData();
  assert.deepEqual(parseSavedKnowledgeData(empty), empty);
  assert.equal(parseSavedKnowledgeData({ ...empty, version: 2 }), null);
  assert.equal(parseSavedKnowledgeData({ ...empty, items: "invalid" }), null);
  assert.equal(parseSavedKnowledgeData({ ...empty, updatedAt: "not-a-date" }), null);
});

test("knowledge cards persist only the question and source references", () => {
  const values = installLocalStorage();
  const result = saveKnowledgeReference({ question: "国恩寺的文保身份是什么？", answer, spotId: "guoen-temple", spotName: "国恩寺" });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const stored = values.get(SAVED_KNOWLEDGE_STORAGE_KEY);
  assert.equal(typeof stored, "string");
  assert.doesNotMatch(stored, /这段回答正文不应被知识卡持久化/);
  assert.doesNotMatch(stored, /requestId/);
  assert.match(stored, /LZ-003/);

  const read = readSavedKnowledgeData();
  assert.equal(read.error, null);
  assert.equal(read.data.items.length, 1);
  assert.equal(read.data.items[0].question, "国恩寺的文保身份是什么？");
  assert.equal(read.data.items[0].sources[0].publisher, "国务院");
});

test("saving the same source card is idempotent", () => {
  installLocalStorage();
  const first = saveKnowledgeReference({ question: "国恩寺的文保身份是什么？", answer, spotId: "guoen-temple" });
  const second = saveKnowledgeReference({ question: "国恩寺的文保身份是什么？", answer, spotId: "guoen-temple" });
  assert.equal(first.ok && second.ok, true);
  if (!second.ok) return;
  assert.equal(second.duplicate, true);
  assert.equal(readSavedKnowledgeData().data.items.length, 1);
});

test("refused answers cannot become knowledge cards", () => {
  installLocalStorage();
  const result = saveKnowledgeReference({ question: "今天开放吗？", answer: { ...answer, refused: true, factTypes: [] } });
  assert.deepEqual(result, { ok: false, error: "拒答或无来源回答不能保存为知识卡。" });
  assert.equal(readSavedKnowledgeData().data.items.length, 0);
});

test("a saved knowledge reference can be deleted without touching other project data", () => {
  const values = installLocalStorage();
  values.set("liuzu-cloud-tour:unrelated:v1", "keep");
  const saved = saveKnowledgeReference({ question: "国恩寺的文保身份是什么？", answer });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.deepEqual(deleteKnowledgeReference(saved.item.id), { ok: true });
  assert.equal(readSavedKnowledgeData().data.items.length, 0);
  assert.equal(values.get("liuzu-cloud-tour:unrelated:v1"), "keep");
});
