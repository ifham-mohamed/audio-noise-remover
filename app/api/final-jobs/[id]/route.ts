import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FinalJobError, finalJobCommandSchema, finalJobEnvelopeSchema } from "@/shared/contracts/final-job";
import { finalJobCoordinator } from "@/server/domain/final-job-coordinator";

const MAX_EVENT_BYTES = 16 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try { const { id } = await context.params; return NextResponse.json(finalJobEnvelopeSchema.parse({ data: finalJobCoordinator.get(id), error: null, requestId }), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const missing = error instanceof FinalJobError && error.code === "JOB_NOT_FOUND"; return NextResponse.json({ data: null, error: { code: missing ? "JOB_NOT_FOUND" : "FINAL_JOB_UNAVAILABLE", message: missing ? error.message : "Local final processing status is unavailable." }, requestId }, { status: missing ? 404 : 503 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_EVENT_BYTES) return NextResponse.json({ data: null, error: { code: "INVALID_FINAL_JOB_EVENT", message: "The final processing update is too large." }, requestId }, { status: 413 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BYTES) return NextResponse.json({ data: null, error: { code: "INVALID_FINAL_JOB_EVENT", message: "The final processing update is too large." }, requestId }, { status: 413 });
    const command = finalJobCommandSchema.parse(JSON.parse(raw));
    const job = command.command === "cancel" ? finalJobCoordinator.cancel(id) : finalJobCoordinator.consume(id, command.event);
    return NextResponse.json(finalJobEnvelopeSchema.parse({ data: job, error: null, requestId }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ data: null, error: { code: "INVALID_FINAL_JOB_EVENT", message: "The final processing update was invalid and was ignored." }, requestId }, { status: 400 });
    if (error instanceof FinalJobError) return NextResponse.json({ data: null, error: { code: error.code, message: error.message }, requestId }, { status: error.code === "JOB_NOT_FOUND" ? 404 : 409 });
    return NextResponse.json({ data: null, error: { code: "FINAL_JOB_UNAVAILABLE", message: "The local final processing update could not be saved." }, requestId }, { status: 503 });
  }
}
