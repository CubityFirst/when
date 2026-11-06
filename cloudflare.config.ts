import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ isPreview }) => ({
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
			// Pages go through the worker so group and event links get link previews.
			runWorkerFirst: [
				"/*",
				"!/assets/*",
				"!/brand/*",
				"!/favicon.svg",
			],
		},
		// Previews get their own URL; only production serves the custom domain.
		domains: isPreview ? [] : [
			"when.cubityfir.st",
		],
		env: {
			// Previews (`cf previews deploy`, run by Workers Builds on branch pushes) use a
			// separate database so they never touch production data. It was loaded from
			// schema.sql; apply new migrations to it as well as to when-db.
			DB: isPreview
				? bindings.d1({
					name: "when-db-preview",
					id: "069ed5d5-9f5d-41e6-99ea-b9f82df323ac",
				})
				: bindings.d1({
					name: "when-db",
					id: "9d2bf78a-701f-408e-a677-2e3e9e2f5d95",
				}),
			ASSETS: bindings.assets(),
		},
	},
}));
