"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnAccount } from "@/lib/deleteAccount";

// Invoca la misma Edge Function delete-account que Mobile — nunca un
// Server Action. La arquitectura aprobada exige un único endpoint de
// borrado compartido por ambas plataformas (Mobile no puede alcanzar un
// Server Action de Next.js), así que la lógica privilegiada vive
// exclusivamente en supabase/functions/delete-account, nunca duplicada
// aquí. El cliente browser ya trae la sesión actual — supabase.functions.
// invoke() la adjunta automáticamente como Authorization; este componente
// nunca maneja ni envía un id de usuario.
export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await deleteOwnAccount(supabase);
    if (!result.success) {
      setLoading(false);
      setError(result.error);
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="bg-brand-surface border border-red-500/20 rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">Zona de peligro</h2>
      <p className="text-sm text-brand-muted mt-2 mb-3">
        Eliminar tu cuenta es permanente. Perderás acceso a ella y tu información personal (nombre, foto,
        teléfono) será eliminada o anonimizada.
      </p>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-red-400 hover:underline">
        Eliminar cuenta
      </button>

      <ConfirmDialog
        open={open}
        title="Eliminar cuenta"
        message={
          "Perderás acceso a tu cuenta de forma permanente y tu información personal (nombre, foto, teléfono) será eliminada o anonimizada.\n\nRegistros históricos del club, como reservas, ranking y torneos, pueden conservarse de forma anónima para mantener la integridad de esos datos.\n\nEsta acción no se puede deshacer."
        }
        confirmLabel="Eliminar cuenta"
        confirmVariant="danger"
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
