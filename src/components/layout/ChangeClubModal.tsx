"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { SettingsModuleModal } from "@/app/(app)/[club]/admin/settings/SettingsModuleModal";
import { Badge } from "@/components/ui";
import { getOwnerClubs, type OwnerClubRow } from "@/lib/actions/clubSwitcher";
import { updateLastClub } from "@/lib/actions/profile";
import { resolveOwnerSwitchPath } from "@/lib/utils/navigation";
import { clubRoleLabel } from "@/lib/roleLabels";
import { CLUB_PRIMARY_COLOR } from "@/lib/constants/clubTheme";

interface ChangeClubModalProps {
  currentClubId: string;
  currentClubSlug: string;
  onClose: () => void;
  // Cierra este selector y abre CreateClubModal — nunca navega a
  // /clubs/create desde aquí, y AppNav garantiza que ambos modales nunca
  // quedan montados a la vez (un único activeClubModal, ver AppNav).
  onCreateClub: () => void;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Selector compacto para OWNER, el único rol que puede pertenecer a varios
// clubes como propietario (ver CLAUDE.md → Role Philosophy) — reemplaza la
// navegación a /clubs desde el menú superior (ver AppNav) sin sacar al
// usuario de la pantalla actual. Mismo shell que el resto de modales de
// Ajustes (SettingsModuleModal) — nunca un segundo componente de modal —
// con un focus trap propio de este archivo, ya que SettingsModuleModal no
// lo implementa para ningún otro llamador (auditado). El retorno de foco al
// botón que abrió el modal lo maneja AppNav (mismo elemento usado para
// abrir y para reenfocar al cerrar).
export function ChangeClubModal({ currentClubId, currentClubSlug, onClose, onCreateClub }: ChangeClubModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  const [clubs, setClubs] = useState<OwnerClubRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    getOwnerClubs().then((result) => {
      setLoading(false);
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      // Club actual primero, resto en el orden ya devuelto (alfabético,
      // ver getOwnerClubs) — sort() es estable, así que esto nunca reordena
      // el resto entre sí.
      setClubs([...result.clubs].sort((a) => (a.id === currentClubId ? -1 : 0)));
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foco inicial — una sola vez al montar. El primer elemento enfocable del
  // panel es siempre el botón "Cerrar" (X) de SettingsModuleModal, que se
  // renderiza antes que este contenido — un destino de foco inicial
  // razonable incluso mientras el skeleton todavía está cargando.
  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, []);

  // Focus trap — consulta el DOM en vivo en cada Tab (nunca una lista
  // memorizada), así que sigue funcionando correctamente sin volver a
  // suscribirse cuando el contenido cambia (skeleton → filas, error →
  // reintento, etc.).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleSelect(club: OwnerClubRow) {
    if (navigatingId || club.id === currentClubId) return;
    setNavigatingId(club.id);
    try {
      await updateLastClub(club.id);
    } catch {
      // Best-effort, igual que UpdateLastClub — un fallo aquí nunca debe
      // impedir la navegación en sí.
    }
    const destination = resolveOwnerSwitchPath(pathname, currentClubSlug, club.slug);
    onClose();
    router.push(destination);
  }

  return (
    <SettingsModuleModal title="Cambiar de club" onClose={onClose} panelRef={panelRef}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-brand-muted">Selecciona el club que deseas administrar.</p>

        {loading && (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span role="status" className="sr-only">
              Cargando tus clubes
            </span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-red-400">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>
          </div>
        )}

        {!loading && !loadError && clubs && (
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {clubs.length === 0 && (
              <p className="text-sm text-brand-muted text-center py-4">No administras ningún otro club todavía.</p>
            )}

            {clubs.map((club) => {
              const isCurrent = club.id === currentClubId;
              const isNavigating = navigatingId === club.id;

              const rowContent = (
                <>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
                    style={{ backgroundColor: `${CLUB_PRIMARY_COLOR}22`, color: CLUB_PRIMARY_COLOR }}
                  >
                    {club.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={club.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getInitials(club.name)
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate min-w-0">{club.name}</span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-md shrink-0">
                          <Check className="w-3 h-3" />
                          Actual
                        </span>
                      )}
                    </div>
                    <Badge variant="primary" size="sm" className="mt-1">
                      {clubRoleLabel("OWNER")}
                    </Badge>
                  </div>

                  <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                    {isNavigating ? (
                      <Loader2 className="w-4 h-4 text-brand-muted animate-spin" />
                    ) : !isCurrent ? (
                      <ChevronRight className="w-4 h-4 text-brand-muted" />
                    ) : null}
                  </span>
                </>
              );

              // Club actual — nunca "Entrar" activo, solo el indicador
              // "Actual" (no solo color: check + texto).
              if (isCurrent) {
                return (
                  <div
                    key={club.id}
                    aria-current="true"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] cursor-default"
                  >
                    {rowContent}
                  </div>
                );
              }

              return (
                <button
                  key={club.id}
                  type="button"
                  onClick={() => handleSelect(club)}
                  disabled={navigatingId !== null}
                  aria-label={`Entrar a ${club.name}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-brand-surface hover:border-brand-primary/25 hover:bg-brand-primary/5 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {rowContent}
                </button>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onCreateClub}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-brand-muted hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear otro club
          </button>
        </div>
      </div>
    </SettingsModuleModal>
  );
}
