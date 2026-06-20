"use client";

import { OperatingHoursForm } from "@/app/(app)/[club]/admin/settings/OperatingHoursForm";
import { AllowedDurationsForm } from "@/app/(app)/[club]/admin/settings/AllowedDurationsForm";
import type { OperatingHour } from "@/lib/operatingHours";

interface Step4Props {
  clubId: string;
  initialHours: OperatingHour[];
  allowedDurations: number[];
}

export function Step4Operations({ clubId, initialHours, allowedDurations }: Step4Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <OperatingHoursForm clubId={clubId} initialHours={initialHours} />
      </div>
      <div className="lg:col-span-1">
        <AllowedDurationsForm clubId={clubId} initialDurations={allowedDurations} />
      </div>
    </div>
  );
}
