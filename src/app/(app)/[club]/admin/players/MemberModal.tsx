"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Badge, Button, ConfirmDialog, Toast } from "@/components/ui";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PlayerCategoryBadge } from "@/components/players/PlayerCategoryBadge";
import { PLAYER_CATEGORIES, type PlayerCategory } from "@/types/database";
import { toggleMemberActive, updateMemberCategory, getMatchesPlayedCount } from "./actions";
import type { MemberRow } from "./MembersClient";

interface MemberModalProps {
  member: MemberRow;
  clubId: string;
  clubSlug: string;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Replaces the standalone /admin/players/[id] page for PLAYER members — same
// content (avatar/name/status header, "Información deportiva", activate/
// deactivate), just inline so the grid's filters/search/scroll never reset.
// Status and category are tracked as local state seeded from the prop and
// updated from each action's own result, instead of re-reading `member`
// after a router.refresh() — the grid's data refreshes in the background,
// but this modal instance doesn't get fresh props until it remounts.
export function MemberModal({ member, clubId, clubSlug, onClose }: MemberModalProps) {
  const router = useRouter();
  const name = member.profiles?.full_name ?? "Sin nombre";

  const [isActive, setIsActive] = useState(member.is_active);
  const [category, setCategory] = useState<PlayerCategory>(member.category ?? "Principiante");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savePending, startSave] = useTransition();
  const [togglePending, startToggle] = useTransition();

  // "Partidos jugados" — computed on demand, not stored on the member row,
  // so it can never drift out of sync with reservations. null = still
  // loading (renders the same "—" placeholder this field already had),
  // fetched fresh every time this modal opens for a member (a different
  // selectedMember always remounts this component — see MembersClient).
  const [matchesPlayed, setMatchesPlayed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMatchesPlayedCount(clubId, member.profile_id).then((result) => {
      if (!cancelled && typeof result.count === "number") setMatchesPlayed(result.count);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, member.profile_id]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function handleSave() {
    setError(null);
    startSave(async () => {
      const result = await updateMemberCategory(clubId, member.id, category, clubSlug);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      setToastMessage("Cambios guardados correctamente");
    });
  }

  function handleConfirmToggle() {
    const nextActive = !isActive;
    startToggle(async () => {
      const result = await toggleMemberActive(clubId, member.id, nextActive, clubSlug);
      setConfirmOpen(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsActive(nextActive);
      router.refresh();
      setToastMessage(nextActive ? "Miembro activado correctamente" : "Miembro desactivado correctamente");
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[400]"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[401] pointer-events-none">
        <div
          className="pointer-events-auto w-full md:w-[480px] bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "90dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal chrome — same as ConfirmDialog/ReservationModal */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">Miembro del club</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-6">
            {/* ─── Encabezado ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-4">
              <PlayerAvatar player={{ id: member.profile_id, ...member.profiles }} size="lg" />
              <div className="flex flex-col gap-1.5 min-w-0">
                <p className="text-base font-semibold text-white truncate">{name}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={isActive ? "success" : "default"} size="sm">
                    {isActive ? "Activo" : "Inactivo"}
                  </Badge>
                  <PlayerCategoryBadge category={category} size="sm" />
                </div>
              </div>
            </div>

            {/* ─── Información deportiva ──────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
                Información deportiva
              </h3>

              <div className="flex items-center justify-between text-sm gap-4">
                <span className="text-brand-muted">Categoría</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PlayerCategory)}
                  className="w-40 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
                >
                  {PLAYER_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-[#001A24]">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Ranking</span>
                <span className="text-white/60">—</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Partidos jugados</span>
                <span className="text-white/60">{matchesPlayed === null ? "—" : matchesPlayed}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">Fecha de ingreso</span>
                <span className="text-white">{formatDate(member.joined_at)}</span>
              </div>
            </div>

            {/* Future sections (historial de reservas, partidos, ranking
                interno, torneos/clínicas inscritas, estadísticas) will be
                added here as additional sibling blocks — not implemented yet. */}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}
          </div>

          {/* ─── Acciones ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/10 shrink-0">
            <Button
              type="button"
              variant={isActive ? "danger" : "secondary"}
              loading={togglePending}
              onClick={() => setConfirmOpen(true)}
            >
              {isActive ? "Desactivar miembro" : "Activar miembro"}
            </Button>
            <Button type="button" loading={savePending} onClick={handleSave}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={isActive ? "Desactivar miembro" : "Activar miembro"}
        message={
          isActive
            ? "¿Deseas desactivar a este miembro?\nDejará de tener acceso como jugador activo del club."
            : "¿Deseas activar a este miembro?\nVolverá a tener acceso como jugador activo del club."
        }
        confirmLabel={isActive ? "Desactivar miembro" : "Activar miembro"}
        confirmVariant={isActive ? "danger" : "success"}
        loading={togglePending}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </>
  );
}
