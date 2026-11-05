"use client";

import { useRouter } from "next/navigation";
import { MatchForm } from "@/components/openMatches/MatchForm";
import type { PickedVenue } from "@/components/openMatches/VenuePicker";
import { openMatchPath, type OpenMatchFormValues } from "@/lib/openMatches";
import { createOpenMatchAction } from "../actions";

export function CreateMatchClient({
  initial,
  citySuggestions,
  initialVenue,
}: {
  initial: OpenMatchFormValues;
  citySuggestions: string[];
  initialVenue: PickedVenue | null;
}) {
  const router = useRouter();
  return (
    <MatchForm
      mode="create"
      initial={initial}
      citySuggestions={citySuggestions}
      initialVenue={initialVenue}
      submitLabel="Publicar partido"
      onSubmit={async (values) => {
        const result = await createOpenMatchAction(values);
        if (!result.ok) return result.error;
        // ?nuevo=1 → el detalle invita a compartir por WhatsApp de inmediato.
        router.push(`${openMatchPath(result.data)}?nuevo=1`);
        return null;
      }}
    />
  );
}
