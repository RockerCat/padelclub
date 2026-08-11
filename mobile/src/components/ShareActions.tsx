import { useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, MessageCircle } from "lucide-react-native";
import { theme } from "../lib/theme";

// Traducción 1:1 de ReservationShareActions.tsx (app web) — mismo endpoint
// api.whatsapp.com/send (nunca wa.me — ver CLAUDE.md → WhatsApp Share
// Principles), mismos íconos lucide, mismos tamaños/gaps exactos:
// compact — `flex items-center gap-3` (12px), texto `text-[11px]
// font-medium`, íconos `w-3 h-3` (12px), gap-1 (4px) ícono-texto.
// full (detalle) — botones `h-10 px-4 rounded-xl text-sm font-medium`,
// íconos `w-4 h-4` (16px), gap-2 (8px) ícono-texto.
export function ShareActions({ url, message, compact }: { url: string; message: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const whatsappHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  async function handleWhatsApp() {
    await Linking.openURL(whatsappHref);
  }

  async function handleCopy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <TouchableOpacity onPress={handleWhatsApp} style={styles.compactButton} hitSlop={8}>
          <MessageCircle width={12} height={12} color="#34D399" />
          <Text style={styles.compactWhatsapp}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleCopy} style={styles.compactButton} hitSlop={8}>
          {copied ? <Check width={12} height={12} color="#34D399" /> : <Copy width={12} height={12} color={theme.colors.muted} />}
          <Text style={copied ? styles.compactCopied : styles.compactMuted}>{copied ? "Enlace copiado" : "Copiar enlace"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={handleWhatsApp} style={styles.whatsappButton} activeOpacity={0.85}>
        <MessageCircle width={16} height={16} color="#34D399" />
        <Text style={styles.whatsappText}>WhatsApp</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleCopy} style={styles.copyButton} activeOpacity={0.85}>
        {copied ? <Check width={16} height={16} color="#34D399" /> : <Copy width={16} height={16} color="rgba(255,255,255,0.9)" />}
        <Text style={copied ? styles.copiedText : styles.copyText}>{copied ? "Enlace copiado" : "Copiar enlace"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  compactButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2 },
  compactWhatsapp: { fontSize: 11, fontWeight: "500", color: "#34D399" },
  compactMuted: { fontSize: 11, fontWeight: "500", color: theme.colors.muted },
  compactCopied: { fontSize: 11, fontWeight: "500", color: "#34D399" },
  row: { flexDirection: "row", gap: 8 },
  whatsappButton: {
    flex: 1,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  whatsappText: { color: "#34D399", fontSize: 14, fontWeight: "500" },
  copyButton: {
    flex: 1,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  copyText: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "500" },
  copiedText: { color: "#34D399", fontSize: 14, fontWeight: "500" },
});
