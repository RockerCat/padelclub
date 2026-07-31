// Skeleton de la Clasificación mientras se refresca automáticamente al
// recuperar el foco (ver TournamentDetailView) — nunca durante la carga
// inicial de la página (esa ya la resuelve el Server Component antes de
// llegar aquí), solo mientras `router.refresh()` está en vuelo. Mismo
// wrapper de fila que ClassificationSection.renderRow (rounded-xl border
// border-white/10 bg-brand-surface px-3 py-2, gap-3, h-9 en el slot de
// puntos) para que no haya salto de layout al intercambiar uno por otro.
// `motion-safe:animate-pulse` respeta prefers-reduced-motion (igual que
// bell-ring en globals.css) — nunca depende solo del color para
// transmitir "cargando", el propio texto accesible del contenedor
// (TournamentDetailView) ya lo anuncia.
interface ClassificationSkeletonProps {
  rows: number;
  editable: boolean;
}

function SkeletonRow({ editable }: { editable: boolean }) {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-brand-surface px-3 py-2"
    >
      <div className="w-7 shrink-0 flex items-center justify-center">
        <div className="w-5 h-5 rounded motion-safe:animate-pulse bg-white/10" />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-8 h-8 rounded-full motion-safe:animate-pulse bg-white/10" />
        <div className="w-8 h-8 rounded-full motion-safe:animate-pulse bg-white/10" />
      </div>

      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="h-4 w-2/3 max-w-[160px] rounded motion-safe:animate-pulse bg-white/10" />
        <div className="h-1 w-full max-w-[140px] rounded-full motion-safe:animate-pulse bg-white/10" />
      </div>

      <div className="flex items-center gap-3 shrink-0 h-9">
        {editable ? (
          <div className="w-16 h-9 rounded-lg motion-safe:animate-pulse bg-white/10" />
        ) : (
          <div className="w-10 h-4 rounded motion-safe:animate-pulse bg-white/10" />
        )}
      </div>

      {editable && <div className="w-7 h-7 rounded-lg shrink-0 motion-safe:animate-pulse bg-white/10" />}
    </div>
  );
}

export function ClassificationSkeleton({ rows, editable }: ClassificationSkeletonProps) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} editable={editable} />
      ))}
    </div>
  );
}
