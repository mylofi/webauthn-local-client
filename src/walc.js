// dynamically load external dependencies (non-bundlers only)
// NOTE: this `import` is removed from "bundlers/walc.mjs",
//       which is used with bundlers
import { sodium, CBOR, ASN1, } from "./external.js";


// ********************************

// NOTE: these are ordered by "preference" for key
// generation by WebAuthn create()
const publicKeyAlgorithms = [
	// Ed25519 / EdDSA
	// https://oid-rep.orange-labs.fr/get/1.3.101.112
	{
		name: "Ed25519",
		COSEID: -8,
		// note: Ed25519 is in draft, but not yet supported
		// by subtle-crypto
		//    https://wicg.github.io/webcrypto-secure-curves/
		//    https://www.rfc-editor.org/rfc/rfc8410
		//    https://caniuse.com/mdn-api_subtlecrypto_importkey_ed25519
		cipherOpts: {
			name: "Ed25519",
			hash: { name: "SHA-512", },
		},
	},

	// ES256 / ECDSA (P-256)
	// https://oid-rep.orange-labs.fr/get/1.2.840.10045.2.1
	{
		name: "ES256",
		COSEID: -7,
		cipherOpts: {
			name: "ECDSA",
			namedCurve: "P-256",
			hash: { name: "SHA-256", },
		},
	},

	// RSASSA-PSS
	// https://oid-rep.orange-labs.fr/get/1.2.840.113549.1.1.10
	{
		name: "RSASSA-PSS",
		COSEID: -37,
		cipherOpts: {
			name: "RSA-PSS",
			hash: { name: "SHA-256", },
		},
	},

	// RS256 / RSASSA-PKCS1-v1_5
	// https://oid-rep.orange-labs.fr/get/1.2.840.113549.1.1.1
	{
		name: "RS256",
		COSEID: -257,
		cipherOpts: {
			name: "RSASSA-PKCS1-v1_5",
			hash: { name: "SHA-256", },
		},
	},
];
const publicKeyAlgorithmsLookup = Object.fromEntries(
	publicKeyAlgorithms.flatMap(entry => [
		// by name
		[ entry.name, entry, ],

		// by COSEID
		[ entry.COSEID, entry, ],
	])
);
const credentialTypeKey = Symbol("credential-type");
const resetAbortReason = Symbol("reset-abort");
const supportsWebAuthn = (
	typeof navigator != "undefined" &&
	typeof navigator.credentials != "undefined" &&
	typeof navigator.credentials.create != "undefined" &&
	typeof navigator.credentials.get != "undefined" &&
	typeof PublicKeyCredential != "undefined" &&
	typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable != "undefined" &&

	// NOTE: top-level await (requires ES2022+)
	(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
);

// Re: https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/isConditionalMediationAvailable
// Also: https://web.dev/articles/passkey-form-autofill
const supportsConditionalMediation = (
	supportsWebAuthn &&
	typeof PublicKeyCredential.isConditionalMediationAvailable != "undefined" &&

	// NOTE: top-level await (requires ES2022+)
	(await PublicKeyCredential.isConditionalMediationAvailable())
);


// ********************************

export {
	// feature support tests
	supportsWebAuthn,
	supportsConditionalMediation,

	// main API
	regDefaults,
	register,
	authDefaults,
	auth,
	verifyAuthResponse,

	// helper utils
	packPublicKeyJSON,
	unpackPublicKeyJSON,
	toBase64String,
	fromBase64String,
	toUTF8String,
	fromUTF8String,
	resetAbortReason,
};
var publicAPI = {
	// feature support tests
	supportsWebAuthn,
	supportsConditionalMediation,

	// main API
	regDefaults,
	register,
	authDefaults,
	auth,
	verifyAuthResponse,

	// helper utils
	packPublicKeyJSON,
	unpackPublicKeyJSON,
	toBase64String,
	fromBase64String,
	toUTF8String,
	fromUTF8String,
	resetAbortReason,
};
export default publicAPI;


// ********************************

async function register(regOptions = regDefaults()) {
	try {
		if (supportsWebAuthn) {
			// ensure credential IDs are binary (not base64 string)
			regOptions[regOptions[credentialTypeKey]].excludeCredentials = (
				normalizeCredentialsList(
					regOptions[regOptions[credentialTypeKey]].excludeCredentials
				)
			);

			let regResult = await navigator.credentials.create(regOptions);

			let regClientDataRaw = new Uint8Array(regResult.response.clientDataJSON);
			let regClientData = JSON.parse(toUTF8String(regClientDataRaw));
			if (regClientData.type != "webauthn.create") {
				throw new Error("Invalid registration response");
			}
			let expectedChallenge = sodium.to_base64(
				regOptions[regOptions[credentialTypeKey]].challenge,
				sodium.base64_variants.URLSAFE_NO_PADDING
			);
			if (regClientData.challenge != expectedChallenge) {
				throw new Error("Challenge not accepted");
			}

			let publicKeyAlgoCOSE = regResult.response.getPublicKeyAlgorithm();
			let publicKeySPKI = new Uint8Array(regResult.response.getPublicKey());
			let {
				algo: publicKeyAlgoOID,
				raw: publicKeyRaw,
			} = parsePublicKeySPKI(publicKeySPKI);

			let regAuthDataRaw = (
				typeof regResult.response.getAuthenticatorData != "undefined" ?
					(new Uint8Array(regResult.response.getAuthenticatorData())) :

					CBOR.decode(regResult.response.attestationObject).authData
			);
			let regAuthData = parseAuthenticatorData(regAuthDataRaw);
			if (!checkRPID(regAuthData.rpIdHash,regOptions.relyingPartyID)) {
				throw new Error("Unexpected relying-party ID");
			}
			// sign-count not supported by this authenticator?
			if (regAuthData.signCount == 0) {
				delete regAuthData.signCount;
			}

			return {
				request: {
					credentialType: regResult.type,
					...regOptions[regOptions[credentialTypeKey]],

					challenge: toBase64String(
						regOptions[regOptions[credentialTypeKey]].challenge
					),
					...(Object.fromEntries(
						Object.entries(regClientData).filter(([ key, val ]) => (
							[ "origin", "crossOrigin", ].includes(key)
						))
					)),
				},
				response: {
					credentialID: toBase64String(new Uint8Array(regResult.rawId)),
					credentialType: regResult.type,
					authenticatorAttachment: regResult.authenticatorAttachment,
					publicKey: {
						algoCOSE: publicKeyAlgoCOSE,
						algoOID: publicKeyAlgoOID,
						spki: publicKeySPKI,
						raw: publicKeyRaw,
					},
					...(Object.fromEntries(
						Object.entries(regAuthData).filter(([ key, val ]) => (
							[ "flags", "signCount", "userPresence", "userVerification", ].includes(key)
						))
					)),
					raw: regResult.response,
				},
			};
		}
		throw new Error("WebAuthentication not supported on this device");
	}
	catch (err) {
		if (err != resetAbortReason) {
			throw new Error("Credential registration failed",{ cause: err, });
		}
	}
}

function regDefaults({
	credentialType = "publicKey",
	authenticatorSelection: {
		authenticatorAttachment = "platform",
		userVerification = "required",
		residentKey = "required",
		requireResidentKey = true,

		...otherAuthenticatorSelctionProps
	} = {},
	relyingPartyID = document.location.hostname,
	relyingPartyName = "wacg",
	attestation = "none",
	challenge = sodium.randombytes_buf(20),
	excludeCredentials = [
		// { type: "public-key", id: ..., }
	],
	user: {
		name: userName = "wacg-user",
		displayName: userDisplayName = userName,
		id: userID = sodium.randombytes_buf(5),
	} = {},
	publicKeyCredentialParams = (
		publicKeyAlgorithms.map(entry => ({
			type: "public-key",
			alg: entry.COSEID,
		}))
	),
	signal: cancelRegistrationSignal,
	...otherPubKeyOptions
} = {}) {
	var defaults = {
		[credentialType]: {
			authenticatorSelection: {
				authenticatorAttachment,
				userVerification,
				residentKey,
				requireResidentKey,
				...otherAuthenticatorSelctionProps
			},

			attestation,

			rp: {
				id: relyingPartyID,
				name: relyingPartyName,
			},

			user: {
				name: userName,
				displayName: userDisplayName,
				id: userID,
			},

			challenge,

			excludeCredentials,

			pubKeyCredParams: publicKeyCredentialParams,

			...otherPubKeyOptions,
		},

		...(cancelRegistrationSignal != null ? { signal: cancelRegistrationSignal, } : null),
	};
	// internal meta-data only
	Object.defineProperty(
		defaults,
		credentialTypeKey,
		{
			enumerable: false,
			writable: false,
			configurable: false,
			value: credentialType,
		}
	);
	return defaults;
}

async function auth(authOptions = authDefaults()) {
	try {
		if (supportsWebAuthn) {
			// ensure credential IDs are binary (not base64 string)
			authOptions[authOptions[credentialTypeKey]].allowCredentials = (
				normalizeCredentialsList(
					authOptions[authOptions[credentialTypeKey]].allowCredentials
				)
			);

			let authResult = await navigator.credentials.get(authOptions);
			let authClientDataRaw = new Uint8Array(authResult.response.clientDataJSON);
			let authClientData = JSON.parse(toUTF8String(authClientDataRaw));
			if (authClientData.type != "webauthn.get") {
				throw new Error("Invalid auth response");
			}
			let expectedChallenge = sodium.to_base64(
				authOptions[authOptions[credentialTypeKey]].challenge,
				sodium.base64_variants.URLSAFE_NO_PADDING
			);
			if (authClientData.challenge != expectedChallenge) {
				throw new Error("Challenge not accepted");
			}
			let authDataRaw = new Uint8Array(authResult.response.authenticatorData);
			let authData = parseAuthenticatorData(authDataRaw);
			if (!checkRPID(authData.rpIdHash,authOptions.relyingPartyID)) {
				throw new Error("Unexpected relying-party ID");
			}
			// sign-count not supported by this authenticator?
			if (authData.signCount == 0) {
				delete authData.signCount;
			}
			let signatureRaw = new Uint8Array(authResult.response.signature);
			return {
				request: {
					credentialType: authResult.type,
					mediation: authOptions.mediation,
					...authOptions[authOptions[credentialTypeKey]],
					...(Object.fromEntries(
						Object.entries(authClientData).filter(([ key, val ]) => (
							[ "origin", "crossOrigin", ].includes(key)
						))
					)),
				},
				response: {
					credentialID: toBase64String(new Uint8Array(authResult.rawId)),
					signature: signatureRaw,
					...(Object.fromEntries(
						Object.entries(authData).filter(([ key, val ]) => (
							[ "flags", "signCount", "userPresence", "userVerification", ].includes(key)
						))
					)),
					...(
						authResult.response.userHandle != null ?
							{ userID: new Uint8Array(authResult.response.userHandle), } :

							null
					),
					raw: authResult.response,
				},
			};
		}
		throw new Error("WebAuthentication not supported on this device");
	}
	catch (err) {
		if (err != resetAbortReason) {
			throw new Error("Credential auth failed",{ cause: err, });
		}
	}
}

function authDefaults({
	credentialType = "publicKey",
	relyingPartyID = document.location.hostname,
	userVerification = "required",
	challenge = sodium.randombytes_buf(20),
	allowCredentials = [
		// { type: "public-key", id: ..., }
	],
	mediation = "optional",
	signal: cancelAuthSignal,
	...otherOptions
} = {}) {
	var defaults = {
		[credentialType]: {
			rpId: relyingPartyID,
			userVerification,
			challenge,
			allowCredentials,
		},
		mediation,
		...(cancelAuthSignal != null ? { signal: cancelAuthSignal, } : null),
		...otherOptions
	};
	// internal meta-data only
	Object.defineProperty(
		defaults,
		credentialTypeKey,
		{
			enumerable: false,
			writable: false,
			configurable: false,
			value: credentialType,
		}
	);
	return defaults;
}

async function verifyAuthResponse(
	/*response=*/{
		signature,
		raw: {
			clientDataJSON: clientDataRaw,
			authenticatorData: authDataRaw,
		},
	} = {},
	/*publicKey*/{
		algoCOSE: publicKeyAlgoCOSE,
		spki: publicKeySPKI,
		raw: publicKeyRaw,
	} = {}
) {
	try {
		// all necessary inputs?
		if (
			signature && clientDataRaw && authDataRaw && publicKeySPKI && publicKeyRaw &&
			Number.isInteger(publicKeyAlgoCOSE)
		) {
			let verificationSig = parseSignature(publicKeyAlgoCOSE,signature);
			let verificationData = await computeVerificationData(authDataRaw,clientDataRaw);
			let status = await (
				// Ed25519?
				isPublicKeyAlgorithm("Ed25519",publicKeyAlgoCOSE) ?
					// verification needs sodium (not subtle-crypto)
					verifySignatureSodium(
						publicKeyRaw,
						publicKeyAlgoCOSE,
						verificationSig,
						verificationData
					) :

				(
					// ECDSA (P-256)?
					isPublicKeyAlgorithm("ES256",publicKeyAlgoCOSE) ||

					// RSASSA-PKCS1-v1_5?
					isPublicKeyAlgorithm("RS256",publicKeyAlgoCOSE) ||

					// RSASSA-PSS
					isPublicKeyAlgorithm("RSASSA-PSS",publicKeyAlgoCOSE)
				) ?
					// verification supported by subtle-crypto
					verifySignatureSubtle(
						publicKeySPKI,
						publicKeyAlgoCOSE,
						verificationSig,
						verificationData
					) :

					null
			);
			if (status == null) {
				throw new Error("Unrecognized signature, failed validation");
			}
			return status;
		}
		else {
			throw new Error("Auth verification missing required inputs");
		}
	}
	catch (err) {
		throw new Error("Auth verification failed",{ cause: err, });
	}
}

async function verifySignatureSubtle(publicKeySPKI,algoCOSE,signature,data) {
	if (
		isPublicKeyAlgorithm("ES256",algoCOSE) ||
		isPublicKeyAlgorithm("RSASSA-PSS",algoCOSE) ||
		isPublicKeyAlgorithm("RS256",algoCOSE)
	) {
		try {
			let pubKeySubtle = await crypto.subtle.importKey(
				"spki", // Simple Public Key Infrastructure rfc2692
				publicKeySPKI,
				publicKeyAlgorithmsLookup[algoCOSE].cipherOpts,
				false, // extractable
				[ "verify", ]
			);

			return await crypto.subtle.verify(
				publicKeyAlgorithmsLookup[algoCOSE].cipherOpts,
				pubKeySubtle,
				signature,
				data
			);
		}
		catch (err) {
			console.log(err);
			return false;
		}
	}
	throw new Error("Unrecognized signature for subtle-crypto verification");
}

function verifySignatureSodium(publicKeyRaw,algoCOSE,signature,data) {
	if (isPublicKeyAlgorithm("Ed25519",algoCOSE)) {
		try {
			return sodium.crypto_sign_verify_detached(signature,data,publicKeyRaw);
		}
		catch (err) {
			console.log(err);
			return false;
		}
	}
	throw new Error("Unrecognized signature for sodium verification");
}

// Adapted from: https://www.npmjs.com/package/@yoursunny/webcrypto-ed25519
function parsePublicKeySPKI(publicKeySPKI) {
	var der = ASN1.parseVerbose(new Uint8Array(publicKeySPKI));
	return {
		algo: sodium.to_hex(findValue(der.children[0])),
		raw: findValue(der.children[1]),
	};

	// **********************

	function findValue(node) {
		if (node.value && node.value instanceof Uint8Array) {
			return node.value;
		}
		else if (node.children) {
			for (let child of node.children) {
				let res = findValue(child);
				if (res != null) {
					return res;
				}
			}
		}
		return null;
	}
}

function parseAuthenticatorData(authData) {
	// https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/Authenticator_data
	//	 32 bytes: rpIdHash
	//	 1 byte: flags
	//		  Bit 0, User Presence (UP)
	//		  Bit 2, User Verification (UV)
	//		  Bit 3, Backup Eligibility (BE)
	//		  Bit 4, Backup State (BS)
	//		  Bit 6, Attested Credential Data (AT)
	//		  Bit 7, Extension Data (ED)
	//	 4 bytes: signCount (0 means disabled)

	return {
		rpIdHash: authData.slice(0,32),
		flags: authData[32],
		userPresence: ((authData[32] & 1) == 1),
		userVerification: ((authData[32] & 4) == 4),
		signCount: byteArrayTo32Int(authData.slice(33,37)),
	};
}

async function computeVerificationData(authDataRaw,clientDataRaw) {
	var clientDataHash = await computeSHA256Hash(clientDataRaw);
	var data = new Uint8Array(
		authDataRaw.byteLength +
		clientDataHash.byteLength
	);
	data.set(new Uint8Array(authDataRaw),0);
	data.set(clientDataHash,authDataRaw.byteLength);
	return data;
}

async function checkRPID(rpIDHash,origRPID) {
	var originHash = await computeSHA256Hash(
		fromUTF8String(origRPID)
	);
	return (
		rpIDHash.length > 0 &&
		rpIDHash.byteLength == originHash.byteLength &&
		rpIDHash.toString() == originHash.toString()
	);
}

function parseSignature(algoCOSE,signature) {
	if (isPublicKeyAlgorithm("ES256",algoCOSE)) {
		// this algorithm's signature comes back ASN.1 encoded, per spec:
		//   https://www.w3.org/TR/webauthn-2/#sctn-signature-attestation-types
		let der = ASN1.parseVerbose(signature);
		return new Uint8Array([ ...der.children[0].value, ...der.children[1].value, ]);
	}
	// also per spec, other signature algorithms SHOULD NOT come back
	// in ASN.1, so for those, we just pass through without any parsing
	return signature;
}

function byteArrayTo32Int(byteArray) {
	// not enough bytes for 32-bit integer?
	if (byteArray.byteLength < 4) {
		// zero-pad byte(s) at start of array
		let tmp = new Uint8Array(4);
		tmp.set(byteArray,4 - byteArray.byteLength);
		byteArray = tmp;
	}
	return new DataView(byteArray.buffer).getInt32(0);
}

async function computeSHA256Hash(val) {
	return new Uint8Array(
		await window.crypto.subtle.digest(
			"SHA-256",
			new Uint8Array(val)
		)
	);
}

function isPublicKeyAlgorithm(algoName,COSEID) {
	return (
		publicKeyAlgorithmsLookup[algoName] == publicKeyAlgorithmsLookup[COSEID]
	);
}

function packPublicKeyJSON(publicKeyEntry,stringify = false) {
	publicKeyEntry = {
		...publicKeyEntry,
		spki: (
			typeof publicKeyEntry.spki != "string" ?
				toBase64String(publicKeyEntry.spki) :
				publicKeyEntry.spki
		),
		raw: (
			typeof publicKeyEntry.raw != "string" ?
				toBase64String(publicKeyEntry.raw) :
				publicKeyEntry.raw
		),
	};
	return (stringify ? JSON.stringify(publicKeyEntry) : publicKeyEntry);
}

function unpackPublicKeyJSON(publicKeyEntryJSON) {
	var publicKeyEntry = (
		typeof publicKeyEntryJSON == "string" ? JSON.parse(publicKeyEntryJSON) : publicKeyEntryJSON
	);
	return {
		...publicKeyEntry,
		spki: (
			typeof publicKeyEntry.spki == "string" ?
				fromBase64String(publicKeyEntry.spki) :
				publicKeyEntry.spki
		),
		raw: (
			typeof publicKeyEntry.raw == "string" ?
				fromBase64String(publicKeyEntry.raw) :
				publicKeyEntry.raw
		),
	};
}

function normalizeCredentialsList(credList) {
	if (Array.isArray(credList)) {
		return credList.map(entry => ({
			...entry,
			id: (
				typeof entry.id == "string" ?
					fromBase64String(entry.id) :
					entry.id
			),
		}));
	}
}

function toBase64String(val) {
	return sodium.to_base64(val,sodium.base64_variants.ORIGINAL);
}

function fromBase64String(val) {
	return sodium.from_base64(val,sodium.base64_variants.ORIGINAL);
}

function toUTF8String(val) {
	return sodium.to_string(val);
}

function fromUTF8String(val) {
	return sodium.from_string(val);
}
