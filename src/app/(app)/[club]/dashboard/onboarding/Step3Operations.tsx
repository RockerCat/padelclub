"use client";

import { OperatingHoursForm } from "@/app/(app)/[club]/admin/settings/OperatingHoursForm";
import { AllowedDurationsForm } from "@/app/(app)/[club]/admin/settings/AllowedDurationsForm";
import type { OperatingHour } from "@/lib/operatingHours";

interface Step3Props {
  clubId: string;
  initialHours: OperatingHour[];
  allowedDurations: number[];
}

export function Step3Operations({ clubId, initialHours, allowedDurations }: Step3Props) {
  return (
    <div className="flex flex-col gap-4">
      <OperatingHoursForm clubId={clubId} initialHours={initialHours} />
      <AllowedDurationsForm clubId={clubId} initialDurations={allowedDurations} />
    </div>
  );
}
