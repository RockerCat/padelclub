import { ProfileAvatarUpload } from "./ProfileAvatarUpload";
import { PhoneEditField } from "./PhoneEditField";

// Avatar/nombre/email/WhatsApp — resuelto via getSidebarIdentity (nombre/
// correo/avatar) + una lectura aparte de profiles.phone (page.tsx). No id
// de ningún tipo se renderiza. El avatar es editable en línea
// (ProfileAvatarUpload); el WhatsApp también (PhoneEditField) — mismas
// reglas de propiedad que el resto de "Mi Perfil": solo la propia fila.
export function PersonalInfoCard({
  name,
  email,
  avatarUrl,
  phone,
}: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  phone: string | null;
}) {
  return (
    <div className="bg-brand-surface border border-white/10 rounded-2xl p-5 flex items-center gap-5">
      <ProfileAvatarUpload name={name} avatarUrl={avatarUrl} />
      <div className="min-w-0">
        <p className="text-lg font-bold text-white truncate">{name}</p>
        {email && <p className="text-sm text-brand-muted truncate">{email}</p>}
        <PhoneEditField phone={phone} />
      </div>
    </div>
  );
}
