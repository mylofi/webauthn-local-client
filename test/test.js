import {
	supportsWebAuthn,
	supportsConditionalMediation,

	register,
	regDefaults,
	auth,
	authDefaults,
	verifyAuthResponse,

	packPublicKeyJSON,
	unpackPublicKeyJSON,
	toUTF8String,
	resetAbortReason,
}
// swap "src" for "dist" here to test against the dist/* files
from "webauthn-local-client/src";


var registerBtn;
var reRegisterBtn;
var authBtn;
var registeredCredentialsEl;

var credentialsByUserID = {};

if (document.readyState == "loading") {
	document.addEventListener("DOMContentLoaded",ready,false);
}
else {
	ready();
}


// ***********************

function ready() {
	registerBtn = document.getElementById("register-btn");
	reRegisterBtn = document.getElementById("reregister-btn");
	authBtn = document.getElementById("auth-btn");
	registeredCredentialsEl = document.getElementById("registered-credentials");

	registerBtn.addEventListener(
		"click",
		() => promptRegister(/*isNewRegistration=*/true),
		false
	);
	reRegisterBtn.addEventListener(
		"click",
		() => promptRegister(/*isNewRegistration=*/false),
		false
	);
	authBtn.addEventListener("click",promptAuth,false);
	registeredCredentialsEl.addEventListener("click",onAuthCredential,true);
}

async function promptRegister(isNewRegistration = true) {
	var registerNameEl;
	var registerIDEl;
	var generateIDBtn;
	var copyBtn;

	var result = await Swal.fire({
		title: (
			isNewRegistration ? "Register New Credential" : "Re-register Credential"
		),
		html: `
			<p>
				<label>
					Name:
					<input type="text" id="register-name" class="swal2-input">
				</label>
			</p>
			<p>
				<label>
					User ID:
					<input type="text" id="register-id" class="swal2-input">
				</label><br>
				${
					isNewRegistration ? `
						<button type="button" id="generate-id-btn" class="swal2-styled swal2-default-outline modal-btn">Generate Random</button>
					` : ""
				}
				<button type="button" id="copy-user-id-btn" class="swal2-styled swal2-default-outline modal-btn">Copy</button>
			</p>
		`,
		showConfirmButton: true,
		confirmButtonText: isNewRegistration ? "Register" : "Re-register",
		confirmButtonColor: "darkslateblue",
		showCancelButton: true,
		cancelButtonColor: "darkslategray",

		allowOutsideClick: true,
		allowEscapeKey: true,

		didOpen(popupEl) {
			registerNameEl = document.getElementById("register-name");
			registerIDEl = document.getElementById("register-id");
			generateIDBtn = document.getElementById("generate-id-btn");
			copyBtn = document.getElementById("copy-user-id-btn");
			registerNameEl.focus();

			if (generateIDBtn) {
				generateIDBtn.addEventListener("click",onGenerateID,false);
			}
			copyBtn.addEventListener("click",onCopyID,false);
			popupEl.addEventListener("keypress",onKeypress,true);
		},

		willClose(popupEl) {
			popupEl.removeEventListener("keypress",onKeypress,true);
			copyBtn.removeEventListener("click",onCopyID,false);
			if (generateIDBtn) {
				generateIDBtn.removeEventListener("click",onGenerateID,false);
			}

			registerNameEl = registerIDEl = generateIDBtn = null;
		},

		async preConfirm() {
			var registerName = registerNameEl.value.trim();
			var registerID = registerIDEl.value.trim();

			if (!registerName) {
				Swal.showValidationMessage("Please enter your name.");
				return false;
			}
			if (!registerID) {
				Swal.showValidationMessage(
					isNewRegistration ?
						"Please enter a User ID (or generate a new one)" :
						"Please enter an existing User ID"
				);
				return false;
			}

			return { registerName, registerID, };
		},
	});

	if (result.isConfirmed) {
		return registerCredential(
			result.value.registerName,
			result.value.registerID,
			isNewRegistration
		);
	}


	// ***********************

	function onKeypress(evt) {
		if (
			evt.key == "Enter" &&
			evt.target.matches(".swal2-input, .swal2-select, .swal2-textarea")
		) {
			evt.preventDefault();
			evt.stopPropagation();
			evt.stopImmediatePropagation();
			Swal.clickConfirm();
		}
	}

	async function onGenerateID() {
		registerIDEl.value = sodium.to_base64(
			sodium.randombytes_buf(10),
			sodium.base64_variants.ORIGINAL
		);
	}

	async function onCopyID() {
		if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(registerIDEl.value);
		}
		else {
			registerIDEl.select();
			document.execCommand("copy");
		}
		Swal.showValidationMessage("copied");
		setTimeout(() => Swal.resetValidationMessage(),500);
	}
}

async function registerCredential(name,userIDStr,isNewRegistration = true) {
	var userID = sodium.from_string(userIDStr);
	var regOptions = regDefaults({
		user: {
			name,
			displayName: name,
			id: userID,
		},

		// only *exclude credentials* on a new registration, not
		// on a re-registration
		...(
			(isNewRegistration) ? {
				excludeCredentials: Object.entries(credentialsByUserID)
					.filter(([userID,entry]) => (userID == userIDStr))
					.map(([userID,entry]) => ({
						type: "public-key",
						id: entry.credentialID,
					})),
			} :

			null
		),
	});
	try {
		let regResult = await register(regOptions);
		if (regResult.response) {
			// on re-register, remove previous credential DOM element (if any)
			if (!isNewRegistration && userIDStr in credentialsByUserID) {
				let liEl = registeredCredentialsEl.querySelector(
					`li[data-credential-id='${credentialsByUserID[userIDStr].credentialID}']`
				);
				if (liEl) {
					liEl.remove();
				}
			}

			// serialize credential info to DOM element
			let li = document.createElement("li");
			li.dataset.credentialId = regResult.response.credentialID;
			// NOTE: deliberately used her to show using the 'packPublicKeyJSON()' util
			li.dataset.publicKey = packPublicKeyJSON(regResult.response.publicKey,/*stringify=*/true);
			li.innerHTML = `
				<strong>${name}</strong>
				(ID: <small><strong>${regResult.response.credentialID}</strong></small>
				Count: <strong class="sign-count">${regResult.response.signCount || "n/a"}</strong>)
				<button type="button" class="cred-auth-btn">authenticate</button>
			`;
			if (registeredCredentialsEl.children.length > 0) {
				registeredCredentialsEl.insertBefore(li,registeredCredentialsEl.children[0]);
			}
			else {
				registeredCredentialsEl.appendChild(li);
			}

			registeredCredentialsEl.scrollIntoView({ behavior: "smooth", block: "center", });

			// keep registered credential info in memory only
			// (no persistence)
			credentialsByUserID[userIDStr] = {
				credentialID: regResult.response.credentialID,
				publicKey: regResult.response.publicKey,
			};

			console.log("regResult:",regResult);

			let regType = isNewRegistration ? "Registering" : "Re-registering";
			let forUserID = `(${toUTF8String(regResult.request.user.id)})`;
			showToast(`${regType} ${forUserID} successful.`);
		}
	}
	catch (err) {
		logError(err);

		if (
			isNewRegistration &&
			err.cause instanceof Error
		) {
			let errorString = err.cause.toString();
			if (errorString.includes("credentials already registered")) {
				return showError(`
					A credential already exists for this User ID.
					Please try a different User ID or pick a different authenticator.
				`);
			}
		} 

		let regType = (
			isNewRegistration ?
				"Registering" :
				"Re-registering"
		);
		showError(`${regType} credential failed. Please try again.`);
	}
}

async function promptAuth() {
	var auth1Btn;
	var auth2Btn;

	return Swal.fire({
		title: "Authenticate",
		html: `
			<p>
				<button type="button" id="auth-1-btn" class="swal2-styled swal2-default-outline modal-btn">Pick my passkey</button>
			</p>
			<p>
				<button type="button" id="auth-2-btn" class="swal2-styled swal2-default-outline modal-btn">Provide my user ID</button>
			</p>
		`,
		showConfirmButton: false,
		showCancelButton: true,
		cancelButtonColor: "darkslategray",

		allowOutsideClick: true,
		allowEscapeKey: true,

		didOpen(popupEl) {
			auth1Btn = document.getElementById("auth-1-btn");
			auth2Btn = document.getElementById("auth-2-btn");
			auth1Btn.focus();

			auth1Btn.addEventListener("click",promptPickAuth,false);
			auth2Btn.addEventListener("click",promptProvideAuth,false);
		},

		willClose(popupEl) {
			auth1Btn.removeEventListener("click",promptPickAuth,false);
			auth2Btn.removeEventListener("click",promptProvideAuth,false);

			auth1Btn = auth2Btn = null;
		},
	});
}

async function promptProvideAuth() {
	var userIDEl;
	var cancelToken;

	return Swal.fire({
		html: `
			<label>
				<p>
					Provide (or autofill) User ID:
				</p>
				<p>
					<input type="text" id="auth-user-id" class="swal2-input" autocomplete="username webauthn">
				</p>
			</label>
		`,
		showConfirmButton: true,
		confirmButtonText: "Authenticate",
		confirmButtonColor: "darkslateblue",
		showCancelButton: true,
		cancelButtonColor: "darkslategray",

		allowOutsideClick: true,
		allowEscapeKey: true,

		didOpen(popupEl) {
			userIDEl = document.getElementById("auth-user-id");

			userIDEl.addEventListener("input",onUserIDInput,false);

			var confirmBtn = Swal.getConfirmButton();
			confirmBtn.disabled = true;

			if (supportsConditionalMediation) {
				startAuthAutofill().catch(logError);
			}
		},

		willClose(popupEl) {
			resetCancelToken();

			userIDEl.removeEventListener("input",onUserIDInput,false);

			userIDEl = null;
		},

		async preConfirm() {
			resetCancelToken();

			var userID = userIDEl.value.trim();

			// not previously recorded user ID for a
			// registered credential?
			if (!(userID in credentialsByUserID)) {
				Swal.showValidationMessage("Unrecognized user ID.");
				return false;
			}

			cancelToken = new AbortController();
			var authOptions = authDefaults({
				...(
					(userID in credentialsByUserID) ? {
						allowCredentials: (
							{
								type: "public-key",
								id: credentialsByUserID[userID].credentialID,
							}
						),
					} :

					null
				),
				signal: cancelToken.signal,
			});
			try {
				let authResult = await auth(authOptions);
				if (authResult) {
					onAuthInput(authResult);
				}
			}
			catch (err) {
				logError(err);
				Swal.showValidationMessage("Oops, authentication didn't work, please try again.");
				startAuthAutofill().catch(logError);
				return false;
			}
		},
	});


	// ***********************

	async function startAuthAutofill() {
		resetCancelToken();

		cancelToken = new AbortController();
		var authOptions = authDefaults({
			mediation: "conditional",
			signal: cancelToken.signal,
		});
		try {
			let authResult = await auth(authOptions);
			if (authResult) {
				onAuthAutofilled(authResult);
			}
		}
		catch (err) {
			logError(err);
			Swal.showValidationMessage("Oops, authentication didn't work, please try again.");
		}
	}

	function onUserIDInput(evt) {
		var confirmBtn = Swal.getConfirmButton();
		confirmBtn.disabled = (userIDEl.value.trim() == "");
	}

	async function onAuthAutofilled(authResult) {
		resetCancelToken();

		console.log("authResult (autofill):",authResult);

		// show the User ID in the input box, for UX purposes
		if (authResult && authResult.response && authResult.response.userID) {
			userIDEl.readonly = true;
			userIDEl.value = toUTF8String(authResult.response.userID);
			userIDEl.select();

			// brief pause to ensure user can see their User ID
			// filled in
			await new Promise(res => setTimeout(res,500));
		}

		return checkAuthResponse(authResult);
	}

	async function onAuthInput(authResult) {
		console.log("authResult (input):",authResult);

		return checkAuthResponse(authResult);
	}

	function resetCancelToken() {
		// cleanup cancel token
		if (cancelToken) {
			cancelToken.abort(resetAbortReason);
			cancelToken = null;
		}
	}
}

async function promptPickAuth() {
	var authResult = await onAuth();
	return checkAuthResponse(authResult);
}

async function onAuth(credentialID,publicKey) {
	try {
		let authOptions = authDefaults({
			mediation: "optional",
			allowCredentials: [
				...(
					credentialID != null ?
						[ { type: "public-key", id: credentialID, }, ] :
						[]
				),
			],
		});
		let authResult = await auth(authOptions);

		console.log(`authResult (${credentialID != null ? "explicit" : "discovered"}):`,authResult);

		return authResult;
	}
	catch (err) {
		logError(err);
		showError(`Authenticating credential (${credentialID}) failed. Please try again.`);
	}
}

async function onAuthCredential(evt) {
	if (evt.target.matches(".cred-auth-btn")) {
		let liEl = evt.target.closest("li[data-credential-id]");
		let credentialID = liEl.dataset.credentialId;
		// NOTE: deliberately used her to show using the 'unpackPublicKeyJSON()' util
		let publicKey = unpackPublicKeyJSON(liEl.dataset.publicKey);
		let authResult = await onAuth(credentialID,publicKey);
		if (authResult) {
			return checkAuthResponse(authResult,credentialID,publicKey);
		}
	}
}

async function checkAuthResponse(authResult,credentialID,publicKey) {
	var authSuccess = false;
	if (authResult && authResult.response) {
		authSuccess = (
			(
				credentialID &&
				publicKey &&
				authResult.response.credentialID == credentialID
			) ?
				(await verifyAuthResponse(authResult.response,publicKey)) :
				true
		);

		// on success, update sign count of credential?
		if (authSuccess && authResult.response.signCount) {
			updateSignCount(
				(authResult.response.credentialID || credentialID),
				authResult.response.signCount
			);
		}
	}
	return void (
		authSuccess ? (
				showToast(`Authentication${(
					"userID" in authResult.response ?
						` (${toUTF8String(authResult.response.userID)})` :
						""
				)} successful.`)
			) :

			showError("Authentication failed.")
	);
}

function updateSignCount(credentialID,signCount) {
	let updateLIEl = registeredCredentialsEl.querySelector(`li[data-credential-id='${credentialID}'`);
	if (updateLIEl) {
		let countEl = updateLIEl.querySelector(".sign-count");
		countEl.innerText = String(signCount);
	}
}

function logError(err,returnLog = false) {
	var err = `${
			err.stack ? err.stack : err.toString()
		}${
			err.cause ? `\n${logError(err.cause,/*returnLog=*/true)}` : ""
	}`;
	if (returnLog) return err;
	else console.error(err);
}

function showError(errMsg) {
	return Swal.fire({
		title: "Error!",
		text: errMsg,
		icon: "error",
		confirmButtonText: "ok",
	});
}

function showToast(toastMsg) {
	return Swal.fire({
		text: toastMsg,
		showConfirmButton: false,
		showCloseButton: true,
		timer: 5000,
		toast: true,
		position: "top-end",
		customClass: {
			popup: "toast-popup",
		},
	});
}
