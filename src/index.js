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
	authDefaults,
	auth,
	verifyAuthResponse,
};
var publicAPI = {
	supportsWebAuthn,
	supportsConditionalMediation,

	registrationDefaults,
	register,
	authDefaults,
	auth,
	verifyAuthResponse,
};
export default publicAPI;


// ********************************

async function register(regOptions = registrationDefaults()) {
	try {
		if (supportsWebAuthn) {
			let regResult = await navigator.credentials.create(regOptions);

			let regClientDataRaw = new Uint8Array(regResult.response.clientDataJSON);
			let regClientData = JSON.parse(sodium.to_string(regClientDataRaw));
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
			let publicKeySPKI = regResult.response.getPublicKey();
			let {
				algo: publicKeyAlgoOID,
				raw: publicKeyRaw,
			} = parsePublicKeySPKI(publicKeySPKI);

			let regAuthDataRaw = CBOR.decode(regResult.response.attestationObject).authData;
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
					credentialType: regResult.type,
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
						new Uint8Array(regResult.rawId),
						sodium.base64_variants.ORIGINAL
					),
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

async function auth(authOptions = authDefaults()) {
	try {
		if (supportsWebAuthn) {
			let authResult = await navigator.credentials.get(authOptions);
			let authClientDataRaw = new Uint8Array(authResult.response.clientDataJSON);
			let authClientData = JSON.parse(sodium.to_string(authClientDataRaw));
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
			if (!checkRPID(authData.rpIdHash)) {
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
					signature: signatureRaw,
					...(Object.fromEntries(
						Object.entries(authData).filter(([ key, val ]) => (
							[ "flags", "signCount", "userPresence", "userVerification", ].includes(key)
						))
					)),
					raw: authResult.response,
				},
			};
		}
		throw new Error("WebAuthentication not supported on this device");
	}
	catch (err) {
		throw new Error("Credential auth failed",{ cause: err, });
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
	mediation = (supportsConditionalMediation ? "conditional" : "optional"),
} = {}) {
	var defaults = {
		[credentialType]: {
			rpId: relyingPartyID,
			userVerification,
			challenge,
			allowCredentials,
		},
		mediation,
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
		algoOID: publicKeyAlgoOID,
		spki: publicKeySPKI,
		raw: publicKeyRaw,
	} = {}
) {
	try {
		let verificationSig = parseSignature(publicKeyAlgoCOSE,publicKeyAlgoOID,signature);
		let verificationData = await computeVerificationData(authDataRaw,clientDataRaw);
		let status = await (
			// Ed25519?
			(publicKeyAlgoCOSE == -8 && publicKeyAlgoOID == "2b6570") ?
				verifySignatureSodium(
					publicKeyRaw,
					publicKeyAlgoCOSE,
					publicKeyAlgoOID,
					verificationSig,
					verificationData
				) :

			// ECDSA, RSA?
			[ -7, -257 ].includes(publicKeyAlgoCOSE) ?
				verifySignatureSubtle(
					publicKeySPKI,
					publicKeyAlgoCOSE,
					publicKeyAlgoOID,
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
	catch (err) {
		throw new Error("Auth verification failed",{ cause: err, });
	}
}

async function verifySignatureSubtle(publicKeySPKI,algoCOSE,algoOID,signature,data) {
    var cipherOptions = {
        ...(
            algoCOSE == -7 ? {
                name: "ECDSA",
                namedCurve: "P-256",
                hash: { name: "SHA-256", },
            } :
            algoCOSE == -257 ? {
                name: "RSASSA-PKCS1-v1_5",
                hash: { name: "SHA-256", },
            } :

            // note: Ed25519 (-8) is in draft, but not yet supported
            // by `importKey(..)`, as of Chrome v122
            (algoCOSE == -8 && algoOID == "2b6570") ? {
                name: "ECDSA",
                namedCurve: "Ed25519",
                hash: { name: "SHA-512", },
            } :

            // should never use this
            null
        ),
    };

    try {
        let pubKeySubtle = await crypto.subtle.importKey(
            "spki", // Simple Public Key Infrastructure rfc2692
            publicKeySPKI,
            cipherOptions,
            false, // extractable
            [ "verify", ]
        );

        return await crypto.subtle.verify(cipherOptions,pubKeySubtle,signature,data);
    }
    catch (err) {
        console.log(err);
        return false;
    }
}

function verifySignatureSodium(publicKeyRaw,algoCOSE,algoOID,signature,data) {
	// Ed25519?
	if (algoCOSE == -8 && algoOID == "2b6570") {
		try {
			// console.log(signature,data,publicKeyRaw);
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

function parseSignature(algoCOSE,algoOID,signature) {
	if (algoCOSE == -7) {
		let rStart = signature[4] === 0 ? 5 : 4;
		let rEnd = rStart + 32;
		let sStart = signature[rEnd + 2] === 0 ? rEnd + 3 : rEnd + 2;
		let r = signature.slice(rStart, rEnd);
		let s = signature.slice(sStart);
		return new Uint8Array([...r, ...s]);
	}
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
