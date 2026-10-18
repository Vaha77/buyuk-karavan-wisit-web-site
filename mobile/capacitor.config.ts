import type { CapacitorConfig } from "@capacitor/cli";

// The app opens the live admin panel: a site deploy updates the app too, no store release needed.
const config: CapacitorConfig = {
  appId: "uz.buyukkaravan.admin",
  appName: "BK Admin",
  webDir: "www",
  server: {
    url: "https://buyukkaravan.com/admin",
    // Only our domain stays inside the app; t.me, tel:, maps and other hosts open in their own apps.
    allowNavigation: ["buyukkaravan.com"],
    // Shown when the site cannot be loaded (no internet).
    errorPath: "offline.html",
  },
  plugins: {
    StatusBar: { backgroundColor: "#102c47", style: "DARK", overlaysWebView: false },
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#ffffff", showSpinner: false },
  },
};

export default config;
