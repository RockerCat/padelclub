"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";

type ActionResult = { error?: string };

const ADMIN_API_NOT_CONFIGURED =
  "Esta acción requiere la Admin API de Supabase (SUPABASE_SERVICE_ROLE_KEY) configurada en el servidor. Pide al equipo técnico que la agregue.";

async function requirePlatformAdmin(): Promise<ActionResult & { userId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autenticado." };
  if (!(await isPlatformAdmin())) return { error: "Sin permiso." };

  return { userId: user.id };
}

// ─── Cambiar nombre — profiles only, via RPC (no auth.users involved) ────────

export async function updateUserName(userId: string, fullName: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const name = fullName.trim();
  if (name.length < 2) return { error: "El nombre debe tener al menos 2 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_platform_user_name", {
    p_user_id: userId,
    p_full_name: name,
  });

  if (error) return { error: "No se pudo actualizar el nombre. Intenta de nuevo." };
  return {};
}

// ─── Cambiar correo — exclusively via the Supabase Admin API ────────────────

export async function updateUserEmail(userId: string, newEmail: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const email = newEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "El correo electrónico no es válido." };
  }

  const admin = createAdminClient();
  if (!admin) return { error: ADMIN_API_NOT_CONFIGURED };

  const { error } = await admin.auth.admin.updateUserById(userId, { email });
  if (error) {
    if (error.message.toLowerCase().includes("already been registered")) {
      return { error: "Ese correo ya está en uso por otra cuenta." };
    }
    return { error: "No se pudo actualizar el correo. Intenta de nuevo." };
  }

  return {};
}

// ─── Cambiar contraseña — exclusively via the Supabase Admin API ────────────

export async function updateUserPassword(
  userId: string,
  password: string,
  confirmPassword: string
): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
  if (password !== confirmPassword) return { error: "Las contraseñas no coinciden." };

  const admin = createAdminClient();
  if (!admin) return { error: ADMIN_API_NOT_CONFIGURED };

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: "No se pudo actualizar la contraseña. Intenta de nuevo." };

  return {};
}

// ─── Enviar recuperación — official resetPasswordForEmail, no admin key needed ──

export async function sendPasswordRecovery(email: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  // Supabase raises a generic/SMTP-shaped error when the project has no
  // email provider configured — never surface that raw message.
  if (error) {
    return {
      error:
        "No se pudo enviar el correo de recuperación. Verifica que el proveedor de correo (SMTP) esté configurado en el proyecto de Supabase.",
    };
  }

  return {};
}

// ─── Activar / Desactivar — official ban_duration mechanism, no data deleted ──

export async function setUserBanned(userId: string, banned: boolean): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if (gate.error) return { error: gate.error };

  if (banned && userId === gate.userId) {
    return { error: "No puedes suspender tu propia cuenta de Platform Admin." };
  }

  const admin = createAdminClient();
  if (!admin) return { error: ADMIN_API_NOT_CONFIGURED };

  // Supabase's ban_duration has no literal "forever" value — a long fixed
  // duration is the documented way to suspend indefinitely; "none" un-bans.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none",
  });

  if (error) return { error: "No se pudo actualizar el estado del usuario. Intenta de nuevo." };
  return {};
}
