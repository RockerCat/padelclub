import { useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ImageIcon, X } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import { pickAndUploadTournamentCover } from "../../lib/tournamentCoverUpload";
import { updateTournamentCoverImage } from "../../lib/tournaments";
import type { Tournament } from "../../types/domain";

// Traducción 1:1 de EditTournamentCoverModal.tsx + TournamentImageUpload.tsx
// (app web) — modal separado a propósito de TournamentFormModal, sin gate
// de status (alcanzable en cualquier estado, incluido completed). Selector
// nativo de imágenes (expo-image-picker) en vez del <input type="file">/
// drag&drop del navegador — mismo bucket, misma ruta, mismas restricciones
// exactas (ver tournamentCoverUpload.ts). "Guardar portada" solo persiste
// la URL ya subida vía update_tournament_cover_image; el upload a Storage
// ocurre al elegir la imagen, no al guardar (igual que en web).
export function EditTournamentCoverModal({
  tournamentId,
  clubId,
  currentImageUrl,
  onClose,
  onSuccess,
}: {
  tournamentId: string;
  clubId: string;
  currentImageUrl: string | null;
  onClose: () => void;
  onSuccess: (tournament: Tournament) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick() {
    setError(null);
    setPicking(true);
    const { url, error: pickError, cancelled } = await pickAndUploadTournamentCover(supabase, clubId);
    setPicking(false);
    if (cancelled) return;
    if (pickError) {
      setError(pickError);
      return;
    }
    setPreviewUrl(url);
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const { tournament, error: rpcError } = await updateTournamentCoverImage(supabase, tournamentId, previewUrl);
    setSubmitting(false);
    if (rpcError || !tournament) {
      setError(rpcError ?? "No fue posible guardar la portada.");
      return;
    }
    onSuccess(tournament);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Editar portada</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <X width={16} height={16} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.fieldLabel}>Imagen promocional (opcional)</Text>
            <TouchableOpacity style={styles.imageBox} onPress={handlePick} disabled={picking} activeOpacity={0.8}>
              {picking ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : previewUrl ? (
                <Image source={{ uri: previewUrl }} style={styles.image} />
              ) : (
                <View style={styles.placeholder}>
                  <ImageIcon width={24} height={24} color={theme.colors.muted} />
                  <Text style={styles.placeholderText}>Toca para seleccionar una imagen</Text>
                </View>
              )}
            </TouchableOpacity>

            {previewUrl && (
              <TouchableOpacity style={styles.removeButton} onPress={() => setPreviewUrl(null)}>
                <X width={13} height={13} color={theme.colors.danger} />
                <Text style={styles.removeText}>Quitar imagen</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.caption}>JPG, PNG o WEBP · Máximo 5 MB</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.saveButton, submitting && { opacity: 0.6 }]} disabled={submitting} onPress={handleSave}>
                {submitting ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={styles.saveButtonText}>Guardar portada</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 0,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.white },
  closeButton: { padding: 6, borderRadius: 8 },
  body: { padding: 20, gap: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: theme.colors.white },
  imageBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  placeholder: { alignItems: "center", gap: 6 },
  placeholderText: { fontSize: 13, color: theme.colors.muted },
  caption: { fontSize: 11, color: theme.colors.muted },
  removeButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  removeText: { fontSize: 13, color: theme.colors.danger, fontWeight: "600" },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.2)",
    backgroundColor: "rgba(248,113,113,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { fontSize: 14, color: theme.colors.danger, textAlign: "center" },
  cancelButton: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  cancelButtonText: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  saveButton: { flex: 1, height: 46, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  saveButtonText: { fontSize: 14, fontWeight: "700", color: theme.colors.bg },
});
