# Deploying WebAuthn-Local-Client WITH A Bundler

This project has non-ESM dependencies, which unfortunately cannot be *bundled* in with your other app code. Modern bundlers unfortunately don't out-of-the-box support configurations that can handle such a situation.

As such, this project provides plugins for webpack and vite, to take care of the various steps needed to get these non-ESM dependencies into an otherwise bundled web app built by those tools.

## Bundler Plugins

The plugins for vite and webpack are included in the `bundler-plugins/` directory. They should handle all necessary steps to load the dependencies.

**Note:** You should not need to manually copy any files out of the `dist/bundlers/` directory, as the plugins access the `webauthn-local-client` dependency (in `node_modules`) directly to pull the files needed. But for reference, the files these plugins access are:

* `dist/bundlers/walc.js`

    ESM library module that's suitable for bundling and `import`ing into your web app.

    **Note:** not `dist/auto/walc.js`, which is only intended [for web application projects WITHOUT a bundler](NON-BUNDLERS.md)

* `dist/bundlers/walc-external-bundle.js`

    Non-ESM (plain global .js) bundle of dependencies that must be loaded separately from (and prior to) your app's bundle. Includes the concatenated contents of these individual dependencies:

    - `dist/auto/external/libsodium.js`
    - `dist/auto/external/libsodium-wrappers.js`
    - `dist/auto/external/cbor.js`
    - `dist/auto/external/asn1.all.min.js`

**Note:** The [`ASN1` dependency](https://github.com/yoursunny/asn1.js) is [licensed under MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/), which is generally compatible with this library's [MIT license](LICENSE.txt). However, MPL 2.0 specifically requires preservation of the copyright/license header (block comment at top of `asn1.all.min.js`). To comply with this licensing requirement, ensure your tooling does not remove this comment from the bundle file.

### Vite Plugin

If using Vite 5+, it's strongly suggested to import this library's vite-plugin to manage the loading of its non-ESM dependencies. Add something like the following to your `vite.config.js` file:

```js
import { defineConfig } from "vite";
import WALC from "webauthn-local-client/bundlers/vite";

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

This plugin works for both the `vite dev` (dev-server) mode and the `vite build` mode. In both cases, it copies the `dist/bundlers/walc-external-bundle.js` file into the `public/` directory of your project root. It also injects a `<script src=..></script>` tag (to load `walc-external-bundle.js`) into the markup of the `index.html` file that vite produces for your app.

**Note:** At present, this plugin is not configurable in any way (e.g., calling `WALC()` above with no arguments) . If something about its behavior is not compatible with your vite project setup -- which can vary widely and be quite complex to predict or support by a basic plugin -- it's recommended you simply copy over the `webauthn-local-client/bundler-plugins/vite.mjs` plugin and make necessary changes.

### Webpack Plugin

If using Webpack 5+, make sure you're already using the [HTML Webpack Plugin](https://github.com/jantimon/html-webpack-plugin/) to manage building your `index.html` (and/or other HTML pages).

Then import this library's webpack-plugin to manage the loading of its non-ESM dependencies. Add something like the following to your `webpack.config.js`:

```js
// 'HtmlWebpackPlugin' is a required dependency of the
// webauthn-local-client webpack plugin
import HtmlWebpackPlugin from "html-webpack-plugin";
import WALC from "webauthn-local-client/bundlers/webpack";

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

This plugin copies the `dist/bundlers/walc-external-bundle.js` file into the build root (default `dist/`), along with the other bundled files. It also injects a `<script src=..></script>` tag (to load `walc-external-bundle.js`) into the markup of the `index.html` file (and any other HTML files) that webpack produces for your app.

**Note:** At present, this plugin is not configurable in any way (e.g., calling `WALC()` above with no arguments). If something about its behavior is not compatible with your webpack project setup -- which can vary widely and be quite complex to predict or support by a basic plugin -- it's recommended you simply copy over the `webauthn-local-client/bundler-plugins/webpack.mjs` plugin and make necessary changes.

## Import/Usage

To import and use **webauthn-local-client** in a *bundled* browser app:

```js
import { register, auth } from "webauthn-local-client";
```

When `import`ed like this, both vite and webpack should (via these plugins) properly find and bundle the `dist/bundlers/walc.js` ESM library module with the rest of your app code, without any further steps necessary.
