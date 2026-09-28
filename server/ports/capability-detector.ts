import type { CapabilityReport } from "@/shared/contracts/capabilities";

export type CapabilityDetector = {
  detect: () => Promise<CapabilityReport>;
};
