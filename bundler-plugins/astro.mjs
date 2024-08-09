import path from "node:path";

import vitePlugin from "./vite.mjs";


// ********************************

export default WALC;


// ********************************

function WALC() {
	var command = null;
	var vite = vitePlugin();

	WALC.vite = () => {
		// copy a subset of the vite plugin hooks that are still
		// necessary, even though astro plugin is mostly taking
		// over the task
		return {
			name: vite.name,
			enforce: vite.enforce,
			resolveId: vite.resolveId,
			load: vite.load,
		};
	};

	return {
		name: "astro-plugin-ldl",
		hooks: {
			["astro:config:setup"](options) {
				command = options.command;
				options.injectScript(
					"head-inline",
					`{let el=document.createElement("script");el.async=false;el.src="/walc-external-bundle.js";document.head.appendChild(el);}`
				);
			},
			["astro:config:done"](options) {
				// call the underlying vite plugin's `configResolved()` hook,
				// passing along to it (an artificial subset of) its expected
				// `config` object
				vite.configResolved({
					command: (
						command == "dev" ? "serve" :

						[ "preview", "build", ].includes(command) ? "build" :

						// note: should not use this!
						"unknown"
					),
					root: options.config.root.pathname,
					publicDir: options.config.publicDir.pathname,
					build: {
						// note: vite expects this to be relative to root
						outDir: options.config.outDir.pathname.replace(options.config.root.pathname,""),
					},
				});
			},
		},
	};
}
