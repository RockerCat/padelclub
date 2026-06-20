"use client";

import { useState } from "react";
import { CourtCard } from "./CourtCard";
import type { Court } from "@/types/database";

interface CourtsGridProps {
  courts: Court[];
  clubSlug: string;
  clubId: string;
}

// Only one card expanded at a time — expanding a new one collapses whichever
// was previously open.
export function CourtsGrid({ courts, clubSlug, clubId }: CourtsGridProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {courts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          clubSlug={clubSlug}
          clubId={clubId}
          isExpanded={expandedId === court.id}
          onExpand={() => setExpandedId(court.id)}
          onCollapse={() => setExpandedId(null)}
        />
      ))}
    </div>
  );
}
