import { Image, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { theme } from "../../lib/theme";

// Traducción 1:1 de ImagePreviewModal.tsx (app web) — lightbox de pantalla
// completa para ver la portada en grande, cierra al tocar el fondo o la X.
export function ImagePreviewModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={10}>
          <X width={20} height={20} color={theme.colors.white} />
        </TouchableOpacity>
        <Image source={{ uri: src }} style={styles.image} resizeMode="contain" />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  image: { width: "92%", height: "80%" },
  closeButton: { position: "absolute", top: 56, right: 20, padding: 10, zIndex: 1 },
});
