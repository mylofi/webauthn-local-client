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
import { register, auth } from "/path/to/webauthn-local-client/index.js"
```

**Note:** This library exposes its API in modern ESM format, but it relies on dependencies that are non-ESM (UMD), which automatically add themselves to the global namespace; it cannot use `import` to load its own dependencies. Instead, the included `external.js` module manages loading the dependencies via `<script>` element injection into the page. If your development/deployment processes include bundling (webpack, rollup, etc), please configure your tool(s) to skip bundling this library and its dependencies, and just copy them over as indicated above. Alternately, before/during build, you'll need to make sure the `import "./external.js"` line at the top of `index.js` is removed/commented out, to ensure that module is skipped in the bundle.

### Loading via Import Map

If your app uses an [Import Map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap), you can and an entry for this library:

```html
<script type="importmap">
{
    "imports": {
        "webauthn-local-client": "/path/to/webauthn-local-client/index.js"
    }
}
</script>
```

Then you can `import` it in a more friendly/readable way:

```js
import { register, auth } from "webauthn-local-client"
```

### Registering a new credential

To register a new credential in a `WebAuthn`-exposed authenticator, use `register()`:

```js
import { register, regDefaults } from "..";

// optional:
var regOptions = regDefaults({
    // ..options..
});

var regResult = await register(regOptions);
```

#### Configuration

To configure the registration options, but include all the defaults for anything not being overridden, use `regDefaults(..)`.

Typical `register()` configuration options:

* `user` (object): specifies the user's identity (as it's defined in your application), including up to these 3 sub properties:

    - `name` (string): the user's name
    - `displayName` (string): a displayable version of the user's name (typically the same as `name`)
    - `id` (Uint8Array): any application-defined value (string, integer, etc), but must represented in as a `Uint8Array` byte array

* `relyingPartyName` (string): the common name of your application (that a user will recognize).

    **Note:** `relyingPartyID` (string) is also available, defaulting to the *origin hostname* of your web application (e.g., `hostname.tld`); unless you have an specific reason, you should generally leave it as default.

* `signal` (AbortSignal): an [`AbortController.signal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal) instance to cancel the registration request

See `regDefaults()` function signature for more options.

#### Result

If `register()` completes without an exception, then registration is successful, and the `regResult` object (as above) will include both a `request` and `response` property:

* The `request` property includes all relevant configurations that were applied to the registration request, and is provided mostly for debugging purposes.

* The `response` property will include the data needed to use (and subsequently identify) the newly registered credential.

    The most important parts are `credentialID` (base64 padded encoding string) and `publicKey`, with various pieces of information about the keypair ([COSE ID](https://www.iana.org/assignments/cose/cose.xhtml#algorithms) for the algorithm, the OID of the algorithm in hex-string format, and the `spki` and `raw` representations of the public-key) generated for the credential; this info is used for verifying the signature on subsequent `auth()` requests.

    **Note:** This library by default does not ask for any attestation information -- for verifying the authenticity of the device's authenticator, via certificate chains -- nor does it perform any such verification. Such verification is quite a complex process, best suited for a [FIDO2 Server](https://fidoalliance.org/fido2/), so it's out of scope for this library's intended local-in-browser-only operation. You can however override the configuration to `register(..)` to ask for attestation information, and pass that along (from `response.raw`) to a separate verification process (on server, or in browser) as desired. Typically, though, web applications *assume* that if a device is compromised in such a way that it's able to bypass/MITM a device authenticator, the app is *not* the appropriate or responsible party to detect or alert an end-user to such.

### Authenticating with an existing credential

To authenticate with an existing credential via a `WebAuthn`-exposed authenticator, use `auth()`:

```js
import { auth, authDefaults } from "..";

// optional:
var authOptions = authDefaults({
    // ..options..
});

var authResult = await auth(authOptions);
```

#### Configuration

To configure the authentication options, but include all the defaults for anything not being overridden, use `authDefaults(..)`.

Typical `auth()` configuration options:

* `mediation` (string): Defaults to `"optional"`, but can also be set to `"conditional"` to trigger [passkey autofill (aka "Conditional Mediation")](https://web.dev/articles/passkey-form-autofill), if the browser/device supports it.

    **Note:** If conditional-mediation is supported and `mediation: "conditional"` is specified, the promise result of `auth()` will remain pending until the user clicks into a suitable `<input autocomplete="username webauthn">` element in the page, and then selects their credential from the autofill prompt. Make sure you provide the user such a form element and suitable UX/flow to explain to them what to do. Also, such a request should likely be specified as cancelable (via `signal`) in case the user does not want to use autofill.

* `challenge` (Uint8Array): Defaults to 20 bytes of generated randomness, but can be provided manually if you have another source of suitable information to use for a challenge. The returned result will include a signature (`response.signature`) that was generated against this challenge (along with other request info), helping to strengthen the security of the system.

* `signal` (AbortSignal): an [`AbortController.signal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal) instance to cancel the authentication request

See `authDefaults()` function signature for more options.

#### Result

If `auth()` completes without an exception, then authentication is successful, and the `authResult` object (as above) will include both a `request` and `response` property:

* The `request` property includes all relevant configurations that were applied to the authentication request, and is provided mostly for debugging purposes.

* The `response` property will include the data needed to use (and subsequently identify) the newly registered credential.

    The most important parts are the `userID` (as passed in the `user.id` configuration to the originating `register()` call), as well as `signature`, which is used (via `verifyAuthResponse(..)`) to verify the signature matches the challenge (and other request info).

### Verifying an authentication response

To verify an authentication response (from `auth()`), use `verifyAuthResponse()`:

```js
import { verifyAuthResponse, } from "..";

var publicKey = ... // aka, regResult.response.publicKey

var verified = await verifyAuthResponse(
    authResult.response,
    publicKey
);
```

**Note:** You will likely store the contents of `regResult.response.publicKey` (such as in `LocalStorage`), and later restore that to pass in on subsequent authentication attempts; registration and authentication will not typically happen in the same page instance (where `regResult` would still be present).

If `verifyAuthResponse()` completes without an exception and returns `true`, verification was successful. Otherwise, `false` indicates everything was well-formed, but the signature verification failed for some other reason. An exception indicates something was malformed/unexpected.

## Re-building `dist/*`

If you need to rebuild the `dist/*` files for any reason, run:

```cmd
# only the first time
npm install

npm run build:all
```

## Test

Since the library involves non-automatable behaviors (requiring user intervention in browser), an automated unit-test suite is not included. Instead, a simple interactive browser test page is provided.

To start a simple static server (no server-side logic) to run this test, run:

```cmd
npm run test:start
```

Then open `http://localhost:8080/test.html` in a browser. Follow instructions in-page from there to perform interactive tests.

**Note:** You will either need a device with a built-in authenticator (i.e., Touch-ID, FaceID, etc), or you can [use Chrome DevTools to setup a virtual authenticator](https://developer.chrome.com/docs/devtools/webauthn). For the virtual authenticator approach, it's recommended you use "ctap2", "internal", "resident keys", "large blob", and "user verification" for the settings. Also, since the test does a new `register()` call each time, you'll likely want to reset the authenticator by removing and re-adding it, before each page reload; otherwise, you'll end up with lots of extraneous credentials while testing.

## License

[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

All code and documentation are (c) 2024 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
