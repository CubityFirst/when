import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	accountId: "d843ae90cab33e54f4d284bc65d2fd6a",
	worker: {
		name: "when",
		compatibilityDate: "2026-09-01",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "worker/index.ts",
		workersDev: false,
		observability: {
			enabled: true,
		},
		assets: {
			notFoundHandling: "single-page-application",
			runWorkerFirst: [
				"/*",
				"!/assets/*",
				"!/brand/*",
				"!/favicon.svg",
			],
		},
		domains: [
			"when.cubityfir.st",
		],
		env: {
			DB: bindings.d1({
				name: "when-db",
				id: "9d2bf78a-701f-408e-a677-2e3e9e2f5d95",
			}),
			ASSETS: bindings.assets(),
		},
	},
});
