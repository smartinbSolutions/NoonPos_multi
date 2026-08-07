import { defineConfig, transformWithEsbuild } from "vite";
import path from "node:path";
import { createRequire } from "node:module";

const frontendRequire = createRequire(
  path.resolve("src/frontend/package.json"),
);
const tailwindcss = frontendRequire("tailwindcss");
const autoprefixer = frontendRequire("autoprefixer");

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    {
      name: "load-js-files-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (!id.match(/src\/frontend\/src\/.*\.(js|jsx)$/)) return null;

        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
  ],
  esbuild: {
    loader: "jsx",
    include: /src\/frontend\/src\/.*\.(js|jsx)$/,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: path.resolve("src/frontend/tailwind.config.js"),
        }),
        autoprefixer(),
      ],
    },
  },
});
