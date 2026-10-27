import assert from "node:assert/strict";
import test from "node:test";

import { parseFormalCommunityPreview } from "../src/lib/formal-community-preview.ts";

function validResponse() {
  return {
    schemaVersion: 1,
    posts: [{
      id: "00000000-0000-4000-8000-000000000001",
      body: "虚构测试动态",
      type: "SCENERY",
      createdAt: "2026-08-16T02:00:00.000Z",
      author: { handle: "visitor-one", displayName: "测试游客" },
      location: { scenicAreaId: "fictional-area", placeId: "poi-view", placeName: "虚构观景点", longitude: 100, latitude: 20, coordinateSystem: "WGS84", precision: "COMMUNITY_CENTROID" },
      stats: { likes: 2, comments: 1 },
    }],
    nextCursor: null,
    summary: { placeId: "poi-view", placeName: "虚构观景点社区", windowHours: 24, postCount: 4, photoCount: 3, checkInCount: 2, generatedAt: "2026-08-16T03:00:00.000Z" },
  };
}

test("a verified community response exposes bounded 24-hour counts and approved preview posts", () => {
  const preview = parseFormalCommunityPreview(validResponse(), "poi-view", "fictional-area");
  assert.ok(preview);
  assert.deepEqual(preview.posts[0], {
    id: "00000000-0000-4000-8000-000000000001",
    body: "虚构测试动态",
    createdAt: "2026-08-16T02:00:00.000Z",
    authorDisplayName: "测试游客",
  });
  assert.equal(preview.photoCount, 3);
});

test("foreign communities, precise locations, unknown fields and implausible counts fail closed", () => {
  const foreign = validResponse();
  foreign.summary.placeId = "other-place";
  assert.equal(parseFormalCommunityPreview(foreign, "poi-view", "fictional-area"), null);
  const foreignScenicArea = validResponse();
  foreignScenicArea.posts[0].location.scenicAreaId = "other-area";
  assert.equal(parseFormalCommunityPreview(foreignScenicArea, "poi-view", "fictional-area"), null);
  const precise = validResponse();
  precise.posts[0].location.precision = "DEVICE_PRECISE";
  assert.equal(parseFormalCommunityPreview(precise, "poi-view", "fictional-area"), null);
  const unknown = { ...validResponse(), trusted: true };
  assert.equal(parseFormalCommunityPreview(unknown, "poi-view", "fictional-area"), null);
  const excessive = validResponse();
  excessive.summary.postCount = 20_000_000;
  assert.equal(parseFormalCommunityPreview(excessive, "poi-view", "fictional-area"), null);
});
