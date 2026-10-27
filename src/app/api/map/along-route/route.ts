import { searchAmapNearbyPublicPois } from "@/lib/amap-web-service.server";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON", message: "请求格式无效。" }, { status: 400, headers: responseHeaders });
  }
  const centers = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { centers?: unknown }).centers
    : null;
  const result = await searchAmapNearbyPublicPois(centers);
  const invalid = result.message === "沿途查询坐标不符合要求。";
  return Response.json(result, { status: invalid ? 400 : result.available ? 200 : 503, headers: responseHeaders });
}
