import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("站内导航把路线拆为已走与剩余覆盖物并提供地图视野控制", async () => {
  const source = await readFile(
    new URL("../src/components/AmapEmbeddedNavigator.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const traveledPath = routeCoordinates\.slice\(0, boundedIndex \+ 1\)/);
  assert.match(source, /const remainingPath = routeCoordinates\.slice\(boundedIndex\)/);
  assert.match(source, /strokeColor: "#718078"[\s\S]*?strokeColor: "#1677ff"/);
  assert.match(source, /\[mapReady, routeCoordinates, routePointIndex\]/);
  assert.match(source, /aria-label="回到当前位置"/);
  assert.match(source, /map\.setCenter\(coordinate\)/);
  assert.match(source, /aria-label="查看全程路线"/);
  assert.match(source, /map\.setFitView\(overlays/);
  assert.match(source, />已走<\/span>[\s\S]*?>剩余<\/span>/);
});
