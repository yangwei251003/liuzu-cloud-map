import { normalizeAmapPoiQuery, searchAmapPublicPois } from "@/lib/amap-web-service.server";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("query");
  const query = normalizeAmapPoiQuery(rawQuery);
  if (!query) {
    return Response.json({ error: "INVALID_QUERY", message: "请提供 2 至 80 个字符的地点名称。" }, { status: 400, headers: responseHeaders });
  }
  const result = await searchAmapPublicPois(query);
  return Response.json(result, { status: result.available ? 200 : 503, headers: responseHeaders });
}
