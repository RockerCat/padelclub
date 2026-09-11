import type { ConfigContext, ExpoConfig } from "expo/config";

// Reemplaza app.json (JSON estático, no puede leer variables de entorno).
// Causa única de este cambio: react-native-maps depende de
// com.google.android.gms:play-services-maps, que en Android exige
// com.google.android.geo.API_KEY en el AndroidManifest final — ausente en
// el AAB real rechazado por Google Play (versionCode 4, commit 623d22e,
// confirmado inspeccionando ese artefacto). android.config.googleMaps.apiKey
// es la propiedad de Expo que SDK/prebuild traduce a ese meta-data — GOOGLE_MAPS_API_KEY
// se lee de una EAS Environment Variable (visibility "sensitive" o
// "plaintext", NUNCA "secret" — ese tipo no está disponible durante la
// resolución de app.config.js/ts en `eas build`, solo dentro del propio
// build) para que nunca quede hardcodeada en git. Sin prefijo EXPO_PUBLIC_
// a propósito: esta key solo se necesita al generar el manifest nativo,
// nunca en el bundle JS en runtime. Todo lo demás es 1:1 con el app.json
// anterior, sin ningún cambio funcional.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Mi Pádel Club",
  slug: "padelclub-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#001A24",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "club.mipadel.app",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "club.mipadel.app",
    adaptiveIcon: {
      backgroundColor: "#001A24",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-notifications"],
  extra: {
    eas: {
      projectId: "6603b3e9-97ac-4af9-9eca-3b4f0f069abd",
    },
  },
  owner: "alexsosa_me",
});
