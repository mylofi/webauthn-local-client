# Deploying WebAuthn-Local-Client WITHOUT A Bundler

To use this library directly -- i.e., in a classic/vanilla web project without a modern bundler tool -- make a directory for it (e.g., `webauthn-local-client/`) in your browser app's JS assets directory.

Then copy over all `@lo-fi/webauthn-local-client/dist/auto/*` contents, as-is:

* `@lo-fi/webauthn-local-client/dist/auto/walc.js`

    **Note:** this is *not* the same as `dist/bundlers/walc.mjs`, which is only intended [for web application projects WITH a bundler](BUNDLERS.md)

* `@lo-fi/webauthn-local-client/dist/auto/external.js`

    This is an *auto-loader* that dynamically loads the rest of the non-ESM `external/*` dependencies via `<script>`-element injection into the DOM. `@lo-fi/webauthn-local-client/dist/auto/walc.js` runs this loader automatically.

* `@lo-fi/webauthn-local-client/dist/auto/external/*` (preserve the whole `external/` sub-directory):
    - `libsodium.js`
    - `libsodium-wrappers.js`
    - `cbor.js`
    - `asn1.all.min.js`

## Import/Usage

To import and use **webauthn-local-client** in a *non-bundled* browser app:

```js
import { register, auth } from "/path/to/js-assets/webauthn-local-client/walc.js";
```

The library's dependencies will be auto-loaded (via `external.js`).

## Using Import Map

If your **non-bundled** browser app has an [Import Map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap), you can improve the `import` by adding an entry for this library:

```html
<script type="importmap">
{
    "imports": {
        "webauthn-local-client": "/path/to/js-assets/webauthn-local-client/walc.js"
    }
}
</script>
```

Then you'll be able to `import` the library in a more friendly/readable way:

```js
import { register, auth } from "webauthn-local-client";
```
