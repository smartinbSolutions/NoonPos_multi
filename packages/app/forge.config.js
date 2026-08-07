const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const {
  AutoUnpackNativesPlugin,
} = require("@electron-forge/plugin-auto-unpack-natives");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: "build/icons/icon", // Forge appends .ico (win) / .icns (mac) automatically
    ignore: (file) => {
      if (!file) return false;

      return !(
        file.startsWith("/.vite") ||
        file === "/package.json" ||
        file.startsWith("/node_modules")
      );
    },
  },
  rebuildConfig: {
    onlyModules: ["better-sqlite3"],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        setupIcon: "build/icons/icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        icon: "build/icons/icon.icns",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          icon: "build/icons/512x512.png",
        },
      },
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        options: {
          icon: "build/icons/512x512.png",
        },
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          {
            entry: "src/main.js",
            config: "vite.main.config.mjs",
            target: "main",
          },
          {
            entry: "src/preload.js",
            config: "vite.preload.config.mjs",
            target: "preload",
          },
        ],
        renderer: [
          {
            name: "main_window",
            config: "vite.renderer.config.mjs",
          },
          {
            name: "customer_window",
            config: "vite.customer-display.config.mjs",
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
