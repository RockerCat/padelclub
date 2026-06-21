"use client";

import { Button } from "@/components/ui";
import { SettingsModuleModal } from "./SettingsModuleModal";
import { Step2Location, type Step2LocationClub } from "@/app/(app)/[club]/dashboard/onboarding/Step2Location";

const FORM_ID = "settings-location-form";

interface LocationModalProps {
  club: Step2LocationClub;
  onClose: () => void;
}

// Same component the onboarding wizard uses for this exact step — map,
// draggable marker and geocoding included, no simplified substitute.
export function LocationModal({ club, onClose }: LocationModalProps) {
  return (
    <SettingsModuleModal
      title="Ubicación del club"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <Step2Location club={club} formId={FORM_ID} onNext={onClose} />
    </SettingsModuleModal>
  );
}
