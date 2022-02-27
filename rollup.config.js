import resolve from "@rollup/plugin-node-resolve";
import replace from "rollup-plugin-replace";
import { terser } from "rollup-plugin-terser";
import styles from "rollup-plugin-styles";
import typescript from "@rollup/plugin-typescript";

// ****************************************************
// Regular build
// ****************************************************
var config = {
  input: "src/keshif.js",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
    indent: false,

    assetFileNames: "[name][extname]",
    chunkFileNames: "[name].js",
    manualChunks(id) {
      if (!id.includes("node_modules")) return;
      if (
        ["leaflet", "supercluster", "topojson-client"].some((_) =>
          id.includes(_)
        )
      ) {
        return "vendor_mapping";
      }
      if (["papaparse"].some((_) => id.includes(_))) {
        return "papaparse";
      }
      return "vendor";
    },
  },
  context: "window",
  plugins: [
    replace({
      "process.env.NODE_ENV": '"production"',
    }),
    typescript({}),
    styles({
      mode: ["extract", "keshif.css"],
      minimize: true,
      extensions: [".less", ".css"],
    }),
    resolve(),
  ],
};

export default [
  config,

  // ****************************************************
  // Minified build
  // ****************************************************
  {
    ...config,
    output: {
      ...config.output,
      sourcemap: false,
      entryFileNames: "[name].min.js",
      assetFileNames: "[name].min[extname]",
      chunkFileNames: "[name].min.js",
    },
    plugins: [...config.plugins, terser()],
  },
];
