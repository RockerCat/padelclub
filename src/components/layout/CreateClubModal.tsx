"use client";

import { SettingsModuleModal } from "@/app/(app)/[club]/admin/settings/SettingsModuleModal";
import { CreateClubFields } from "@/app/onboarding/CreateClubFields";

interface CreateClubModalProps {
  onClose: () => void;
}

// "Crear otro club" contextual — mismo formulario y misma server action que
// /clubs/create (CreateClubFields, extraído de OnboardingForm), nunca una
// segunda implementación. La creación exitosa navega mediante el propio
// redirect() de createClub (src/app/onboarding/actions.ts, vía
// getClubEntryPath) — este modal nunca decide el destino ni actualiza
// last_club_id él mismo: la navegación del App Router al nuevo club
// desmonta este árbol completo (incluido el modal) y UpdateLastClub, ya
// montado en [club]/layout.tsx, se encarga de last_club_id exactamente
// igual que hoy al aterrizar ahí. Un error de creación deja el modal
// montado con los valores ya escritos (CreateClubFields no se remonta,
// solo re-renderiza con el nuevo state del formulario) — nunca navega, nunca
// toca last_club_id.
export function CreateClubModal({ onClose }: CreateClubModalProps) {
  return (
    <SettingsModuleModal title="Crear otro club" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-brand-muted">Completa la información básica del nuevo club.</p>
        <CreateClubFields onCancel={onClose} />
      </div>
    </SettingsModuleModal>
  );
}
