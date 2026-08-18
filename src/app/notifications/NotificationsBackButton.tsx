"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Nunca asume que Notificaciones se abrió desde el Dashboard: usa el
// historial real del navegador (router.back(), como ya hace WEB para
// "volver" en otras pantallas — ver comentario en TournamentDetailView.tsx
// sobre por qué un origen fijo fue retirado a favor del historial real).
// window.history.length > 1 es la única señal disponible client-side para
// distinguir "hay una pantalla previa en esta pestaña" de una entrada
// directa/deep link, que es cuando cae al Dashboard del usuario
// (fallbackHref, resuelto server-side por resolveClubEntryPath — la misma
// fuente que ya decide a qué club/rol entra un usuario tras iniciar
// sesión).
export function NotificationsBackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Volver"
      className="p-1.5 -ml-1.5 rounded-lg text-brand-muted hover:text-white hover:bg-white/5 transition-colors shrink-0"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
