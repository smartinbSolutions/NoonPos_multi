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
        const fs = require("fs");
        const path = require("path");
        const { execSync } = require("child_process");
        const workspaceRoot = path.join(__dirname, "..", "..");

        // npm workspace hoisting puts production dependencies only in
        // the repo root's node_modules, invisible to Forge's packager
        // (which only ever looks inside packages/app/node_modules).
        // Rather than hand-maintaining a list of package names (we
        // missed several transitive deps doing it that way across a
        // few builds), ask npm itself for the real, complete production
        // dependency tree and copy exactly that. --omit=dev excludes
        // build tooling (electron, vite, every Forge plugin) so the
        // shipped installer doesn't balloon with things end users
        // never need.
        let modulePaths = [];
        try {
          const output = execSync("npm ls --omit=dev --all --parseable", {
            cwd: workspaceRoot,
            maxBuffer: 1024 * 1024 * 10,
          }).toString();
          modulePaths = output
            .split("\n")
            .map((line) => line.trim())
            .filter((line) =>
              line.includes(`${path.sep}node_modules${path.sep}`),
            );
        } catch (err) {
          // npm ls exits non-zero on some benign warnings (peer dep
          // mismatches etc.) but still prints valid output to stdout —
          // use it if we got any, otherwise this is a real failure.
          if (err.stdout) {
            modulePaths = err.stdout
              .toString()
              .split("\n")
              .map((line) => line.trim())
              .filter((line) =>
                line.includes(`${path.sep}node_modules${path.sep}`),
              );
          } else {
            console.error("Failed to run npm ls:", err.message);
          }
        }

        let copiedCount = 0;
        for (const modulePath of modulePaths) {
          if (!fs.existsSync(modulePath)) continue;

          // Skip the app's own package (noon_pos) and the workspace
          // packages (@noonpos/db-setup*) — those aren't runtime
          // node_modules deps, they're workspace-linked and already
          // handled elsewhere (extraResource for db-setup's bin folder).
          if (
            modulePath.endsWith(`${path.sep}noon_pos`) ||
            modulePath.includes(`${path.sep}@noonpos${path.sep}`)
          ) {
            continue;
          }

          const relative = path.relative(
            path.join(workspaceRoot, "node_modules"),
            modulePath,
          );
          // Skip anything not actually rooted under the workspace's own
          // node_modules (npm ls can list nested/duplicated paths too;
          // relative starting with ".." means it's outside that tree).
          if (relative.startsWith("..")) continue;

          const dest = path.join(buildPath, "node_modules", relative);
          if (fs.existsSync(dest)) continue; // already present, don't overwrite

          try {
            fs.cpSync(modulePath, dest, { recursive: true });
            copiedCount++;
          } catch (err) {
            console.warn(`Failed to copy ${relative}:`, err.message);
          }
        }

        console.log(
          `Copied ${copiedCount} hoisted production dependencies into packaged app.`,
        );
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
