"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";
import type { Court } from "@/types/database";
import type { CourtFormState } from "./actions";

interface CourtFormProps {
  clubSlug: string;
  clubId: string;
  court?: Court;
  action: (prevState: CourtFormState, formData: FormData) => Promise<CourtFormState>;
  // "page" (default) — full standalone page: wraps fields in a Card, navigates
  // back to the courts list on success/cancel. Used by [id] and new pages.
  // "inline" — used inside an already-expanded court card: no Card wrapper
  // (the card itself provides the surface/border), never navigates — on
  // success it just calls onSuccess so the caller can show its own feedback
  // (e.g. a toast) and collapse the card; onCancel handles the Cancel button.
  variant?: "page" | "inline";
  onSuccess?: () => void;
  onCancel?: () => void;
}

const initialState: CourtFormState = {};

const SURFACE_OPTIONS = [
  { value: "", label: "Sin especificar" },
  { value: "cristal", label: "Cristal" },
  { value: "moqueta", label: "Moqueta" },
  { value: "césped_artificial", label: "Césped artificial" },
  { value: "cemento", label: "Cemento" },
  { value: "tierra", label: "Tierra batida" },
];

export function CourtForm({
  clubSlug,
  court,
  action,
  variant = "page",
  onSuccess,
  onCancel,
}: CourtFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);
  const isEdit = !!court;
  const isInline = variant === "inline";

  useEffect(() => {
    if (!state.success) return;
    if (isInline) {
      router.refresh();
      onSuccess?.();
    } else {
      router.push(`/${clubSlug}/admin/courts`);
      router.refresh();
    }
  }, [state.success, router, clubSlug, isInline, onSuccess]);

  const fields = (
    <div className="flex flex-col gap-4">
      <Input
        name="name"
        label="Nombre"
        type="text"
        defaultValue={court?.name ?? ""}
        required
        placeholder="Cancha 1"
      />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">
          Descripción
        </label>
        <textarea
          name="description"
          defaultValue={court?.description ?? ""}
          placeholder="Descripción opcional..."
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white placeholder:text-brand-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 resize-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">
          Superficie
        </label>
        <select
          name="surface"
          defaultValue={court?.surface ?? ""}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
        >
          {SURFACE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#001A24]">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-white/80">
          Ubicación
        </label>
        <select
          name="is_indoor"
          defaultValue={
            court?.is_indoor === true
              ? "true"
              : court?.is_indoor === false
              ? "false"
              : ""
          }
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-base md:text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20"
        >
          <option value="" className="bg-[#001A24]">Sin especificar</option>
          <option value="false" className="bg-[#001A24]">Exterior</option>
          <option value="true" className="bg-[#001A24]">Interior</option>
        </select>
      </div>
      <Input
        name="sort_order"
        label="Orden"
        type="number"
        defaultValue={court?.sort_order ?? 0}
        min={0}
        hint="Las canchas se muestran de menor a mayor orden."
      />
      <Input
        name="streaming_url"
        label="Link de streaming"
        type="url"
        defaultValue={court?.streaming_url ?? ""}
        placeholder="https://..."
        hint="Enlace a la transmisión en vivo de esta cancha."
      />
    </div>
  );

  return (
    <form action={formAction} className={isInline ? "flex flex-col gap-4" : "flex flex-col gap-6 max-w-2xl"}>
      {isInline ? (
        fields
      ) : (
        <Card variant="default">
          <CardHeader>
            <h2 className="text-base font-semibold text-white">
              {isEdit ? "Datos de la cancha" : "Nueva cancha"}
            </h2>
          </CardHeader>
          <CardContent>{fields}</CardContent>
        </Card>
      )}

      {state.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} size={isInline ? "md" : "lg"}>
          {isEdit ? "Guardar cambios" : "Crear cancha"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size={isInline ? "md" : "lg"}
          onClick={() => (isInline ? onCancel?.() : router.push(`/${clubSlug}/admin/courts`))}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
