// vite.customer-display.config.mjs
import { defineConfig, transformWithEsbuild } from "file:///Users/muhannad/Desktop/NoonPos_multi/node_modules/vite/dist/node/index.js";
import path from "node:path";
import { createRequire } from "node:module";
var frontendRequire = createRequire(
  path.resolve("src/frontend/package.json")
);
var tailwindcss = frontendRequire("tailwindcss");
var autoprefixer = frontendRequire("autoprefixer");
var vite_customer_display_config_default = defineConfig({
  plugins: [
    {
      name: "load-js-files-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (!id.match(/src\/frontend\/src\/.*\.(js|jsx)$/)) return null;
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic"
        });
      }
    }
  ],
  esbuild: {
    loader: "jsx",
    include: /src\/frontend\/src\/.*\.(js|jsx)$/
  },
  build: {
    rollupOptions: {
      input: path.resolve(process.cwd(), "customer_window.html")
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx"
      }
    }
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: path.resolve("src/frontend/tailwind.config.js")
        }),
        autoprefixer()
      ]
    }
  }
});
export {
  vite_customer_display_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jdXN0b21lci1kaXNwbGF5LmNvbmZpZy5tanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbXVoYW5uYWQvRGVza3RvcC9Ob29uUG9zX211bHRpL3BhY2thZ2VzL2FwcFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL211aGFubmFkL0Rlc2t0b3AvTm9vblBvc19tdWx0aS9wYWNrYWdlcy9hcHAvdml0ZS5jdXN0b21lci1kaXNwbGF5LmNvbmZpZy5tanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL211aGFubmFkL0Rlc2t0b3AvTm9vblBvc19tdWx0aS9wYWNrYWdlcy9hcHAvdml0ZS5jdXN0b21lci1kaXNwbGF5LmNvbmZpZy5tanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIHRyYW5zZm9ybVdpdGhFc2J1aWxkIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tIFwibm9kZTptb2R1bGVcIjtcblxuY29uc3QgZnJvbnRlbmRSZXF1aXJlID0gY3JlYXRlUmVxdWlyZShcbiAgcGF0aC5yZXNvbHZlKFwic3JjL2Zyb250ZW5kL3BhY2thZ2UuanNvblwiKVxuKTtcbmNvbnN0IHRhaWx3aW5kY3NzID0gZnJvbnRlbmRSZXF1aXJlKFwidGFpbHdpbmRjc3NcIik7XG5jb25zdCBhdXRvcHJlZml4ZXIgPSBmcm9udGVuZFJlcXVpcmUoXCJhdXRvcHJlZml4ZXJcIik7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICB7XG4gICAgICBuYW1lOiBcImxvYWQtanMtZmlsZXMtYXMtanN4XCIsXG4gICAgICBlbmZvcmNlOiBcInByZVwiLFxuICAgICAgYXN5bmMgdHJhbnNmb3JtKGNvZGUsIGlkKSB7XG4gICAgICAgIGlmICghaWQubWF0Y2goL3NyY1xcL2Zyb250ZW5kXFwvc3JjXFwvLipcXC4oanN8anN4KSQvKSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVdpdGhFc2J1aWxkKGNvZGUsIGlkLCB7XG4gICAgICAgICAgbG9hZGVyOiBcImpzeFwiLFxuICAgICAgICAgIGpzeDogXCJhdXRvbWF0aWNcIixcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgIH0sXG4gIF0sXG4gIGVzYnVpbGQ6IHtcbiAgICBsb2FkZXI6IFwianN4XCIsXG4gICAgaW5jbHVkZTogL3NyY1xcL2Zyb250ZW5kXFwvc3JjXFwvLipcXC4oanN8anN4KSQvLFxuICB9LFxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgXCJjdXN0b21lcl93aW5kb3cuaHRtbFwiKSxcbiAgICB9LFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBlc2J1aWxkT3B0aW9uczoge1xuICAgICAgbG9hZGVyOiB7XG4gICAgICAgIFwiLmpzXCI6IFwianN4XCIsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIGNzczoge1xuICAgIHBvc3Rjc3M6IHtcbiAgICAgIHBsdWdpbnM6IFtcbiAgICAgICAgdGFpbHdpbmRjc3Moe1xuICAgICAgICAgIGNvbmZpZzogcGF0aC5yZXNvbHZlKFwic3JjL2Zyb250ZW5kL3RhaWx3aW5kLmNvbmZpZy5qc1wiKSxcbiAgICAgICAgfSksXG4gICAgICAgIGF1dG9wcmVmaXhlcigpLFxuICAgICAgXSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTRXLFNBQVMsY0FBYyw0QkFBNEI7QUFDL1osT0FBTyxVQUFVO0FBQ2pCLFNBQVMscUJBQXFCO0FBRTlCLElBQU0sa0JBQWtCO0FBQUEsRUFDdEIsS0FBSyxRQUFRLDJCQUEyQjtBQUMxQztBQUNBLElBQU0sY0FBYyxnQkFBZ0IsYUFBYTtBQUNqRCxJQUFNLGVBQWUsZ0JBQWdCLGNBQWM7QUFFbkQsSUFBTyx1Q0FBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1A7QUFBQSxNQUNFLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sVUFBVSxNQUFNLElBQUk7QUFDeEIsWUFBSSxDQUFDLEdBQUcsTUFBTSxtQ0FBbUMsRUFBRyxRQUFPO0FBRTNELGVBQU8scUJBQXFCLE1BQU0sSUFBSTtBQUFBLFVBQ3BDLFFBQVE7QUFBQSxVQUNSLEtBQUs7QUFBQSxRQUNQLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLFFBQVE7QUFBQSxJQUNSLFNBQVM7QUFBQSxFQUNYO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixPQUFPLEtBQUssUUFBUSxRQUFRLElBQUksR0FBRyxzQkFBc0I7QUFBQSxJQUMzRDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLGdCQUFnQjtBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ04sT0FBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsS0FBSztBQUFBLElBQ0gsU0FBUztBQUFBLE1BQ1AsU0FBUztBQUFBLFFBQ1AsWUFBWTtBQUFBLFVBQ1YsUUFBUSxLQUFLLFFBQVEsaUNBQWlDO0FBQUEsUUFDeEQsQ0FBQztBQUFBLFFBQ0QsYUFBYTtBQUFBLE1BQ2Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
