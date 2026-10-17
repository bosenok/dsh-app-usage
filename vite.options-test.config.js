import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vue()],
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		outDir: "dist-test-options",
		emptyOutDir: true,
		lib: {
			entry: "test/options-smoke.mjs",
			formats: ["es"],
			fileName: () => "options-smoke.mjs",
		},
		rollupOptions: {
			external: ["node:fs"],
		},
	},
});
