# WebAuthn Local Client

[![npm Module](https://badge.fury.io/js/@lo-fi%2Fwebauthn-local-client.svg)](https://www.npmjs.org/package/@lo-fi/webauthn-local-client)
[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

**WebAuthn-Local-Client** is a web (browser) client for locally managing the ["Web Authentication" (`WebAuthn`) API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API).

----

[Demo/Tests](https://mylofi.github.io/webauthn-local-client/)

----

The `WebAuthn` API lets users of web applications avoid the long-troubled use of (often insecure) passwords, and instead present personal biometric factors (Touch-ID, Face-ID, etc) via their device to prove their identity for login/authentication, authorization, etc. Traditionally, this authentication process involves an application interacting with a [FIDO2 Server](https://fidoalliance.org/fido2/) to initiate, verify, and store responses to such `WebAuthn` API interactions.

However, the intended use-case for **WebAuthn-Local-Client** is to allow [Local-First Web](https://localfirstweb.dev/) applications to handle user login locally on a device, without any server (FIDO2 or otherwise).

**Note:** This package *may* be used in combination with a traditional FIDO2 server application architecture, but does not include any specific functionality for that purpose. For server integration with `WebAuthn`, you may instead consider alternative libraries, like [this one](https://github.com/passwordless-id/webauthn) or [this one](https://github.com/raohwork/webauthn-client).

## Demo App

A demo app (using this library) that showcases usage of WebAuthn and also cryptography to locally encrypt/decrypt user data can be found [here](https://vella.ai/auth/).

https://github.com/tonydangblog/webauthn-local-client/assets/63323230/9642ccd8-8be6-4987-81e1-d327dde03712

## Deployment / Import

```cmd
npm install @lo-fi/webauthn-local-client
```

The [**@lo-fi/webauthn-local-client** npm package](https://npmjs.com/package/@lo-fi/webauthn-local-client) includes a `dist/` directory with all files you need to deploy **WebAuthn-Local-Client** (and its dependencies) into your application/project.

**Note:** If you obtain this library via git instead of npm, you'll need to [build `dist/` manually](#re-building-dist) before deployment.

* **USING A WEB BUNDLER?** (Vite, Webpack, etc) Use the `dist/bundlers/*` files and see [Bundler Deployment](BUNDLERS.md) for instructions.

* Otherwise, use the `dist/auto/*` files and see [Non-Bundler Deployment](NON-BUNDLERS.md) for instructions.

## `WebAuthn` Supported?

To check if `WebAuthn` API and functionality is supported on the device:

```js
import { supportsWebAuthn } from "...";

if (supportsWebAuthn) {
    // welcome to the future, without passwords!
}
else {
    // sigh, use fallback authentication, like
    // icky passwords :(
}
```

To check if [passkey autofill (aka "Conditional Mediation")](https://web.dev/articles/passkey-form-autofill) is supported on the device:

```js
import { supportsConditionalMediation } from "...";

if (supportsConditionalMediation) {
    // provide an <input> and UX for user to
    // click on, to select their passkey
    // credential via autofill
}
else {
    // provide UX for user to trigger
    // authentication, where the browser will
    // provide a modal for the user to select
    // their credential
}
```

### Registering a new credential

To register a new credential in a `WebAuthn`-exposed authenticator, use `register()`:

```js
import { register, regDefaults } from "...";

// optional:
var regOptions = regDefaults({
    // ..options..
});

var regResult = await register(regOptions);
```

#### Configuration

To configure the registration options, but include all the defaults for anything not being overridden, use `regDefaults(..)`.

Typical `register()` configuration options:

* `relyingPartyName` (string): the common name of your application (that a user will recognize), e.g. "Cool Notes App".

    **Note:** `relyingPartyID` (string) is also available, defaulting to the *origin hostname* of your web application (e.g., `hostname.tld`); unless you have an specific reason, you should generally leave that as default.

* `user` (object): specifies the user's identity (as it's defined in your application), including up to these 3 sub properties:

    - `name` (string): the user's name

    - `displayName` (string): a displayable version of the user's name (typically the same as `name`, but can be a shorter abbreviation/nickname if `name` is too long)

    - `id` (Uint8Array): any application-defined value (string, integer, etc), but must be represented as a `Uint8Array` byte array.

        **Note:** This value can be anything your application needs for its normal operation, but it can never be updated for a specific credential after registration; the user will have to `register()` a new credential if your application ever needs to *change* this value. Also, be careful not to use a value with too many bytes, or some authenticators may reject it. Generally, 30-40 bytes is *safe* (and more than sufficient for most common use-cases), but you likely will not be able to use hundreds or thousands of bytes for this value. This is *not* a secret user-data storage location!

* `excludeCredentials` (array): Defaults to an empty array, which allows subsequent `register()` calls on the same authenticator, with the same `user.id` value, to *overwrite* a credential (regenerate its internal keypair).

    This is generally only useful in cases where a credential keypair needs to be reset (such as losing the originally returned public-key). As such, `excludeCredentials` should only be left to its default empty array if there are no known credentials for the user, or the UX has clearly indicated to the user that a *reset* is being performed.

    If you pass a non-empty array (object values, e.g. `{ type: "public-key", id: ... }`, where `id` is the *credential ID*), and the `user.id` passed in matches the internally stored `userID` (aka `userHandle`) of any of those credentials, the `register()` call will throw an exception (asynchronously in the promise).

* `signal` (AbortSignal): an [`AbortController.signal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal) instance to cancel the registration request

See `regDefaults()` function signature for more options.

#### Result

`register()` returns a promise that's fulfilled (success or rejection) once the user completes or cancels a credential (aka "passkey") registration with their device's authenticator.

If `register()` completes successfully, the return value (`regResult` above) will include both a `request` and `response` property:

* The `request` property includes all relevant configurations that were applied to the registration request, and is provided mostly for debugging purposes.

* The `response` property will include the data needed to use (and subsequently identify) the newly registered credential.

    The most important parts are `credentialID` (base64 padded encoding string) and `publicKey`, with various pieces of information about the keypair ([COSE ID](https://www.iana.org/assignments/cose/cose.xhtml#algorithms) for the algorithm, the OID of the algorithm in hex-string format, and the `spki` and `raw` representations of the public-key) generated for the credential; this info is used for verifying the signature on subsequent `auth()` requests.

    The `publicKey` object includes byte-arrays ([`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array)), which are *not* as conveniently serialized to/from JSON. Two helper methods are provided to make this easy: `packPublicKeyJSON()` (to store/transmit in base64 string form) and `unpackPublicKeyJSON()` (to restore from base64 string form).

#### Attestation

This library by default does **NOT** ask for any [attestation information](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/Attestation_and_Assertion#attestation) (i.e., `attestation: "none"` in `regDefaults()`) from a device authenticator -- for verifying the authenticity of its response via certificate chains -- nor does it perform any such verification on the registration result. Such verification is quite a complex process, best suited for a [FIDO2 Server](https://fidoalliance.org/fido2/), so it's out of scope for this library's intended local-in-browser-only operation.

You can however override the configuration (via `attestation: ".."`) for `register(..)` to ask for attestation information, and pass that along (from `response.raw`) to a separate verification process (on server, or in browser) as desired.

Typically, though, [web applications *assume*](https://medium.com/webauthnworks/webauthn-fido2-demystifying-attestation-and-mds-efc3b3cb3651) that if a device is compromised in such a way that it's able to bypass/MITM a device authenticator, the app is *not* the appropriate or responsible party to detect or alert an end-user to such. Most applications skip verifying attestation certificate chains, unless there's very specific, elevated-risk security reasons they must do so.

### Authenticating with an existing credential

To authenticate (i.e., [perform an assertion](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/Attestation_and_Assertion#assertion)) with an existing credential via a `WebAuthn`-exposed authenticator, use `auth()`:

```js
import { auth, authDefaults } from "...";

// optional:
var authOptions = authDefaults({
    // ..options..
});

var authResult = await auth(authOptions);
```

#### Configuration

To configure the authentication options, but include all the defaults for anything not being overridden, use `authDefaults(..)`.

Typical `auth()` configuration options:

* `allowCredentials` (array): Defaults to an empty array, which allows the user to select any [available discoverable credential](https://web.dev/articles/webauthn-discoverable-credentials) (aka, "resident key").

    **Note:** If you use the "discoverable credential" approach, and don't preserve the `credentialID` and `publicKey` from an initial `register()` call, you won't be able to verify any authorization responses (`verifyAuthResponse()`), since that requires the public key (only returned from `register()`).

    If you pass a non-empty array (object values, e.g. `{ type: "public-key", id: ... }` where `id` is the *credential ID*), the browser will present a narrowed list of credentials for the user to select from.

* `mediation` (string): Defaults to `"optional"`, but can also be set to `"conditional"` to trigger [passkey autofill (aka "Conditional Mediation")](https://web.dev/articles/passkey-form-autofill), if the browser/device supports it (see `supportsConditionalMediation`).

    **Note:** If conditional-mediation is supported and `mediation: "conditional"` is specified, the promise result of `auth()` will remain pending until the user clicks into a suitable `<input autocomplete="username webauthn">` element in the page, and then selects their credential from the autofill prompt. Make sure you provide the user such a form element and suitable UX/flow to explain to them what to do. Also, such a request should likely be specified as cancelable (via `signal`) in case the user does not want to use autofill.

* `challenge` (Uint8Array): Defaults to 20 bytes of generated randomness, but can be provided manually if you have another source of suitable information to use for a challenge. The returned result will include a signature (`response.signature`) that was generated against this challenge (along with other request info), helping to strengthen the security of the system (i.e., preventing "replay attacks").

* `signal` (AbortSignal): an [`AbortController.signal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal) instance to cancel the authentication request.

    For certain UX flows, such as switching from the conditional-mediation to another authentication approach, you will need to cancel (via `signal`) a previous call to `auth()` before invoking an `auth()` call with different options. But calling `abort()` causes that pending `auth()` to throw an exception. To suppress this exception when resetting, pass the `resetAbortReason` value:

    ```js
    import { resetAbortReason, authDefaults, auth } from "...";

    var cancelToken = new AbortController();
    var authResult = await auth({ /* .. */ , signal: cancelToken.signal });

    // elsewhere:
    cancelToken.abort(resetAbortReason);

    cancelToken = new AbortController();
    var newAuthResult = await auth({ /* .. */ , signal: cancelToken.signal });

    // ..
    ```

See `authDefaults()` function signature for more options.

#### Result

`auth()` returns a promise that's fulfilled (success or rejection) once the user completes or cancels a credential (aka "passkey") authentication with their device's authenticator.

If `auth()` completes completes successfully, the return value (`authResult` above) will include both a `request` and `response` property:

* The `request` property includes all relevant configurations that were applied to the authentication request, and is provided mostly for debugging purposes.

* The `response` property will include information about the credential used, as well as a signature to verify the authentication response.

    The most important parts of `response` are:

    - `credentialID`: will match the `credentialID` from the originating `register()` call

    - `userID`: will match the `user.id` configuration from the originating `register()` call

        **Note:** For security reasons, authenticators only return this value when the type of authentication performed was interactive (user was present and affirmatively presented their passkey). The default `userVerification` configuration value (in `authDefaults()`) is `"required"`, which ensures the authentication will satisfy that requirement and thus return `userID`. Moreover, two additional `response` properties (`userPresence`, `userVerification`) will be `true` if those conditions were indeed met.

    - `signature`: used via `verifyAuthResponse(..)` -- along with the public key from the original `register()` call for that credential -- to verify the signature against the `request.challenge` (and other request settings/info).

### Verifying an authentication response

To verify an authentication response (from `auth()`), use `verifyAuthResponse()`:

```js
import { verifyAuthResponse, } from "...";

var publicKey = ... // aka, regResult.response.publicKey

var verified = await verifyAuthResponse(
    authResult.response,
    publicKey
);
```

**Note:** You will likely have preserved the `regResult.response.credentialID` and `regResult.response.publicKey` from the original `register()` call for a credential -- either locally in e.g. `LocalStorage` or remotely on a server -- and later restore that to pass in on subsequent authentication attempts; registration and authentication will not typically happen in the same page instance (where `regResult` would still be present).

If you used `packPublicKeyJSON()` on the original `publicKey` value to store/transmit it, you'll need to use `unpackPublicKeyJSON()` before passing it to `verifyAuthResponse()`:

```js
import { verifyAuthResponse, unpackPublicKeyJSON } from "...";

var packedPublicKey = ... // result from previous packPublicKeyJSON()

var verified = await verifyAuthResponse(
    authResult.response,
    unpackPublicKeyJSON(packedPublicKey)
);
```

If `verifyAuthResponse()` completes without an exception and returns `true`, verification was successful. Otherwise, `false` indicates everything was well-formed, but the signature verification failed for some other reason. An exception indicates something was malformed/unexpected.

## Re-building `dist/*`

If you need to rebuild the `dist/*` files for any reason, run:

```cmd
# only needed one time
npm install

npm run build:all
```

## Tests

Since the library involves non-automatable behaviors (requiring user intervention in browser), an automated unit-test suite is not included. Instead, a simple interactive browser test page is provided.

Visit [`https://mylofi.github.io/webauthn-local-client/`](https://mylofi.github.io/webauthn-local-client/), and follow instructions in-page from there to perform the interactive tests.

**Note:** You will either need a device with a built-in authenticator (i.e., Touch-ID, Face-ID, etc), or you can [use Chrome DevTools to setup a virtual authenticator](https://developer.chrome.com/docs/devtools/webauthn), or similar in Safari, or [this Firefox add-on](https://addons.mozilla.org/en-US/firefox/addon/webdevauthn/). For the virtual authenticator approach, it's recommended you use "ctap2", "internal", "resident keys", "large blob", and "user verification" for the settings. Also, since the tests do not save any generated credentials, you'll likely want to reset the authenticator by removing and re-adding it, before each page load; otherwise, you'll end up with lots of extraneous credentials while testing.

### Run Locally

To locally run the tests, start the simple static server (no server-side logic):

```cmd
# only needed one time
npm install

npm run test:start
```

Then visit `http://localhost:8080/` in a browser.

## License

[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

All code and documentation are (c) 2024 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
