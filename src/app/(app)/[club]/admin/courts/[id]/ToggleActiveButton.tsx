"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toggleCourtActive } from "../actions";

interface ToggleActiveButtonProps {
  clubId: string;
  courtId: string;
  isActive: boolean;
}

export function ToggleActiveButton({ clubId, courtId, isActive }: ToggleActiveButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleCourtActive(clubId, courtId, !isActive);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={isActive ? "danger" : "secondary"}
      size="md"
      loading={pending}
      onClick={handleToggle}
    >
      {isActive ? "Desactivar cancha" : "Activar cancha"}
    </Button>
  );
}
