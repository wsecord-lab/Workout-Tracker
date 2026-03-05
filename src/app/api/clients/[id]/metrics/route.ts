import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/authz";
import { getClientMetricsCached, parseRange } from "@/lib/metrics";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await context.params;
  await assertClientAccess(clientId);

  const range = request.nextUrl.searchParams.get("range") ?? "30d";
  const rangeDays = parseRange(range);
  if (rangeDays == null) {
    return NextResponse.json(
      { error: "Invalid range. Use 7d, 30d, or 90d." },
      { status: 400 }
    );
  }

  try {
    const payload = await getClientMetricsCached(clientId, range);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    console.error("Metrics error:", e);
    return NextResponse.json(
      { error: "Failed to compute metrics." },
      { status: 500 }
    );
  }
}
