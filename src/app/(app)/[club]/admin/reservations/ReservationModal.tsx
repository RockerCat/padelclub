"use client";

import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import {
  createReservation,
  updateReservation,
  getReservationForEdit,
} from "./actions";
import type { ReservationEditData, ReservationFormState } from "./actions";
import { ReservationForm } from "./ReservationForm";

type Court = { id: string; name: string };
type Member = { profile_id: string; full_name: string | null };

export type ModalState = {
  mode: "create" | "edit";
  reservationId?: string;
  initialDate?: string;
  initialCourtId?: string;
  initialStartTime?: string;
};

interface ReservationModalProps {
  modalState: ModalState | null;
  clubId: string;
  clubSlug: string;
  courts: Court[];
  members: Member[];
  onClose: () => void;
  onSuccess: (mode: "create" | "edit") => void;
}

export function ReservationModal({
  modalState,
  clubId,
  clubSlug,
  courts,
  members,
  onClose,
  onSuccess,
}: ReservationModalProps) {
  const [editData, setEditData] = useState<ReservationEditData | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  // Keep ref in sync with state (so event handlers always read fresh value)
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // Fetch edit data when opening in edit mode
  useEffect(() => {
    if (!modalState || modalState.mode !== "edit" || !modalState.reservationId) return;
    setLoadingEdit(true);
    setEditData(null);
    setIsDirty(false);
    getReservationForEdit(clubId, modalState.reservationId).then((data) => {
      setEditData(data);
      setLoadingEdit(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalState?.mode, modalState?.reservationId]);

  // Reset dirty when modal opens fresh
  useEffect(() => {
    if (modalState) setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalState?.mode, modalState?.reservationId]);

  // Lock body scroll
  useEffect(() => {
    if (!modalState) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [!!modalState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  useEffect(() => {
    if (!modalState) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") tryClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!modalState]);

  function tryClose() {
    if (isDirtyRef.current) {
      if (!window.confirm("¿Descartar los cambios sin guardar?")) return;
    }
    onClose();
  }

  if (!modalState) return null;

  const isCreate = modalState.mode === "create";
  const title = isCreate ? "Nueva reserva" : "Editar reserva";

  // Build action bound for this specific call
  let boundAction:
    | ((prev: ReservationFormState, fd: FormData) => Promise<ReservationFormState>)
    | undefined;

  if (isCreate) {
    boundAction = createReservation.bind(null, clubId, clubSlug, true);
  } else if (modalState.reservationId && !loadingEdit && editData) {
    boundAction = updateReservation.bind(
      null,
      clubId,
      clubSlug,
      modalState.reservationId,
      true
    );
  }

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const initialValues = isCreate
    ? {
        date: modalState.initialDate,
        court_id: modalState.initialCourtId,
        start_time: modalState.initialStartTime,
      }
    : editData
    ? {
        court_id: editData.court_id,
        date: editData.date,
        start_time: editData.start_time.slice(0, 5),
        duration_minutes: editData.duration_minutes,
        type: editData.type,
        title: editData.title ?? undefined,
        notes: editData.notes ?? undefined,
        player_ids: editData.player_ids,
      }
    : undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={tryClose}
        aria-hidden
      />

      {/* Panel — bottom sheet on mobile, centered dialog on desktop */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[560px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={tryClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-5">
            {loadingEdit ? (
              <div className="py-16 text-center text-sm text-brand-muted">
                Cargando reserva…
              </div>
            ) : boundAction ? (
              <ReservationForm
                key={`${modalState.mode}-${modalState.reservationId ?? "new"}-${modalState.initialDate ?? ""}`}
                action={boundAction}
                courts={courts}
                members={members}
                defaultDate={modalState.initialDate ?? today}
                clubId={clubId}
                initialValues={initialValues}
                submitLabel={isCreate ? "Crear reserva" : "Guardar cambios"}
                cancelHref={`/${clubSlug}/admin/reservations`}
                onSuccess={() => onSuccess(modalState.mode)}
                onDirtyChange={setIsDirty}
                inModal
                editingReservationId={isCreate ? undefined : modalState.reservationId}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
