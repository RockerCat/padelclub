// Reutilización real WEB/mobile (ver CLAUDE.md → Documentation Workflow no
// aplica aquí; este es un cambio de arquitectura, no de producto): el
// contenido canónico de este archivo vive en shared/types/domain.ts, la
// única fuente que ambas plataformas editan. Este archivo es un re-export
// puro para que cada import existente de "@/types/domain" en la web siga
// resolviendo exactamente igual — cero sitios de importación tuvieron que
// cambiar.
export * from "../../shared/types/domain";
