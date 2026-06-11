"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@/components/ui";
import { Link as LinkIcon, Copy, Check, Plus, X } from "lucide-react";
import { createInvitationLink, deactivateInvitationLink } from "./actions";

export type InviteLink = {
  id: string;
  token: string;
  role: "PLAYER" | "ADMIN";
  expires_at: string;
  uses: number;
  max_uses: number | null;
};

interface InviteManagerProps {
  clubId: string;
  clubSlug: string;
  callerRole: "OWNER" | "ADMIN";
  activeLinks: InviteLink[];
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
          Copiar link
        </>
      )}
    </button>
  );
}

function formatExpiry(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InviteManager({ clubId, clubSlug, callerRole, activeLinks }: InviteManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"PLAYER" | "ADMIN">("PLAYER");
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [revoking, startRevoke] = useTransition();

  function handleCreate() {
    setError(null);
    startCreate(async () => {
      const result = await createInvitationLink(clubId, selectedRole, clubSlug);
      if (result.error) {
        setError(result.error);
      } else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleRevoke(linkId: string) {
    startRevoke(async () => {
      await deactivateInvitationLink(clubId, linkId, clubSlug);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Active links */}
      {activeLinks.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {activeLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
            >
              <LinkIcon className="w-4 h-4 text-brand-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={link.role === "ADMIN" ? "secondary" : "outline"} size="sm">
                    {link.role === "ADMIN" ? "Admin" : "Jugador"}
                  </Badge>
                  <span className="text-xs text-brand-muted">
                    Expira {formatExpiry(link.expires_at)}
                  </span>
                  {link.uses > 0 && (
                    <span className="text-xs text-brand-muted">· {link.uses} usos</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyButton token={link.token} />
                <button
                  onClick={() => handleRevoke(link.id)}
                  disabled={revoking}
                  className="p-1.5 rounded-lg text-brand-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Revocar link"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showForm ? (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
          {callerRole === "OWNER" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">Rol</label>
              <div className="flex gap-2">
                {(["PLAYER", "ADMIN"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRole(r)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      selectedRole === r
                        ? "bg-brand-primary/15 text-brand-primary border-brand-primary/30"
                        : "bg-white/5 text-brand-muted border-white/10 hover:border-white/20"
                    }`}
                  >
                    {r === "PLAYER" ? "Jugador" : "Admin"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <Button size="sm" loading={creating} onClick={handleCreate}>
              <Plus className="w-3.5 h-3.5" />
              Crear link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setError(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" />
          Nueva invitación
        </Button>
      )}
    </div>
  );
}
