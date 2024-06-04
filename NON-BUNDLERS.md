# Deploying WebAuthn-Local-Client WITHOUT A Bundler

To use this library directly -- i.e., in a classic/vanilla web project without a modern bundler tool -- make a directory for it (e.g., `/path/to/js-assets/webauthn-local-client/`) in your browser app's JS assets directory.

Then copy over all `dist/auto/*` contents, as-is:

* `dist/auto/walc.js`

    **Note:** this is *not* the same as `dist/bundlers/walc.mjs`, which is only intended [for web application projects WITH a bundler](BUNDLERS.md)

* `dist/auto/external.js`

    This is an *auto-loader* that dynamically loads the `external/libsodium*` dependencies via `<script>`-element injection into the DOM. `dist/auto/walc.js` imports and activates this loader automatically, along with the necessary `@oslojs/*` dependencies.

* `dist/auto/external/*` (preserve the whole `external/` sub-directory):
    - `libsodium.js`
    - `libsodium-wrappers.js`
    - `@oslojs/` (including all its contents)

## Import/Usage

To import and use **webauthn-local-client** in a *non-bundled* browser app:

```js
import { register, auth } from "/path/to/js-assets/webauthn-local-client/walc.js";
```

Some of the library's dependencies will be auto-loaded via `external.js`, while the others require the [*import-map* as shown below](#using-import-map).

### Using Import Map

When not using a bundler, the `@oslojs/*` ESM dependencies require an [Import Map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) in the page's HTML, with the following entries:

```html
<script type="importmap">
{
    "imports": {
        "@oslojs/cbor": "/path/to/js-assets/external/@oslojs/cbor/index.js",
        "@oslojs/asn1": "/path/to/js-assets/external/@oslojs/asn1/index.js",
        "@oslojs/binary": "/path/to/js-assets/external/@oslojs/binary/index.js"
    }
}
```

----

You can also improve the `import` of **webauthn-local-client** library itself by including this entry:

```json
"webauthn-local-client": "/path/to/js-assets/webauthn-local-client/walc.js"
```

Then you'll be able to `import` the library in a more friendly/readable way:

```js
import { register, auth } from "webauthn-local-client";
```
