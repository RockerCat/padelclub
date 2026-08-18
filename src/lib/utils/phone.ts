// normalizePhone/isValidPhone/toWhatsAppLink ya NO se definen aquí — viven
// en shared/utils/phone.ts (misma fuente que ahora también usa mobile, para
// ProfileScreen/ChangeClubScreen), re-exportadas bajo estos mismos nombres
// para que ningún import existente de "@/lib/utils/phone" tenga que cambiar.
export { normalizePhone, isValidPhone, toWhatsAppLink } from "../../../shared/utils/phone";
