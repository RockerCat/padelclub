"use client";

import { useState, useTransition } from "react";
import { Button, Badge } from "@/components/ui";
import { Link as LinkIcon, Copy, Check, Plus, X, ExternalLink } from "lucide-react";

export type InviteLinkRow = {
  id: string;
  token: string;
  uses: number;
  max_uses: number | null;
  is_active: boolean;
  created_at: string;
};

type InviteStatus = "available" | "used" | "revoked";

function getInviteStatus(link: InviteLinkRow): InviteStatus {
  if (link.uses > 0) return "used";
  if (!link.is_active) return "revoked";
  return "available";
}

const STATUS_LABEL: Record<InviteStatus, string> = {
  available: "Disponible",
  used: "Utilizada",
  revoked: "Revocada",
};

// Disponible first (needs attention/action), then Utilizada, then Revocada
// (purely historical) — relevance order, not creation order. Stable sort
// keeps each status group in the created_at order the caller already
// queried with.
const STATUS_PRIORITY: Record<InviteStatus, number> = {
  available: 0,
  used: 1,
  revoked: 2,
};

function sortByRelevance(links: InviteLinkRow[]): InviteLinkRow[] {
  return [...links].sort(
    (a, b) => STATUS_PRIORITY[getInviteStatus(a)] - STATUS_PRIORITY[getInviteStatus(b)]
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CopyButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-brand-muted hover:text-white hover:border-white/20 transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400">Copiado</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copiar enlace
        </>
      )}
    </button>
  );
}

interface InviteLinkListProps {
  links: InviteLinkRow[];
  createLabel: string;
  onCreate: () => Promise<{ error?: string } | void>;
  onRevoke: (linkId: string) => Promise<{ error?: string } | void>;
  onChanged: () => void;
}

// Shared by Jugadores and Equipo — invitations are single-use and never
// expire (the creating action inserts max_uses=1 and a far-future
// expires_at), so validity depends only on "not used yet" / "not revoked",
// surfaced here as an explicit status instead of an expiry date or use
// counter. Same component, same rules, regardless of which role the
// invitation grants.
export function InviteLinkList({ links, createLabel, onCreate, onRevoke, onChanged }: InviteLinkListProps) {
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [revoking, startRevoke] = useTransition();

  function handleCreate() {
    setError(null);
    startCreate(async () => {
      const result = await onCreate();
      if (result?.error) {
        setError(result.error);
      } else {
        onChanged();
      }
    });
  }

  function handleRevoke(linkId: string) {
    startRevoke(async () => {
      const result = await onRevoke(linkId);
      if (result?.error) setError(result.error);
      onChanged();
    });
  }

  return (
    <div>
      {links.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {sortByRelevance(links).map((link) => {
            const status = getInviteStatus(link);
            const isAvailable = status === "available";

            return (
              <div
                key={link.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  isAvailable ? "bg-white/5 border-white/10" : "bg-white/[0.02] border-white/5"
                }`}
              >
                <LinkIcon className={`w-4 h-4 shrink-0 ${isAvailable ? "text-brand-muted" : "text-brand-muted/40"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={status === "available" ? "success" : status === "used" ? "secondary" : "default"}
                      size="sm"
                    >
                      {STATUS_LABEL[status]}
                    </Badge>
                    <span className="text-xs text-brand-muted">
                      Creada {formatDate(link.created_at)}
                    </span>
                  </div>
                </div>
                {isAvailable && (
                  <div className="flex items-center gap-2 shrink-0">
                    <CopyButton token={link.token} />
                    {process.env.NODE_ENV === "development" && (
                      <a
                        href={`/invite/${link.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                        title="Dev: abrir invitación directamente"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Dev
                      </a>
                    )}
                    <button
                      onClick={() => handleRevoke(link.id)}
                      disabled={revoking}
                      className="p-1.5 rounded-lg text-brand-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Revocar invitación"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      <Button size="sm" variant="secondary" loading={creating} onClick={handleCreate}>
        <Plus className="w-3.5 h-3.5" />
        {createLabel}
      </Button>
    </div>
  );
}
