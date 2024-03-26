import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";


export default WALC;


// ********************************

// References:
//    https://github.com/principalstudio/html-webpack-inject-preload
//    https://github.com/icelam/html-inline-script-webpack-plugin

function WALC() {
	var options;
	var walcSrcPath;
	var externalBundleSrcPath;
	var externalBundleDestPath;
	var externalBundleCopied = false;
	var pluginName = "WALCWebpackPlugin";

	return {
		apply(compiler) {
			compiler.hooks.beforeRun.tap(pluginName,compiler => {
				options = compiler.options;

				var bundlersDir = path.join(options.context,"node_modules","@lo-fi","webauthn-local-client","dist","bundlers");
				walcSrcPath = path.join(bundlersDir,"walc.mjs");
				externalBundleSrcPath = path.join(bundlersDir,"walc-external-bundle.js");
				externalBundleDestPath = path.join(options.output.path,path.basename(externalBundleSrcPath));
			});
			compiler.hooks.compilation.tap(pluginName,compiler => {
				var htmlWebpackPlugin = extractHtmlWebpackPluginModule(compiler);
				if (htmlWebpackPlugin) {
					let hooks = htmlWebpackPlugin.getHooks(compiler);
					hooks.alterAssetTags.tapAsync(pluginName,(htmlPluginData,cb) => {
						// prepend <script src=walc-external-bundle.js> element
						htmlPluginData.assetTags.scripts.unshift({
							tagName: "script",
							attributes: {
								src: `/${path.basename(externalBundleDestPath)}`,
							},
							meta: {
								plugin: pluginName,
							},
						});
						cb();
					});
				}
				else {
					throw new Error(`${pluginName} requires 'html-webpack-plugin', v4 or v5`);
				}
			});
			compiler.hooks.afterEmit.tapAsync(pluginName,async (v,cb) => {
				try {
					await copyExternalBundle();
					cb();
				}
				catch (err) {
					cb(err);
				}
			});
		},
	};


	// ****************************

	async function copyExternalBundle() {
		if (
			// need to copy the external bundle?
			!externalBundleCopied &&

			// bundle output path set properly?
			externalBundleDestPath &&

			// bundle file exists?
			fs.existsSync(externalBundleSrcPath) &&

			// destination directory exists?
			fs.existsSync(path.dirname(externalBundleDestPath))
		) {
			try {
				await fsp.copyFile(externalBundleSrcPath,externalBundleDestPath);
				externalBundleCopied = true;
			}
			catch (err) {
				console.log(err);
			}
		}
	}

	function extractHtmlWebpackPluginModule(compiler) {
		var htmlWebpackPlugin = (compiler.options.plugins || []).find(plugin => (
			plugin.constructor.name == "HtmlWebpackPlugin"
		));
		if (!(htmlWebpackPlugin && htmlWebpackPlugin.constructor && htmlWebpackPlugin.constructor.getHooks)) {
			return null;
		}
		return htmlWebpackPlugin.constructor;
	}
}
