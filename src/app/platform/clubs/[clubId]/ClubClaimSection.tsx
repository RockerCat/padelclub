"use client";

import { useState, useTransition } from "react";
import NextLink from "next/link";
import { Link as LinkIcon, Copy, Check, RotateCw, X, AlertTriangle, Settings } from "lucide-react";
import { Badge, Button, ConfirmDialog } from "@/components/ui";
import { generateClaimLink, revokeClaimLink } from "./actions";
import { getClubEntryPath } from "@/lib/utils/navigation";

export type ClubClaimStatus = {
  status: "pending" | "claimed" | "revoked";
  created_at: string;
  claimed_at: string | null;
  claimed_by_name: string | null;
  claimed_by_email: string | null;
} | null;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<"pending" | "claimed" | "revoked", { text: string; variant: "warning" | "success" | "default" }> = {
  pending: { text: "Pendiente", variant: "warning" },
  claimed: { text: "Reclamado", variant: "success" },
  revoked: { text: "Revocado", variant: "default" },
};

interface ClubClaimSectionProps {
  clubId: string;
  clubSlug: string;
  initialStatus: ClubClaimStatus;
}

// Entrega de Club — the raw claim URL only ever exists in this component's
// own local state, right after generateClaimLink returns it. It is never
// persisted (only its hash is stored server-side), so there is no way to
// recover it after leaving/reloading this page — only "Regenerar enlace"
// to mint a new one. This is the deliberate, expected consequence of
// hash-only storage, not a bug.
export function ClubClaimSection({ clubId, clubSlug, initialStatus }: ClubClaimSectionProps) {
  const [claimStatus, setClaimStatus] = useState(initialStatus);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"generate" | "revoke" | null>(null);
  const [pending, startTransition] = useTransition();

  const claimUrl =
    freshToken && typeof window !== "undefined" ? `${window.location.origin}/claim-club/${freshToken}` : null;

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateClaimLink(clubId);
      if (result.error) {
        setError(result.error);
        setConfirmAction(null);
        return;
      }
      setFreshToken(result.token ?? null);
      setCopied(false);
      setClaimStatus({
        status: "pending",
        created_at: new Date().toISOString(),
        claimed_at: null,
        claimed_by_name: null,
        claimed_by_email: null,
      });
      setConfirmAction(null);
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeClaimLink(clubId);
      if (result.error) {
        setError(result.error);
        setConfirmAction(null);
        return;
      }
      setFreshToken(null);
      setClaimStatus((prev) => (prev ? { ...prev, status: "revoked" } : prev));
      setConfirmAction(null);
    });
  }

  function handleCopy() {
    if (!claimUrl) return;
    navigator.clipboard.writeText(claimUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const badge = claimStatus ? STATUS_LABEL[claimStatus.status] : null;

  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
          Entrega del club
        </h2>
        {badge && <Badge variant={badge.variant} size="sm">{badge.text}</Badge>}
      </div>

      {claimStatus?.status !== "claimed" && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs text-brand-muted leading-relaxed">
            Mientras el club no sea reclamado, puedes configurarlo como si fueras su propietario: branding,
            ubicación, canchas, horarios, tarifas y administradores.
          </p>
          <NextLink href={getClubEntryPath(clubSlug, "OWNER")} className="shrink-0">
            <Button size="sm" variant="secondary">
              <Settings className="w-3.5 h-3.5" />
              Configurar club
            </Button>
          </NextLink>
        </div>
      )}

      {!claimStatus && (
        <p className="text-sm text-brand-muted mb-4">
          Este club aún no tiene un enlace de activación. Genera uno para entregárselo a su propietario definitivo.
        </p>
      )}

      {claimStatus?.status === "claimed" && (
        <div className="mb-4">
          <p className="text-sm font-medium text-white">
            {claimStatus.claimed_by_name ?? "—"}
          </p>
          <p className="text-sm text-brand-muted">{claimStatus.claimed_by_email ?? "—"}</p>
          {claimStatus.claimed_at && (
            <p className="text-xs text-brand-muted/70 mt-1">
              Reclamado el {formatDateTime(claimStatus.claimed_at)}
            </p>
          )}
        </div>
      )}

      {claimStatus?.status === "revoked" && (
        <p className="text-sm text-brand-muted mb-4">
          El último enlace fue revocado. Genera uno nuevo para continuar la entrega.
        </p>
      )}

      {claimUrl && claimStatus?.status === "pending" && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200 leading-relaxed">
              Cópialo ahora — por seguridad no se guarda en texto plano y no podrá volver a mostrarse.
              Si lo pierdes, deberás regenerar el enlace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-xs text-white bg-black/20 rounded-lg px-3 py-2">
              {claimUrl}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-brand-muted hover:text-white hover:border-white/20 transition-colors shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        {(!claimStatus || claimStatus.status === "revoked") && (
          <Button size="sm" loading={pending} onClick={handleGenerate}>
            <LinkIcon className="w-3.5 h-3.5" />
            Generar enlace de activación
          </Button>
        )}

        {claimStatus?.status === "pending" && (
          <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirmAction("generate")}>
              <RotateCw className="w-3.5 h-3.5" />
              Regenerar enlace
            </Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmAction("revoke")}>
              <X className="w-3.5 h-3.5" />
              Revocar enlace
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction === "generate"}
        title="Regenerar enlace"
        message="El enlace actual dejará de funcionar de inmediato y se reemplazará por uno nuevo. Cualquier persona que tenga el enlace anterior ya no podrá usarlo."
        confirmLabel="Regenerar"
        loading={pending}
        onConfirm={handleGenerate}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "revoke"}
        title="Revocar enlace"
        message="El enlace dejará de funcionar de inmediato. Podrás generar uno nuevo cuando quieras."
        confirmLabel="Revocar"
        confirmVariant="danger"
        loading={pending}
        onConfirm={handleRevoke}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
