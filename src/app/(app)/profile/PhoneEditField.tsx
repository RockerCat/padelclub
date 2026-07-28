"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { updateOwnPhone } from "./actions";

// Única UI de edición de profiles.phone del proyecto — mismo
// normalizePhone/isValidPhone y la misma mutación (updateOwnPhone) que
// usa el modal "completa tu WhatsApp" del flujo de unión a un club
// (RequestAccessButton). Actualiza únicamente la propia fila del usuario
// autenticado (updateOwnPhone ya lo garantiza server-side).
export function PhoneEditField({ phone: initialPhone }: { phone: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialPhone ?? "");
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateOwnPhone(value);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPhone(result.phone ?? null);
    setEditing(false);
    setSuccess(true);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-sm text-brand-muted">WhatsApp:</span>
        <span className="text-sm text-white">{phone ?? "—"}</span>
        <button
          type="button"
          onClick={() => {
            setValue(phone ?? "");
            setError(null);
            setSuccess(false);
            setEditing(true);
          }}
          className="text-xs text-brand-primary hover:underline"
        >
          {phone ? "Editar" : "Agregar"}
        </button>
        {success && <span className="text-xs text-emerald-400">Guardado</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-2 max-w-xs">
      <Input
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+57 317 367 2033"
        hint="Incluye el código de país."
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" loading={saving} onClick={handleSave}>
          Guardar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
