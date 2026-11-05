"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Único CTA público de registro ("Registrarme como jugador"), usado por el
// Navbar de la landing, /auth/login, /clubs y el explorador de clubes —
// nunca una copia por pantalla de este mismo chequeo de sesión.
//
// El registro público es SOLO de jugadores (ver CLAUDE.md → Funnel
// Comercial Principles): los clubes se incorporan por /demo → lead →
// Entrega de Club → claim_club(). La variante con menú "Propietario de
// club" (→ /clubs/create) se eliminó por completo, y create_club_with_owner
// además rechaza en base de datos a cualquier cuenta que no sea ya OWNER
// (20261115000011) — esto no es solo una ocultación visual.
//
// Con sesión activa el enlace va directo a /mi-padel (que redirige a
// OWNER/ADMIN/SUPERADMIN a su destino propio) en vez de al registro.
interface RegisterMenuProps {
  triggerContent: React.ReactNode;
  triggerClassName: string;
}

const SIGNUP_PLAYER_HREF = `/auth/signup?next=${encodeURIComponent("/mi-padel")}`;

export function RegisterMenu({ triggerContent, triggerClassName }: RegisterMenuProps) {
  const [href, setHref] = useState(SIGNUP_PLAYER_HREF);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHref("/mi-padel");
    });
  }, []);

  return (
    <Link href={href} className={triggerClassName}>
      {triggerContent}
    </Link>
  );
}
