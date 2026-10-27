export function GET() {
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
