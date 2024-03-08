// load external dependencies
import "./external.js";


const credentialTypeKey = Symbol("credential-type");
const supportsWebAuthn = (
    navigator.credentials &&
    typeof navigator.credentials.create != "undefined" &&
    typeof navigator.credentials.get != "undefined" &&
    typeof PublicKeyCredential != "undefined" &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable != "undefined" &&
    (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
);

// Re: https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/isConditionalMediationAvailable
// Also: https://web.dev/articles/passkey-form-autofill
const supportsConditionalMediation = (
     typeof PublicKeyCredential.isConditionalMediationAvailable != "undefined" &&
     (await PublicKeyCredential.isConditionalMediationAvailable())
);


export {
	supportsWebAuthn,
	supportsConditionalMediation,

	registrationDefaults,
	register,
};
var publicAPI = {
	supportsWebAuthn,
	supportsConditionalMediation,

	registrationDefaults,
	register,
};
export default publicAPI;


// ********************************

async function register(regOptions = registrationDefaults()) {
	try {
		if (supportsWebAuthn) {
			let registration = await navigator.credentials.create(regOptions);

			let regClientData = JSON.parse(
				sodium.to_string(registration.response.clientDataJSON)
			);
			if (regClientData.type != "webauthn.create") {
				throw new Error("Invalid response");
			}
			let expectedChallenge = sodium.to_base64(
				regOptions[regOptions[credentialTypeKey]].challenge,
				sodium.base64_variants.URLSAFE_NO_PADDING
			);
			if (regClientData.challenge != expectedChallenge) {
				throw new Error("Challenge not accepted");
			}

			let publicKeyAlgoCOSE = registration.response.getPublicKeyAlgorithm();
			let publicKeySPKI = registration.response.getPublicKey();
			let {
				algo: publicKeyAlgoOID,
				raw: publicKeyRaw,
			} = parsePublicKeySPKI(publicKeySPKI);

			let regAuthDataRaw = CBOR.decode(registration.response.attestationObject).authData;
			let regAuthData = parseAuthenticatorData(regAuthDataRaw);
			if (!checkRPID(regAuthData.rpIdHash)) {
			    throw new Error("Unexpected relying-party ID");
			}
			// sign-count not supported by this authenticator?
			if (regAuthData.signCount == 0) {
				delete regAuthData.signCount;
			}

			return {
				request: {
					credentialType: registration.type,
					...regOptions[regOptions[credentialTypeKey]],

					challenge: sodium.to_base64(
						regOptions[regOptions[credentialTypeKey]].challenge,
						sodium.base64_variants.ORIGINAL
					),
					...(Object.fromEntries(
						Object.entries(regClientData).filter(([ key, val ]) => (
							[ "origin", "crossOrigin", ].includes(key)
						))
					)),
				},
				response: {
					credentialID: sodium.to_base64(
						new Uint8Array(registration.rawId),
						sodium.base64_variants.ORIGINAL
					),
					credentialType: registration.type,
					authenticatorAttachment: registration.authenticatorAttachment,
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
					raw: registration.response,
				},
			};
		}
		throw new Error("WebAuthentication not supported on this device");
	}
	catch (err) {
		throw new Error("Credential registration failed",{ cause: err, });
	}
}

function registrationDefaults({
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

	user: {
		name: userName = "wacg-user",
		displayName: userDisplayName = userName,
		id: userID = sodium.randombytes_buf(5),
	} = {},

	publicKeyCredentialParams = [
		{ type: "public-key", alg: -8, },		// Ed25519
		{ type: "public-key", alg: -7, },		// ECDSA (P-256)
		{ type: "public-key", alg: -257, },		// RSASSA-PKCS1-v1_5
	],

	...otherOptions
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

			pubKeyCredParams: publicKeyCredentialParams,

			...otherOptions,
		},
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

// Adapted from: https://www.npmjs.com/package/@yoursunny/webcrypto-ed25519
function parsePublicKeySPKI(publicKeySPKI) {
    var der = ASN1.parseVerbose(new Uint8Array(publicKeySPKI));
    return {
        algo: sodium.to_hex(der.children[0].children[0].value),
        raw: der.children[1].value,
    };
}

function parseAuthenticatorData(authData) {
	// https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/Authenticator_data
	//     32 bytes: rpIdHash
	//     1 byte: flags
	//          Bit 0, User Presence (UP)
	//          Bit 2, User Verification (UV)
	//          Bit 3, Backup Eligibility (BE)
	//          Bit 4, Backup State (BS)
	//          Bit 6, Attested Credential Data (AT)
	//          Bit 7, Extension Data (ED)
	//     4 bytes: signCount (0 means disabled)

	return {
		rpIdHash: authData.slice(0,32),
		flags: authData[32],
		userPresence: ((authData[32] & 1) == 1),
		userVerification: ((authData[32] & 4) == 4),
		signCount: byteArrayTo32Int(authData.slice(33,37)),
	};
}

async function checkRPID(rpIDHash) {
	var originHash = await computeSHA256Hash(
		sodium.from_string(document.location.hostname)
	);
	return (
		rpIDHash.length > 0 &&
		rpIDHash.byteLength == originHash.byteLength &&
		rpIDHash.toString() == originHash.toString()
	);
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
