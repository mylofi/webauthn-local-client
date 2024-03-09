# WebAuthn Local Client

[![npm Module](https://badge.fury.io/mylofi/webauthn-local-client.svg)](https://www.npmjs.org/package/webauthn-local-client)
[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

**WebAuthn-Local-Client** is a web (browser) client for locally managing the ["Web Authentication" (`WebAuthn`) API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API).

The `WebAuthn` API lets users of web applications avoid the long-troubled use of (often insecure) passwords, and instead present personal biometric factors (touch-ID, FaceID, etc) via their device to prove their identity for login/authentication, authorization, etc. Traditionally, this authentication process involves an application interacting with a [FIDO2 Server](https://fidoalliance.org/fido2/) to initiate, verify, and store responses to such `WebAuthn` API interactions.

However, the intended use-case for **WebAuthn-Local-Client** is to allow [Local-First Web](https://localfirstweb.dev/) applications to handle user login locally on a device, without any server (FIDO2 or otherwise).

**Note:** This package *may* be used in combination with a traditional FIDO2 server application architecture, but does not include any specific functionality for that purpose.

## Usage

The [**webauthn-local-client** npm package](https://npmjs.com/package/webauthn-local-client) ships with a `dist/` directory with all files you need to deploy.

Make a directory (e.g. `webauthn-local-client/`) in your browser app's JS assets, and copy all files from `dist/` (including `dist/external/*` files) as-is into it.

Then import the library in an ESM module in your browser app:

```js
import { register, auth, } from "/path/to/webauthn-local-client/index.js";
```

**Note:** This library exposes its API in modern ESM format, but it relies on dependencies that are non-ESM (UMD), which automatically add themselves to the global namespace; it cannot use `import` to load its own dependencies. Instead, the included `external.js` module manages loading the dependencies via `<script>` element injection into the page. If your development/deployment processes include bundling (webpack, rollup, etc), please configure your tool(s) to skip bundling this library and its dependencies, and just copy them over as indicated above. Alternately, before/during build, you'll need to make sure the `import "./external.js"` line at the top of `index.js` is removed/commented out, to ensure that module is skipped in the bundle.

// More TBA

## Re-building `dist/*`

If you need to rebuild the `dist/*` files, run:

```cmd
npm install

npm run build:all
```

## License

[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

All code and documentation are (c) 2024 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
