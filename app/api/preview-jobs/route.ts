import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PreviewJobError } from "@/shared/contracts/preview";
import { previewCoordinator } from "@/server/domain/preview-coordinator";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const job = await previewCoordinator.create(await request.json());
    return NextResponse.json({ data: job, error: null, requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof PreviewJobError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message }, requestId }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ data: null, error: { code: "INVALID_PREVIEW_REQUEST", message: "Review the selected media and preview settings, then try again." }, requestId }, { status: 400 });
    }
    return NextResponse.json({ data: null, error: { code: "PREVIEW_UNAVAILABLE", message: "A local preview request could not be prepared. Try again." }, requestId }, { status: 503 });
  }
}
