"use client";

import { SettingsModuleModal } from "./SettingsModuleModal";
import { Step4Operations } from "@/app/(app)/[club]/dashboard/onboarding/Step4Operations";
import type { OperatingHour } from "@/lib/operatingHours";

interface OperationModalProps {
  clubId: string;
  initialHours: OperatingHour[];
  allowedDurations: number[];
  onClose: () => void;
}

// Same component the onboarding wizard uses for this exact step — Horarios
// and Duraciones save themselves, so no shared footer button is needed here.
export function OperationModal({ clubId, initialHours, allowedDurations, onClose }: OperationModalProps) {
  return (
    <SettingsModuleModal title="Configura la operación" onClose={onClose} size="lg">
      <Step4Operations clubId={clubId} initialHours={initialHours} allowedDurations={allowedDurations} />
    </SettingsModuleModal>
  );
}
