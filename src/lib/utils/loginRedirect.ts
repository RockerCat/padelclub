import { headers } from "next/headers";
import { getSafeInternalPath } from "./safeRedirect";

// Destino de login que preserva el enlace profundo solicitado (reserva,
// torneo, club, perfil…): /auth/login?next=<ruta>. La ruta llega del proxy
// (header x-pathname, ver src/proxy.ts) y pasa por el mismo guard contra
// open-redirect que usan login/signup/callback. Sin header válido, el login
// simple de siempre.
export async function loginPathForCurrentRequest(): Promise<string> {
  const requested = getSafeInternalPath((await headers()).get("x-pathname"));
  return requested ? `/auth/login?next=${encodeURIComponent(requested)}` : "/auth/login";
}
