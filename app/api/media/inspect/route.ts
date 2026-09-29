import { NextResponse } from "next/server";
import { mediaMetadataSchema } from "@/shared/contracts/media";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const body = await request.json();
    const parsed = mediaMetadataSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ data: null, error: { code: "UNSUPPORTED_MEDIA", message: "The local media inspection result was invalid." }, requestId }, { status: 400 });
    return NextResponse.json({ data: parsed.data, error: null, requestId });
  } catch {
    return NextResponse.json({ data: null, error: { code: "INSPECTION_UNAVAILABLE", message: "Local media inspection could not be completed." }, requestId }, { status: 503 });
  }
}
