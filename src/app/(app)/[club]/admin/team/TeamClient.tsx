"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, CardHeader, CardContent, ConfirmDialog, ContextMenu } from "@/components/ui";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { InviteLinkList, type InviteLinkRow } from "@/components/invites/InviteLinkList";
import { Shield, UserMinus, UserPlus } from "lucide-react";
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

interface TeamClientProps {
  clubId: string;
  clubSlug: string;
  owner: AdminMember | null;
  admins: AdminMember[];
  currentUserId: string;
  invites: InviteLinkRow[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function TeamClient({
  clubId,
  clubSlug,
  owner,
  admins,
  currentUserId,
  invites,
}: TeamClientProps) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminMember | null>(null);

  function handleConfirmRemove() {
    if (!confirmTarget) return;
    setError(null);
    startRemove(async () => {
      const result = await removeAdmin(clubId, confirmTarget.id, clubSlug);
      setConfirmTarget(null);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="max-w-5xl">
      {/* Personas (propietario + administradores) a la izquierda, con mayor
          protagonismo visual; invitaciones — herramienta secundaria — a la
          derecha en su propia columna, donde pueden crecer sin empujar el
          contenido principal hacia abajo. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
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
                  <PlayerAvatar player={{ id: owner.profile_id, ...owner.profiles }} size="md" />
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
              <h2 className="text-sm font-semibold text-white">Administradores</h2>
              <p className="text-xs text-brand-muted mt-0.5">
                {admins.length === 0
                  ? "Sin administradores aún."
                  : `${admins.length} administrador${admins.length === 1 ? "" : "es"}`}
              </p>
            </CardHeader>
            <CardContent>
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              {admins.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-brand-muted">
                    Invita a alguien para que te ayude a operar el club.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {admins.map((admin) => {
                    const name = admin.profiles?.full_name ?? "Sin nombre";
                    const isSelf = admin.profile_id === currentUserId;

                    return (
                      <div
                        key={admin.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
                      >
                        <PlayerAvatar player={{ id: admin.profile_id, ...admin.profiles }} size="md" />

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

                        {!isSelf && (
                          <ContextMenu
                            actions={[
                              {
                                label: "Remover del equipo",
                                icon: UserMinus,
                                variant: "danger" as const,
                                onClick: () => setConfirmTarget(admin),
                              },
                            ]}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Invitar administrador — mismo modelo de invitaciones que Jugadores */}
        <Card variant="default">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand-muted" />
              <h2 className="text-base font-semibold text-white">Invitar administrador</h2>
            </div>
            <p className="text-xs text-brand-muted mt-1">
              Genera un link de un solo uso para que un nuevo administrador se una al equipo.
            </p>
          </CardHeader>
          <CardContent>
            <InviteLinkList
              links={invites}
              createLabel="Invitar administrador"
              onCreate={() => createAdminInvite(clubId, clubSlug)}
              onRevoke={(linkId) => deactivateAdminInvite(clubId, linkId, clubSlug)}
              onChanged={() => router.refresh()}
            />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmTarget != null}
        title="Remover del equipo"
        message={`${confirmTarget?.profiles?.full_name ?? "Este administrador"} dejará de formar parte del equipo administrativo del club.\n\nPodrá seguir utilizando su cuenta personal en MiPadelClub, pero perderá acceso administrativo a este club.`}
        confirmLabel="Remover"
        confirmVariant="danger"
        loading={removing}
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
