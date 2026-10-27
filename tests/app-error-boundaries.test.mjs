import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeErrorUrl = new URL("../src/app/error.tsx", import.meta.url);
const globalErrorUrl = new URL("../src/app/global-error.tsx", import.meta.url);
const notFoundUrl = new URL("../src/app/not-found.tsx", import.meta.url);

test("根路由提供符合 Next 16 约定的安全错误与 404 兜底", async () => {
  const [routeError, globalError, notFound] = await Promise.all([
    readFile(routeErrorUrl, "utf8"),
    readFile(globalErrorUrl, "utf8"),
    readFile(notFoundUrl, "utf8"),
  ]);

  for (const source of [routeError, globalError]) {
    assert.match(source, /^"use client";/);
    assert.match(source, /retry:\s*\(\)\s*=>\s*void/);
    assert.match(source, /onClick=\{\(\)\s*=>\s*retry\(\)\}/);
    assert.match(source, /error\.digest/);
    assert.doesNotMatch(source, /error\.(?:message|stack)/);
    assert.match(source, /role="alert"/);
    assert.match(source, /返回首页/);
  }

  assert.match(globalError, /<html lang="zh-CN">/);
  assert.match(globalError, /<body(?:\s|>)/);
  assert.match(globalError, /<title>页面暂时不可用｜六祖云游<\/title>/);
  assert.match(notFound, /页面未找到/);
  assert.match(notFound, /href="\/"/);
});
