"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Card, CardHeader, CardContent, Button } from "@/components/ui";
import {
  Link as LinkIcon,
  Copy,
  Check,
  Plus,
  X,
  Trash2,
  Shield,
  ExternalLink,
} from "lucide-react";
import { removeAdmin, createAdminInvite, deactivateAdminInvite } from "./actions";

type AdminMember = {
  id: string;
  club_id: string;
  profile_id: string;
  role: "OWNER" | "ADMIN";
  is_active: boolean;
  joined_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
};

type InviteLink = {
  id: string;
  token: string;
  role: "PLAYER" | "ADMIN";
  expires_at: string;
  uses: number;
  max_uses: number | null;
};

interface TeamClientProps {
  clubId: string;
  clubSlug: string;
  owner: AdminMember | null;
  admins: AdminMember[];
  currentUserId: string;
  activeInvites: InviteLink[];
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
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
          Copiar link
        </>
      )}
    </button>
  );
}

export function TeamClient({
  clubId,
  clubSlug,
  owner,
  admins,
  currentUserId,
  activeInvites,
}: TeamClientProps) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();
  const [creating, startCreate] = useTransition();
  const [revoking, startRevoke] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove(memberId: string) {
    setError(null);
    startRemove(async () => {
      const result = await removeAdmin(clubId, memberId, clubSlug);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleCreateInvite() {
    setError(null);
    startCreate(async () => {
      const result = await createAdminInvite(clubId, clubSlug);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleRevokeInvite(linkId: string) {
    startRevoke(async () => {
      await deactivateAdminInvite(clubId, linkId, clubSlug);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Propietario */}
      {owner && (
        <Card variant="default">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: "var(--club-primary)" }} />
              <h2 className="text-sm font-semibold text-white">Propietario</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--club-primary) 15%, transparent)",
                  color: "var(--club-primary)",
                }}
              >
                {getInitials(owner.profiles?.full_name ?? null)}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {owner.profiles?.full_name ?? "Sin nombre"}
                </p>
                <p className="text-xs text-brand-muted">
                  Propietario · Desde {formatDate(owner.joined_at)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Administradores */}
      <Card variant="default">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Administradores</h2>
              <p className="text-xs text-brand-muted mt-0.5">
                {admins.length === 0
                  ? "Sin administradores aún."
                  : `${admins.length} administrador${admins.length === 1 ? "" : "es"}`}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={creating}
              onClick={handleCreateInvite}
            >
              <Plus className="w-3.5 h-3.5" />
              Invitar administrador
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          {admins.length === 0 && activeInvites.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-brand-muted">
                Invita a alguien para que te ayude a operar el club.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {admins.map((admin) => {
                const name = admin.profiles?.full_name ?? "Sin nombre";
                const initials = getInitials(admin.profiles?.full_name ?? null);
                const isSelf = admin.profile_id === currentUserId;

                return (
                  <div
                    key={admin.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand-secondary/15 border border-brand-secondary/20">
                      <span className="text-xs font-bold text-brand-secondary">
                        {initials}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{name}</p>
                      <p className="text-xs text-brand-muted">
                        Admin · Desde {formatDate(admin.joined_at)}
                        {!admin.is_active && (
                          <Badge variant="default" size="sm" className="ml-1.5">
                            Inactivo
                          </Badge>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/${clubSlug}/admin/players/${admin.id}`}
                        className="p-1.5 rounded-lg text-brand-muted/50 hover:text-white hover:bg-white/5 transition-colors"
                        title="Ver perfil"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      {!isSelf && (
                        <button
                          onClick={() => handleRemove(admin.id)}
                          disabled={removing}
                          className="p-1.5 rounded-lg text-brand-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          title="Eliminar administrador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active admin invites */}
          {activeInvites.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">
                Invitaciones activas
              </p>
              {activeInvites.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10"
                >
                  <LinkIcon className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-brand-muted">
                      Admin · Expira {formatDate(link.expires_at)}
                      {link.uses > 0 && ` · ${link.uses} usos`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CopyButton token={link.token} />
                    <button
                      onClick={() => handleRevokeInvite(link.id)}
                      disabled={revoking}
                      className="p-1.5 rounded-lg text-brand-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Revocar invitación"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
