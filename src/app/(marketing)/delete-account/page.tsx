import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MARKETING_WA_URL } from "@/lib/constants/marketingWhatsapp";

export const metadata: Metadata = {
  title: "Eliminar cuenta | Mi Pádel Club",
  description: "Cómo eliminar tu cuenta de Mi Pádel Club y qué sucede con tu información.",
};

// Página pública — viewing it never requires authentication, same as
// /privacy. The one Supabase call here (auth.getUser()) is read-only and
// only decides where the CTA below points; it never gates the page's own
// content, so this stays fully reachable to an anonymous visitor.
//
// The CTA can't just link to /profile and rely on that route's own
// redirect-with-next: /profile IS already correct in isolation
// (profile/layout.tsx and profile/page.tsx both already redirect to
// "/auth/login?next=/profile"), but the shared parent (app)/layout.tsx
// wraps every route under (app) — including /profile — with its own
// earlier `if (!user) redirect("/auth/login")` (no next). Since a parent
// layout always runs before its nested layout/page, that bare redirect
// fires first and (app)/layout.tsx's redirect always wins, so /profile's
// own next=/profile logic never gets a chance to run. Fixing that shared
// layout would change redirect behavior for every [club]/* route too —
// out of scope here (feature freeze, delete-account-only fix) — so this
// page instead decides its own CTA target directly, exactly as the
// approved fix describes: authenticated → /profile directly;
// unauthenticated → /auth/login?next=/profile explicitly, which
// LoginForm.tsx already honors safely via getSafeInternalPath
// (src/lib/utils/safeRedirect.ts) — untouched here.
export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const deleteAccountHref = user ? "/profile" : "/auth/login?next=/profile";

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-3xl mx-auto px-5 pt-28 pb-20 sm:pt-32">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Eliminar cuenta</h1>
        <p className="text-xs text-brand-muted mb-10">
          Ver también nuestra{" "}
          <Link href="/privacy" className="text-brand-primary hover:underline">
            Política de Privacidad
          </Link>
          .
        </p>

        <div className="text-sm text-white/80 leading-relaxed flex flex-col gap-4 mb-10">
          <p>
            Si eres jugador o administrador de un club, puedes eliminar tu cuenta de Mi Pádel Club en
            cualquier momento, directamente desde la aplicación:
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              <strong>Aplicación móvil:</strong> Perfil → Eliminar cuenta.
            </li>
            <li>
              <strong>Sitio web:</strong> Mi Perfil → Eliminar cuenta.
            </li>
          </ul>
          <p>
            Necesitas iniciar sesión para eliminar tu cuenta — es el mismo inicio de sesión que ya usas para
            entrar a la plataforma, nunca un requisito adicional.
          </p>
        </div>

        <div className="text-sm text-white/80 leading-relaxed flex flex-col gap-3 mb-10">
          <h2 className="text-lg font-bold text-white mb-1">¿Qué sucede al eliminar tu cuenta?</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>El acceso a tu cuenta se deshabilita de forma permanente.</li>
            <li>Tu información personal (nombre, foto de perfil, número de WhatsApp) se elimina o se anonimiza.</li>
            <li>
              Registros históricos y operativos del club a los que pertenecías — como reservas, ranking o
              resultados de torneos — pueden conservarse de forma anónima (mostrados como "Usuario eliminado")
              para mantener la integridad de esa información para el club y otros jugadores.
            </li>
            <li>Las noticias ya publicadas por un club son contenido editorial de texto libre y no se reescriben retroactivamente.</li>
          </ul>
          <p>Esta acción no se puede deshacer.</p>
        </div>

        <Link
          href={deleteAccountHref}
          className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500/90 transition-colors"
        >
          Eliminar mi cuenta
        </Link>

        <div className="text-sm text-white/80 leading-relaxed flex flex-col gap-2 mt-12">
          <h2 className="text-lg font-bold text-white mb-1">¿Eres propietario de un club?</h2>
          <p>
            Cada club tiene un único propietario activo. Si tu cuenta es actualmente propietaria de un club,
            primero debes resolver la transferencia o el cierre del club con nuestro equipo antes de poder
            eliminar tu cuenta —{" "}
            <a
              href={MARKETING_WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary hover:underline"
            >
              contáctanos por WhatsApp
            </a>{" "}
            para gestionarlo.
          </p>
        </div>

        <div className="text-sm text-white/80 leading-relaxed flex flex-col gap-2 mt-6">
          <h2 className="text-lg font-bold text-white mb-1">¿No puedes acceder a tu cuenta?</h2>
          <p>
            Si no puedes iniciar sesión para eliminar tu cuenta tú mismo, escríbenos y gestionamos tu solicitud:{" "}
            <a
              href={MARKETING_WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary hover:underline"
            >
              contáctanos por WhatsApp
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
