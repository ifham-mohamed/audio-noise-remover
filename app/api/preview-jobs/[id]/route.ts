import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { previewCommandSchema, PreviewJobError } from "@/shared/contracts/preview";
import { previewCoordinator } from "@/server/domain/preview-coordinator";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try { const { id } = await context.params; return NextResponse.json({ data: previewCoordinator.get(id), error: null, requestId }); }
  catch { return NextResponse.json({ data: null, error: { code: "JOB_NOT_FOUND", message: "This preview attempt is no longer available." }, requestId }, { status: 404 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const parsed = previewCommandSchema.parse(await request.json());
    const job = parsed.command === "event" ? previewCoordinator.consume(id, parsed.event) : parsed.command === "cancel" ? previewCoordinator.cancel(id) : await previewCoordinator.retry(id);
    return NextResponse.json({ data: job, error: null, requestId }, { status: parsed.command === "retry" ? 201 : 200 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ data: null, error: { code: "INVALID_PREVIEW_EVENT", message: "The preview update was invalid and was ignored." }, requestId }, { status: 400 });
    if (error instanceof PreviewJobError) return NextResponse.json({ data: null, error: { code: error.code, message: error.message }, requestId }, { status: error.code === "JOB_NOT_FOUND" ? 404 : 409 });
    return NextResponse.json({ data: null, error: { code: "PREVIEW_UNAVAILABLE", message: "The local preview could not be updated." }, requestId }, { status: 503 });
  }
}
