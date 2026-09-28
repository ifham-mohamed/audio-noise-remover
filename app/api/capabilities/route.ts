import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { capabilityDetector } from "@/server/adapters/capability-detector";
import { capabilityReportSchema } from "@/shared/contracts/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  try {
    const detected = await capabilityDetector.detect();
    const data = capabilityReportSchema.parse({ ...detected, requestId });
    return NextResponse.json({ data, error: null, requestId });
  } catch {
    return NextResponse.json({ data: null, error: { code: "RUNTIME_CHECK_FAILED", message: "Local readiness checks could not be completed." }, requestId }, { status: 500 });
  }
}
