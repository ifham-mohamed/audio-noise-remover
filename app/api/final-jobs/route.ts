import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createFinalJobRequestSchema, FinalJobError, finalJobEnvelopeSchema, finalJobListEnvelopeSchema } from "@/shared/contracts/final-job";
import { finalJobCoordinator } from "@/server/domain/final-job-coordinator";

const MAX_REQUEST_BYTES = 128 * 1024;
export async function GET() {
  const requestId = crypto.randomUUID();
  try { const envelope = finalJobListEnvelopeSchema.parse({ data: finalJobCoordinator.list(), error: null, requestId }); return NextResponse.json(envelope, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ data: null, error: { code: "FINAL_JOB_UNAVAILABLE", message: "Local final processing status is unavailable." }, requestId }, { status: 503 }); }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) return NextResponse.json({ data: null, error: { code: "INVALID_FINAL_JOB_REQUEST", message: "The final processing request is too large. Send media metadata only; file contents stay in the browser." }, requestId }, { status: 413 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return NextResponse.json({ data: null, error: { code: "INVALID_FINAL_JOB_REQUEST", message: "The final processing request is too large. Send media metadata only; file contents stay in the browser." }, requestId }, { status: 413 });
    const metadata = createFinalJobRequestSchema.parse(JSON.parse(raw));
    const job = await finalJobCoordinator.create(metadata);
    const envelope = finalJobEnvelopeSchema.parse({ data: job, error: null, requestId });
    return NextResponse.json(envelope, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FinalJobError) return NextResponse.json({ data: null, error: { code: error.code, message: error.message }, requestId }, { status: ["MODEL_UNAVAILABLE", "RUNTIME_UNAVAILABLE", "STORAGE_UNAVAILABLE"].includes(error.code) ? 503 : 400 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ data: null, error: { code: "INVALID_FINAL_JOB_REQUEST", message: "Review the selected media and output settings. Only validated metadata is accepted." }, requestId }, { status: 400 });
    return NextResponse.json({ data: null, error: { code: "FINAL_JOB_UNAVAILABLE", message: "The local final processing request could not be saved." }, requestId }, { status: 503 });
  }
}
