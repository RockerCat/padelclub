// Los tipos y getMyProfileActivity ya NO se definen aquí — viven en
// shared/players/profileActivity.ts (misma fuente que ahora también usa
// mobile, para ProfileScreen), re-exportados bajo estos mismos nombres para
// que ningún import existente de "@/lib/profileActivity" tenga que cambiar.
export type {
  ProfileActivitySummary,
  ProfileActivityTypePoint,
  ProfileActivityMonthPoint,
  ProfileActivityReservation,
  ProfileActiveMembership,
  ProfileActivity,
  ProfileActivityResult,
} from "../../shared/players/profileActivity";
export { getMyProfileActivity } from "../../shared/players/profileActivity";
