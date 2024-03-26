# Deploying WebAuthn-Local-Client WITH A Bundler

This project has non-ESM dependencies, which unfortunately cannot be *bundled* in with your other app code. Modern bundlers unfortunately don't out-of-the-box support configurations that can handle such a situation.

As such, this project provides plugins for Vite and Webpack, to take care of the various steps needed to get these non-ESM dependencies into an otherwise bundled web app built by those tools.

## Bundler Plugins

The plugins for Vite and Webpack are included in the `bundler-plugins/` directory. They should handle all necessary steps to load the dependencies.

**Note:** You should not need to manually copy any files out of the `dist/bundlers/` directory, as the plugins access the `webauthn-local-client` dependency (in `node_modules`) directly to pull the files needed. But for reference, the files these plugins access are:

* `dist/bundlers/walc.mjs`

    ESM library module that's suitable for bundling and `import`ing into your web app.

    **Note:** this is *not* the same as `dist/auto/walc.js`, which is only intended [for web application projects WITHOUT a bundler](NON-BUNDLERS.md)

* `dist/bundlers/walc-external-bundle.js`

    Non-ESM (plain global .js) bundle of dependencies that must be loaded separately from (and prior to) your app's bundle. Includes the concatenated contents of these individual dependencies:

    - `dist/auto/external/libsodium.js`
    - `dist/auto/external/libsodium-wrappers.js`
    - `dist/auto/external/cbor.js`
    - `dist/auto/external/asn1.all.min.js`

**Note:** The [`ASN1` dependency](https://github.com/yoursunny/asn1.js) is [licensed under MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/), which is generally compatible with this library's [MIT license](LICENSE.txt). However, MPL 2.0 specifically requires preservation of the copyright/license header (block comment at top of `asn1.all.min.js`). To comply with this licensing requirement, ensure your tooling does not remove this comment from the bundle file.

### Vite Plugin

If using Vite 5+, it's strongly suggested to import this library's Vite-plugin to manage the loading of its non-ESM dependencies. Add something like the following to your `vite.config.js` file:

```js
import { defineConfig } from "vite";
import WALC from "@lo-fi/webauthn-local-client/bundlers/vite";

export default defineConfig({
    // ..

    plugins: [ WALC() ],

    build: {
        // WALC uses "top-level await", which is ES2022+
        target: "es2022"
    },

    // ..
});
```

This plugin works for the `vite dev` (dev-server), `vite preview` (also dev-server), and `vite build` modes. In all cases, it copies the `dist/bundlers/walc-external-bundle.js` file into the `public/` directory of your project root. It also injects a `<script src="/walc-external-bundle.js"></script>` tag into the markup of the `index.html` file that Vite produces for your app.

**Note:** At present, this plugin is not configurable in any way (i.e., calling `WALC()` above with no arguments). If something about its behavior is not compatible with your Vite project setup -- which can vary widely and be quite complex to predict or support by a basic plugin -- it's recommended you simply copy over the `webauthn-local-client/bundler-plugins/vite.mjs` plugin and make necessary changes.

#### Top-level `await`

This library uses ["top-level `await`"](https://github.com/tc39/proposal-top-level-await), a feature added to JS in ES2022. The current default target for Vite seems to be browsers older than this, so the above config explicitly sets the `build.target` to `"es2022"`.

You may experience issues where your tooling/configuration either ignores this setting, or otherwise breaks with it set. This may variously result in seeing an error about the top-level `await`s in this library being incompatible with the built-target, or an error about `await` needing to only be in `async function`s or the top-level of a module (which it is!).

Those types of errors generally indicate that you may need to configure Vite to skip trying to optimize the `walc.mjs` file during bundling, something like:

```js
export default defineConfig({

    // ..

    optimizeDeps: {
        exclude: [ "@lo-fi/webauthn-local-client" ]
    }

    // ..
});
```

#### SSR Breakage

An unfortunate gotcha of tools that wrap Vite (e.g., Astro, Nuxt, etc) and do SSR (server-side rendering) is that they *break* a key assumption/behavior of this module's Vite plugin: the HTML injection of `<script src="/walc-external-bundle.js"></script>`.

As such, you'll likely need to manually add that `<script>` tag to your HTML pages/templates. The Vite plugin still copies that file into the `public/` folder for you, so it should load once the tag is added to your HTML.

### Webpack Plugin

If using Webpack 5+, make sure you're already using the [HTML Webpack Plugin](https://github.com/jantimon/html-webpack-plugin/) to manage building your `index.html` (and/or other HTML pages).

Then import this library's Webpack-plugin to manage the loading of its non-ESM dependencies. Add something like the following to your `webpack.config.js`:

```js
// 'HtmlWebpackPlugin' is a required dependency of the
// webauthn-local-client Webpack plugin
import HtmlWebpackPlugin from "html-webpack-plugin";
import WALC from "@lo-fi/webauthn-local-client/bundlers/webpack";

export default {
    // ..

    plugins: [
        // required WALC dependency
        new HtmlWebpackPlugin({
            // ..
        }),

        WALC()
    ],

    // ..
};
```

This plugin copies the `dist/bundlers/walc-external-bundle.js` file into the build root (default `dist/`), along with the other bundled files. It also injects a `<script src="walc-external-bundle.js"></script>` tag into the markup of the `index.html` file (and any other HTML files) that Webpack produces for your app.

**Note:** At present, this plugin is not configurable in any way (i.e., calling `WALC()` above with no arguments). If something about its behavior is not compatible with your Webpack project setup -- which can vary widely and be quite complex to predict or support by a basic plugin -- it's recommended you simply copy over the `webauthn-local-client/bundler-plugins/webpack.mjs` plugin and make necessary changes.

## Import/Usage

To import and use **webauthn-local-client** in a *bundled* browser app:

```js
import { register, auth } from "@lo-fi/webauthn-local-client";
```

When `import`ed like this, both Vite and Webpack should (via these plugins) properly find and bundle the `dist/bundlers/walc.mjs` ESM library module with the rest of your app code, hopefully without any further steps necessary.
