const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const {
  AutoUnpackNativesPlugin,
} = require("@electron-forge/plugin-auto-unpack-natives");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: "build/icons/icon",
    extraResource: ["../db-setup/bin", "resources/send-raw-print.ps1"],
    ignore: (file) => {
      if (!file) return false;
      return !(
        file.startsWith("/.vite") ||
        file === "/package.json" ||
        file.startsWith("/node_modules")
      );
    },
    afterCopy: [
      (buildPath, electronVersion, platform, arch, callback) => {
        // npm workspace hoisting puts these modules only in the repo
        // root's node_modules, invisible to Forge's packager (which only
        // ever looks inside packages/app/node_modules). Copy just these
        // specific ones in manually — NOT the whole node_modules tree,
        // since that would ship dev-only tooling (electron itself, vite,
        // every Forge plugin) into the customer-facing installer,
        // doubling its size for no reason.
        const fs = require("fs");
        const path = require("path");
        const workspaceRoot = path.join(__dirname, "..", "..");

        const modulesToCopy = [
          "pg",
          "pg-pool",
          "pg-protocol",
          "pg-types",
          "pg-connection-string",
          "pg-int8",
          "pgpass",
          "serialport",
          "@serialport",
          "ms",
          "debug",
        ];

        for (const moduleName of modulesToCopy) {
          const src = path.join(workspaceRoot, "node_modules", moduleName);
          const dest = path.join(buildPath, "node_modules", moduleName);

          if (fs.existsSync(src)) {
            fs.cpSync(src, dest, { recursive: true });
            console.log(`Copied hoisted module: ${moduleName}`);
          } else {
            console.warn(`Hoisted module not found at ${src}, skipping`);
          }
        }

        callback();
      },
    ],
  },
  rebuildConfig: {
    onlyModules: ["better-sqlite3"],
  },
  hooks: {
    postPackage: async (forgeConfig, options) => {
      if (process.platform !== "darwin") return;
      const { execSync } = require("child_process");
      const path = require("path");
      for (const outputPath of options.outputPaths) {
        const binPath = path.join(
          outputPath,
          `${options.packagerConfig?.name || "NOON POS"}.app`,
          "Contents",
          "Resources",
          "bin",
        );
        try {
          execSync(`xattr -dr com.apple.quarantine "${binPath}"`);
          console.log(`Stripped quarantine from ${binPath}`);
        } catch (err) {
          console.warn(
            `Could not strip quarantine from ${binPath}:`,
            err.message,
          );
        }
      }
    },
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
