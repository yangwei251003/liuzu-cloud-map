import { readAmapBrowserConfig } from "@/lib/amap-config";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export function GET() {
  const config = readAmapBrowserConfig({
    AMAP_JS_KEY: process.env.AMAP_JS_KEY,
    AMAP_SECURITY_JS_CODE: process.env.AMAP_SECURITY_JS_CODE,
  });
  return Response.json(config, { headers: responseHeaders });
}
