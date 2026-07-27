import { PlayerAvatar } from "@/components/players/PlayerAvatar";

// Avatar/nombre/email only — the exact fields the task asks for, resolved
// via the same getSidebarIdentity data (never re-derived here). No id of
// any kind is ever rendered.
export function PersonalInfoCard({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
}) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex items-center gap-5">
      <PlayerAvatar player={{ full_name: name, avatar_url: avatarUrl }} size="2xl" />
      <div className="min-w-0">
        <p className="text-lg font-bold text-white truncate">{name}</p>
        {email && <p className="text-sm text-brand-muted truncate">{email}</p>}
      </div>
    </div>
  );
}
