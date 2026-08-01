"use client";

import { Card, CardHeader, CardContent } from "@/components/ui";
import { CreateClubFields } from "./CreateClubFields";

// Envoltorio Card+encabezado usado por /clubs/create — el formulario en sí
// (campos, validaciones, server action) vive en CreateClubFields, la misma
// pieza que CreateClubModal reutiliza con el encabezado del propio modal en
// vez de este. Nunca dos implementaciones del formulario.
export function OnboardingForm() {
  return (
    <Card variant="elevated">
      <CardHeader>
        <h1 className="text-xl font-bold text-white">Crea tu club</h1>
        <p className="text-sm text-brand-muted mt-1">
          Completa la información básica de tu club para empezar.
        </p>
      </CardHeader>
      <CardContent>
        <CreateClubFields />
      </CardContent>
    </Card>
  );
}
