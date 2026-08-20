import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { theme } from "../lib/theme";

// Extraído de ChangeClubScreen.tsx — mismo modal "Completa tu WhatsApp"
// (mismo copy, mismos estilos), ahora reutilizable por cualquier flujo de
// join/request (ChangeClubScreen ya no lo necesita: el join/request se
// movió a PublicClubScreen, ver ese archivo). Sin lógica propia de guardado
// — el caller decide qué hacer con el valor vía onSave (equivalente a
// handleSavePhoneAndRetry), igual que WhatsAppRequiredModal en
// RequestAccessButton.tsx (app web).
export function WhatsAppRequiredModal({
  visible,
  value,
  onChangeValue,
  saving,
  error,
  onCancel,
  onSave,
}: {
  visible: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Completa tu WhatsApp</Text>
          <Text style={styles.confirmBody}>
            Agrega tu número de WhatsApp para unirte al club. El club lo utilizará para contactarte.
          </Text>
          <TextInput
            value={value}
            onChangeText={onChangeValue}
            placeholder="+57 317 367 2033"
            placeholderTextColor={theme.colors.muted}
            keyboardType="phone-pad"
            autoFocus
            style={styles.phoneInput}
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.confirmActions}>
            <TouchableOpacity onPress={onCancel} disabled={saving} style={styles.confirmCancel}>
              <Text style={styles.confirmCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} disabled={saving} style={styles.saveButton}>
              {saving ? <ActivityIndicator color={theme.colors.bg} size="small" /> : <Text style={styles.saveButtonText}>Guardar y continuar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { color: theme.colors.white, fontSize: 16, fontWeight: "700" },
  confirmBody: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
  phoneInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.white,
    fontSize: 14,
    backgroundColor: theme.colors.surfaceAlt,
  },
  errorText: { color: theme.colors.danger, fontSize: 12 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 4 },
  confirmCancel: { paddingVertical: 8, paddingHorizontal: 4 },
  confirmCancelText: { color: theme.colors.muted, fontSize: 13, fontWeight: "600" },
  saveButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  saveButtonText: { color: theme.colors.bg, fontSize: 12, fontWeight: "700" },
});
