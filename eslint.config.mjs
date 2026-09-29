import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  js.configs.recommended,
  globalIgnores([".next/**", "node_modules/**", "**/*.ts", "**/*.tsx", "coverage/**", "public/ffmpeg/**", "public/onnxruntime/**"]),
]);
