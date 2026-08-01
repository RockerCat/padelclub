"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EntryCard } from "./EntryCard";
import type { TournamentEntryWithMembers } from "@/lib/tournamentEntries";

interface WithdrawnEntriesAccordionProps {
  entries: TournamentEntryWithMembers[];
  // "Miembro del club" — mismo modal/estado que Ranking/Clasificación
  // (useMemberModal), nunca una copia.
  avatarsClickable: boolean;
  onSelectMember: (clubMemberId: string) => void;
  loadingMemberId: string | null;
}

// No existe un Accordion/Collapsible genérico en src/components/ui/
// (auditado) — se usa el mismo patrón "hecho a mano" ya establecido en el
// resto del módulo (ConfirmDialog, modales), sin librería nueva. `entries`
// llega ya filtrado por el llamador desde la misma colección que ya carga
// el detalle del torneo — nunca una consulta propia. Solo informativo:
// EntryCard se usa sin `actions`, así que nunca muestra Confirmar/
// Rechazar/Retirar.
export function WithdrawnEntriesAccordion({
  entries,
  avatarsClickable,
  onSelectMember,
  loadingMemberId,
}: WithdrawnEntriesAccordionProps) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-medium text-white/80">Duplas retiradas ({entries.length})</span>
        <ChevronDown
          className={`w-4 h-4 text-brand-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4" style={{ maxHeight: 360 }}>
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              avatarsClickable={avatarsClickable}
              onSelectMember={onSelectMember}
              loadingMemberId={loadingMemberId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
