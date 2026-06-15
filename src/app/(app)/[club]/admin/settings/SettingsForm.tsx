"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateClub, type UpdateClubState } from "./actions";
import { Button, Card, CardHeader, CardContent, Input, LogoUpload } from "@/components/ui";
import { useClubTheme } from "@/components/layout/ClubThemeProvider";
import type { Club } from "@/types/database";

interface SettingsFormProps {
  club: Club;
}

const initialState: UpdateClubState = {};

export function SettingsForm({ club }: SettingsFormProps) {
  const router = useRouter();
  const boundAction = updateClub.bind(null, club.id);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [primaryColor, setPrimaryColor] = useState(club.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(club.secondary_color);
  const { setColors } = useClubTheme();

  useEffect(() => {
    if (!state.success) return;
    const timer = setTimeout(() => {
      router.push(`/${club.slug}/dashboard`);
    }, 1000);
    return () => clearTimeout(timer);
  }, [state.success, router, club.slug]);

  function handlePrimaryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const color = e.target.value;
    setPrimaryColor(color);
    setColors(color, secondaryColor);
  }

  function handleSecondaryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const color = e.target.value;
    setSecondaryColor(color);
    setColors(primaryColor, color);
  }

  return (
    <form action={action} className="flex flex-col gap-6 max-w-2xl">
      {/* Club info */}
      <Card variant="default">
        <CardHeader>
          <h2 className="text-base font-semibold text-white">
            Información del club
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Input
              name="name"
              label="Nombre del club"
              type="text"
              defaultValue={club.name}
              required
              placeholder="Club Padel Madrid"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">
                Descripción
              </label>
              <textarea
                name="description"
                defaultValue={club.description ?? ""}
                placeholder="Breve descripción del club..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
              />
            </div>

            <LogoUpload
              clubId={club.id}
              clubName={club.name}
              currentLogoUrl={club.logo_url}
              primaryColor={primaryColor}
            />
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card variant="default">
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Ubicación</h2>
          <p className="text-xs text-brand-muted mt-1">
            Aparece en el directorio público de clubes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                name="city"
                label="Ciudad"
                type="text"
                defaultValue={club.city ?? ""}
                placeholder="Tunja"
              />
              <Input
                name="state"
                label="Departamento / Estado"
                type="text"
                defaultValue={club.state ?? ""}
                placeholder="Boyacá"
              />
            </div>
            <Input
              name="country"
              label="País"
              type="text"
              defaultValue={club.country ?? "Colombia"}
              placeholder="Colombia"
            />
            <Input
              name="address"
              label="Dirección"
              type="text"
              defaultValue={club.address ?? ""}
              placeholder="Cra 1 # 2-3"
            />
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card variant="default">
        <CardHeader>
          <h2 className="text-base font-semibold text-white">
            Colores del club
          </h2>
          <p className="text-xs text-brand-muted mt-1">
            Los cambios se aplican en tiempo real a la interfaz.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">
                Color principal
              </label>
              <p className="text-xs text-brand-muted">
                Sidebar, botones, badges y estados activos.
              </p>
              <div className="flex items-center gap-3">
                <input
                  name="primary_color"
                  type="color"
                  value={primaryColor}
                  onChange={handlePrimaryChange}
                  className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0.5"
                />
                <span className="text-sm text-brand-muted font-mono">
                  {primaryColor}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-white/80">
                Color secundario
              </label>
              <p className="text-xs text-brand-muted">
                Hover states, etiquetas informativas y elementos secundarios.
              </p>
              <div className="flex items-center gap-3">
                <input
                  name="secondary_color"
                  type="color"
                  value={secondaryColor}
                  onChange={handleSecondaryChange}
                  className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0.5"
                />
                <span className="text-sm text-brand-muted font-mono">
                  {secondaryColor}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social / Contact */}
      <Card variant="default">
        <CardHeader>
          <h2 className="text-base font-semibold text-white">
            Redes sociales y contacto
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Input
              name="whatsapp"
              label="WhatsApp"
              type="text"
              defaultValue={club.whatsapp ?? ""}
              placeholder="+34 600 000 000"
              hint="Número de contacto del club"
            />
            <Input
              name="instagram"
              label="Instagram"
              type="text"
              defaultValue={club.instagram ?? ""}
              placeholder="@tuclub"
            />
            <Input
              name="facebook"
              label="Facebook"
              type="url"
              defaultValue={club.facebook ?? ""}
              placeholder="https://facebook.com/tuclub"
            />
            <Input
              name="youtube"
              label="YouTube"
              type="url"
              defaultValue={club.youtube ?? ""}
              placeholder="https://youtube.com/@tuclub"
            />
          </div>
        </CardContent>
      </Card>

      {/* Feedback */}
      {state.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
          Configuración guardada. Redirigiendo al dashboard…
        </p>
      )}

      <div>
        <Button type="submit" loading={pending} size="lg">
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
