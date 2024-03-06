# WebAuthn Local Client

[![npm Module](https://badge.fury.io/mylofi/webauthn-local-client.svg)](https://www.npmjs.org/package/webauthn-local-client)
[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

**WebAuthn-Local-Client** is a web (browser) client for locally managing the ["Web Authentication" (`WebAuthn`) API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API).

The `WebAuthn` API lets users of web applications avoid the long-troubled use of (often insecure) passwords, and instead present personal biometric factors (touch-ID, FaceID, etc) via their device to prove their identity for login/authentication, authorization, etc. Traditionally, this authentication process involves an application interacting with a [FIDO2 Server](https://fidoalliance.org/fido2/) to initiate, verify, and store responses to such `WebAuthn` API interactions.

However, the intended use-case for **WebAuthn-Local-Client** is to allow [Local-First Web](https://localfirstweb.dev/) applications to handle user login locally on a device, without any server (FIDO2 or otherwise).

**Note:** This package *may* be used in combination with a traditional FIDO2 server application architecture, but does not include any specific functionality for that purpose.

## License

[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

All code and documentation are (c) 2024 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
