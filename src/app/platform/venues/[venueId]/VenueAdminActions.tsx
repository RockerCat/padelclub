"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff, Link2, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Input } from "@/components/ui";
import { missingForPublication, type PadelVenueAdmin } from "@/lib/directory";
import { checkSlugAvailability } from "@/app/onboarding/actions";
import {
  convertVenueToPendingClubAction,
  deleteVenueDraftAction,
  linkVenueClubAction,
  setVenueStatusAction,
} from "../actions";

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 [&>option]:bg-brand-surface";

// Misma generación de slug que PendingClubFields (Entrega de Club).
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Props {
  venue: PadelVenueAdmin;
  clubs: { id: string; name: string; slug: string }[];
}

type Pending = null | "status" | "link" | "unlink" | "convert" | "delete";

export function VenueAdminActions({ venue, clubs }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "unlink" | "delete" | "unpublish">(null);
  const [clubId, setClubId] = useState("");
  const [showConvert, setShowConvert] = useState(false);
  const [convertName, setConvertName] = useState(venue.name);
  const [convertSlug, setConvertSlug] = useState(generateSlug(venue.name));
  const [convertVisibility, setConvertVisibility] = useState<"private" | "public">("private");
  const [slugStatus, setSlugStatus] = useState<string | null>(null);

  const missing = missingForPublication(venue);
  const canDelete = venue.status === "draft" && !venue.publishedAt && !venue.clubId && venue.matchCount === 0;

  async function run<T>(kind: Pending, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, after?: (data: T) => void) {
    setPending(kind);
    setError(null);
    const result = await fn();
    setPending(null);
    setConfirm(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (after) after(result.data);
    else router.refresh();
  }

  async function checkSlug(slug: string) {
    if (slug.length < 3) {
      setSlugStatus("Usa al menos 3 caracteres.");
      return;
    }
    const { available } = await checkSlugAvailability(slug);
    setSlugStatus(available ? "Identificador disponible" : "Identificador no disponible");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Publicación */}
      <section className="rounded-2xl border border-white/10 bg-brand-surface p-4">
        <h2 className="text-sm font-semibold text-white">Publicación</h2>
        <p className="mt-1 text-xs text-brand-muted">
          {venue.status === "published"
            ? "Visible para visitantes y jugadores en /clubs y al crear partidos."
            : "No visible públicamente. Los partidos que ya lo usan conservan la referencia."}
        </p>
        {venue.status !== "published" && missing.length > 0 && (
          <p className="mt-2 text-xs text-amber-300">Para publicar falta: {missing.join(", ")}.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {venue.status !== "published" ? (
            <Button
              size="sm"
              disabled={missing.length > 0}
              loading={pending === "status"}
              onClick={() => run("status", () => setVenueStatusAction(venue.id, "published"))}
            >
              <Eye className="h-4 w-4" /> Publicar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirm("unpublish")}>
              <EyeOff className="h-4 w-4" /> Despublicar
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm("delete")}>
              <Trash2 className="h-4 w-4" /> Borrar borrador
            </Button>
          )}
        </div>
      </section>

      {/* Club SaaS */}
      <section className="rounded-2xl border border-white/10 bg-brand-surface p-4">
        <h2 className="text-sm font-semibold text-white">Club en Mi Pádel Club</h2>
        {venue.club ? (
          <>
            <p className="mt-1 text-xs text-brand-muted">
              Vinculado a un club del SaaS. La ficha conserva su id y los partidos su referencia. En /clubs se muestra
              una sola vez, como el club
              {!venue.club.isActive || venue.club.archived ? " (hoy no visible: el club está desactivado o archivado)" : ""}.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/platform/clubs/${venue.club.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline">
                <Building2 className="h-4 w-4" /> {venue.club.name} ({venue.club.slug})
              </Link>
              {venue.club.pendingClaim && <span className="text-xs text-amber-300">Pendiente de entrega</span>}
              <Button size="sm" variant="ghost" onClick={() => setConfirm("unlink")}>
                Desvincular
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-brand-muted">
              No es cliente del SaaS. Vincúlalo a un club existente o, cuando el establecimiento contrate, prepara su club
              con Entrega de Club. Nada de esto crea propietarios, claim links ni suscripciones por sí solo.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select aria-label="Club existente" className={selectClass} value={clubId} onChange={(e) => setClubId(e.target.value)}>
                <option value="">Elegir club existente…</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-10 shrink-0"
                disabled={!clubId}
                loading={pending === "link"}
                onClick={() => run("link", () => linkVenueClubAction(venue.id, clubId))}
              >
                <Link2 className="h-4 w-4" /> Vincular
              </Button>
            </div>

            {!showConvert ? (
              <button type="button" onClick={() => setShowConvert(true)} className="mt-3 text-left text-xs font-medium text-brand-primary hover:underline">
                Preparar club pendiente desde esta ficha (Entrega de Club)
              </button>
            ) : (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 p-3">
                <p className="text-xs text-brand-muted">
                  Crea un club pendiente de entrega con los datos públicos de la ficha (municipio, dirección, coordenadas,
                  WhatsApp), igual que &quot;Crear club&quot; en Clubes. Tú quedas como propietario temporal hasta generar el
                  enlace de entrega desde el club; la prueba comercial solo empieza cuando el propietario definitivo lo
                  reclama.
                </p>
                <Input id="cv-name" label="Nombre del club" value={convertName} onChange={(e) => setConvertName(e.target.value)} />
                <div className="flex flex-col gap-1.5">
                  <Input
                    id="cv-slug"
                    label="Identificador único"
                    value={convertSlug}
                    onChange={(e) => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
                      setConvertSlug(v);
                      setSlugStatus(null);
                    }}
                    onBlur={() => checkSlug(convertSlug)}
                  />
                  {slugStatus && <p className="text-xs text-brand-muted">{slugStatus}</p>}
                </div>
                <select
                  aria-label="Visibilidad"
                  className={selectClass}
                  value={convertVisibility}
                  onChange={(e) => setConvertVisibility(e.target.value === "public" ? "public" : "private")}
                >
                  <option value="private">Privado (recomendado mientras se prepara)</option>
                  <option value="public">Público</option>
                </select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={pending === "convert"}
                    onClick={() =>
                      run(
                        "convert",
                        () => convertVenueToPendingClubAction(venue.id, { name: convertName, slug: convertSlug, visibility: convertVisibility }),
                        (club) => router.push(`/platform/clubs/${club.id}`)
                      )
                    }
                  >
                    Crear club pendiente
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowConvert(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <ConfirmDialog
        open={confirm === "unpublish"}
        title="Despublicar establecimiento"
        message="Dejará de aparecer en el directorio y no podrá elegirse en partidos nuevos. Los partidos existentes conservan la referencia."
        confirmLabel="Despublicar"
        loading={pending === "status"}
        onConfirm={() => run("status", () => setVenueStatusAction(venue.id, "unpublished"))}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "unlink"}
        title="Desvincular club"
        message="La ficha deja de mostrarse como el club en el directorio. No cambia nada del club ni de sus miembros."
        confirmLabel="Desvincular"
        loading={pending === "unlink"}
        onConfirm={() => run("unlink", () => linkVenueClubAction(venue.id, null))}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Borrar borrador"
        message="Se elimina definitivamente. Solo es posible porque nunca se publicó ni tiene referencias."
        confirmLabel="Borrar"
        confirmVariant="danger"
        loading={pending === "delete"}
        onConfirm={() => run("delete", () => deleteVenueDraftAction(venue.id), () => router.push("/platform/venues"))}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
