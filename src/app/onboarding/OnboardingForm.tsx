"use client";

import { useActionState, useState } from "react";
import { createClub, type CreateClubState } from "./actions";
import { Button, Card, CardHeader, CardContent, Input } from "@/components/ui";

const initialState: CreateClubState = {};

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createClub, initialState);
  const [slugValue, setSlugValue] = useState("");

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Auto-generate slug from name if user hasn't typed one
    if (!slugValue) {
      const suggested = e.target.value
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "") // remove Unicode combining marks (accents)
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
      setSlugValue(suggested);
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");
    setSlugValue(val);
  }

  return (
    <Card variant="elevated">
      <CardHeader>
        <h1 className="text-xl font-bold text-white">Crea tu club</h1>
        <p className="text-sm text-brand-muted mt-1">
          Completa la información básica de tu club para empezar.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <Input
            name="name"
            label="Nombre del club"
            type="text"
            placeholder="Club Padel Madrid"
            required
            onChange={handleNameChange}
            error={state.fieldErrors?.name}
          />

          <div className="flex flex-col gap-1.5">
            <Input
              name="slug"
              label="Identificador único"
              type="text"
              placeholder="club-padel-madrid"
              required
              value={slugValue}
              onChange={handleSlugChange}
              error={state.fieldErrors?.slug}
              hint="Solo letras minúsculas, números y guiones. Será tu URL: padelclub.co/tu-identificador"
            />
          </div>

          {state.error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {state.error}
            </p>
          )}

          <Button
            type="submit"
            loading={pending}
            size="lg"
            className="w-full mt-2"
          >
            Crear mi club
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
