"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { updateClubName } from "@/app/(app)/[club]/admin/settings/actions";

interface ClubNameEditorProps {
  clubId: string;
  name: string;
  primaryColor: string;
}

export function ClubNameEditor({ clubId, name, primaryColor }: ClubNameEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 2) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateClubName(clubId, trimmed);
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setEditing(false);
    router.refresh();
  }

  function handleCancel() {
    setValue(name);
    setError(null);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") handleCancel();
  }

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight bg-transparent border-b-2 focus:outline-none min-w-0 flex-1 placeholder:text-white/40 disabled:opacity-60"
            style={{
              borderColor: primaryColor,
              textShadow: "0 2px 4px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.4)",
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            title="Guardar nombre"
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/85 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            title="Cancelar"
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/85 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400 mt-1.5">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h1
        className="text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight"
        style={{ textShadow: "0 2px 4px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.4)" }}
      >
        {name}
      </h1>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Editar nombre del club"
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/70 transition-colors"
      >
        <Pencil className="w-3 h-3 text-white/70" />
      </button>
    </div>
  );
}
