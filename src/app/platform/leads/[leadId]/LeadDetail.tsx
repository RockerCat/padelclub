"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle, Plus, ExternalLink } from "lucide-react";
import { Badge, Button, Toast } from "@/components/ui";
import { updateLeadStatus, updateLeadNotes } from "./actions";

export type PlatformLeadDetailRow = {
  id: string;
  contact_name: string;
  club_name: string;
  city: string;
  whatsapp: string;
  number_of_courts: number | null;
  source: string;
  status: "new" | "contacted" | "demo_scheduled" | "demo_completed" | "won" | "lost";
  notes: string | null;
  lost_reason: string | null;
  demo_at: string | null;
  converted_club_id: string | null;
  converted_club_name: string | null;
  converted_club_slug: string | null;
  privacy_consent_at: string;
  created_at: string;
  updated_at: string;
  converted_at: string | null;
};

const STATUS_OPTIONS: { value: PlatformLeadDetailRow["status"]; label: string }[] = [
  { value: "new", label: "Nuevo" },
  { value: "contacted", label: "Contactado" },
  { value: "demo_scheduled", label: "Demo agendada" },
  { value: "demo_completed", label: "Demo realizada" },
  { value: "won", label: "Ganado" },
  { value: "lost", label: "Perdido" },
];

const STATUS_BADGE: Record<PlatformLeadDetailRow["status"], "primary" | "secondary" | "warning" | "success" | "danger"> = {
  new: "primary",
  contacted: "secondary",
  demo_scheduled: "warning",
  demo_completed: "warning",
  won: "success",
  lost: "danger",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// datetime-local necesita "YYYY-MM-DDTHH:mm" en hora local del navegador —
// nunca la representación UTC de toISOString() a secas.
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Construye el enlace de contacto inicial hacia el prospecto. A diferencia
// de un enlace de "compartir" genérico (que no tiene destinatario fijo y
// por eso usa api.whatsapp.com/send?text= — ver WhatsApp Share Principles),
// este SÍ apunta a un número específico ya normalizado, así que usa el
// formato oficial de click-to-chat de WhatsApp: wa.me/<phone>?text=. Nunca
// api.whatsapp.com/send con phone+text combinados: confirmado en QA real
// que esa combinación concreta duplica el texto prellenado en el
// compositor de WhatsApp (la app procesa el parámetro `text` dos veces a
// lo largo de su cadena de redirección interna cuando ambos parámetros
// viajan juntos ahí). wa.me/<phone>?text= es el mismo formato que ya usa
// MARKETING_WA_URL en producción sin ese problema — el bug de codificación
// UTF-8 documentado en WhatsApp Share Principles es específico de
// wa.me/?text= SIN número de teléfono en la ruta, un caso distinto. El
// mensaje se arma como string Unicode plano y se codifica una sola vez.
function buildLeadWhatsappUrl(phone: string, contactName: string): string {
  const greeting = contactName ? `Hola ${contactName}` : "Hola";
  const message = `${greeting}, soy Alex de Mi Pádel Club. Recibimos tu solicitud para conocer nuestra plataforma. Quisiera coordinar contigo una breve demo para mostrarte cómo puede funcionar en tu club.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function LeadDetail({ lead }: { lead: PlatformLeadDetailRow }) {
  const [statusDraft, setStatusDraft] = useState<PlatformLeadDetailRow["status"]>(lead.status);
  const [demoAtDraft, setDemoAtDraft] = useState(toDatetimeLocalValue(lead.demo_at));
  const [lostReasonDraft, setLostReasonDraft] = useState(lead.lost_reason ?? "");
  const [notesDraft, setNotesDraft] = useState(lead.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  const [notesPending, startNotesTransition] = useTransition();

  const statusDirty = statusDraft !== lead.status
    || (statusDraft === "demo_scheduled" && demoAtDraft !== toDatetimeLocalValue(lead.demo_at))
    || (statusDraft === "lost" && lostReasonDraft.trim() !== (lead.lost_reason ?? "").trim());
  const notesDirty = notesDraft.trim() !== (lead.notes ?? "").trim();

  function handleSaveStatus() {
    setError(null);
    startStatusTransition(async () => {
      const demoAtIso = statusDraft === "demo_scheduled" && demoAtDraft ? new Date(demoAtDraft).toISOString() : undefined;
      const result = await updateLeadStatus(lead.id, statusDraft, demoAtIso, lostReasonDraft || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast("Estado actualizado.");
    });
  }

  function handleSaveNotes() {
    setError(null);
    startNotesTransition(async () => {
      const result = await updateLeadNotes(lead.id, notesDraft);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast("Notas guardadas.");
    });
  }

  return (
    <div>
      {/* ── Información general ─────────────────────────────────────── */}
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">{lead.contact_name}</h1>
            <p className="text-sm text-brand-muted">{lead.club_name} · {lead.city}</p>
          </div>
          <Badge variant={STATUS_BADGE[lead.status]} size="sm">
            {STATUS_OPTIONS.find((o) => o.value === lead.status)?.label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 text-sm">
          <div>
            <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">WhatsApp</p>
            <p className="text-white">{lead.whatsapp}</p>
          </div>
          <div>
            <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Canchas</p>
            <p className="text-white">{lead.number_of_courts ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Origen</p>
            <p className="text-white capitalize">{lead.source}</p>
          </div>
          <div>
            <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Creado</p>
            <p className="text-white">{formatDateTime(lead.created_at)}</p>
          </div>
          {lead.demo_at && (
            <div>
              <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Demo</p>
              <p className="text-white">{formatDateTime(lead.demo_at)}</p>
            </div>
          )}
          {lead.status === "lost" && lead.lost_reason && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs text-brand-muted uppercase tracking-wider mb-1">Motivo de pérdida</p>
              <p className="text-white">{lead.lost_reason}</p>
            </div>
          )}
        </div>

        <a
          href={buildLeadWhatsappUrl(lead.whatsapp, lead.contact_name)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500/90"
        >
          <MessageCircle className="w-4 h-4" />
          Contactar por WhatsApp
        </a>
      </div>

      {/* ── Conversión — reutiliza Entrega de Club existente ──────────── */}
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Conversión
        </h2>
        {lead.converted_club_id ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-white">{lead.converted_club_name ?? "—"}</p>
              {lead.converted_at && (
                <p className="text-xs text-brand-muted mt-0.5">
                  Convertido el {formatDateTime(lead.converted_at)}
                </p>
              )}
            </div>
            <Link href={`/platform/clubs/${lead.converted_club_id}`}>
              <Button size="sm" variant="secondary">
                <ExternalLink className="w-3.5 h-3.5" />
                Ver club
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-brand-muted leading-relaxed max-w-sm">
              Crea el club pendiente para este prospecto — reutiliza el mismo flujo de Entrega de Club, prellenado con el nombre del club.
            </p>
            <Link href={`/platform/clubs/create?lead=${lead.id}`} className="shrink-0">
              <Button size="sm">
                <Plus className="w-3.5 h-3.5" />
                Crear club
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ── Estado ─────────────────────────────────────────────────────── */}
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Estado
        </h2>
        <div className="flex flex-col gap-3">
          <select
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value as PlatformLeadDetailRow["status"])}
            className="h-10 w-full sm:w-64 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-brand-surface">
                {opt.label}
              </option>
            ))}
          </select>

          {statusDraft === "demo_scheduled" && (
            <div className="flex flex-col gap-1.5 max-w-xs">
              <label className="text-sm font-medium text-white/80">Fecha y hora de la demo</label>
              <input
                type="datetime-local"
                value={demoAtDraft}
                onChange={(e) => setDemoAtDraft(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50"
              />
            </div>
          )}

          {statusDraft === "lost" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">Motivo de pérdida</label>
              <input
                type="text"
                value={lostReasonDraft}
                onChange={(e) => setLostReasonDraft(e.target.value)}
                maxLength={500}
                placeholder="Ej. no respondió, precio, sin canchas propias..."
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50"
              />
            </div>
          )}

          <Button
            size="sm"
            className="self-start"
            disabled={!statusDirty}
            loading={statusPending}
            onClick={handleSaveStatus}
          >
            Guardar estado
          </Button>
        </div>
      </div>

      {/* ── Notas internas ─────────────────────────────────────────────── */}
      <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Notas internas
        </h2>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="Notas visibles solo para SUPERADMIN..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 resize-y"
        />
        <Button
          size="sm"
          className="mt-3"
          disabled={!notesDirty}
          loading={notesPending}
          onClick={handleSaveNotes}
        >
          Guardar notas
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          {error}
        </p>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
