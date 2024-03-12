import {
	supportsWebAuthn,
	supportsConditionalMediation,
	resetAbortReason,
	register,
	regDefaults,
	auth,
	authDefaults,
	verifyAuthResponse,
	packPublicKeyJSON,
	unpackPublicKeyJSON,
}
// swap "src" for "dist" here to test against the dist/* files
from "webauthn-local-client/src";


var registerBtn;
var authBtn;
var registeredCredentialsEl;

var credentialsByID = {};

if (document.readyState == "loading") {
	document.addEventListener("DOMContentLoaded",ready,false);
}
else {
	ready();
}


// ***********************

function ready() {
	registerBtn = document.getElementById("register-btn");
	authBtn = document.getElementById("auth-btn");
	registeredCredentialsEl = document.getElementById("registered-credentials");

	registerBtn.addEventListener("click",promptRegister,false);
	authBtn.addEventListener("click",promptAuth,false);
	registeredCredentialsEl.addEventListener("click",onAuthCredential,true);
}

async function promptRegister() {
	var registerNameEl;
	var registerIDEl;
	var generateIDBtn;

	var result = await Swal.fire({
		title: "Register New Credential",
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
				<button type="button" id="generate-id-btn" class="swal2-styled swal2-default-outline modal-btn">Generate Random</button>
			</p>
		`,
		showConfirmButton: true,
		confirmButtonText: "Register",
		confirmButtonColor: "darkslateblue",
		showCancelButton: true,
		cancelButtonColor: "darkslategray",

		allowOutsideClick: true,
		allowEscapeKey: true,

		didOpen(popupEl) {
			registerNameEl = document.getElementById("register-name");
			registerIDEl = document.getElementById("register-id");
			generateIDBtn = document.getElementById("generate-id-btn");
			registerNameEl.focus();

			generateIDBtn.addEventListener("click",onGenerateID,false);
			popupEl.addEventListener("keypress",onKeypress,true);
		},

		willClose(popupEl) {
			popupEl.removeEventListener("keypress",onKeypress,true);
			generateIDBtn.removeEventListener("click",onGenerateID,false);

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
				Swal.showValidationMessage("Please enter an ID (or generate a new one)");
				return false;
			}

			return { registerName, registerID, };
		},
	});

	if (result.isConfirmed) {
		return registerNewCredential(
			result.value.registerName,
			result.value.registerID
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
}

async function registerNewCredential(name,userIDStr) {
	var userID = sodium.from_string(userIDStr);
	var regOptions = regDefaults({
		user: {
			name,
			displayName: name,
			id: userID,
		},
	});
	try {
		let regResult = await register(regOptions);
		if (regResult.response) {
			// serialize credential info to DOM element
			let li = document.createElement("li");
			li.dataset.credentialId = regResult.response.credentialID;
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

			// keep registered credential info in memory only
			// (no persistence)
			credentialsByID[userIDStr] = {
				credentialID: regResult.response.credentialID,
				publicKey: regResult.response.publicKey,
			};

			console.log("regResult:",regResult);
		}
	}
	catch (err) {
		logError(err);
		showError("Registering credential failed. Please try again.");
	}
}

async function promptAuth() {
	var auth1Btn;
	var auth2Btn;

	return Swal.fire({
		title: "Authenticate",
		html: `
			<p>
				<button type="button" id="auth-1-btn" class="swal2-styled swal2-default-outline modal-btn">Provide my user ID</button>
			</p>
			<p>
				<button type="button" id="auth-2-btn" class="swal2-styled swal2-default-outline modal-btn">Pick my user ID</button>
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

			auth1Btn.addEventListener("click",promptProvideAuth,false);
			auth2Btn.addEventListener("click",promptPickAuth,false);
		},

		willClose(popupEl) {
			auth1Btn.removeEventListener("click",promptProvideAuth,false);
			auth2Btn.removeEventListener("click",promptPickAuth,false);

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
			if (!(userID in credentialsByID)) {
				Swal.showValidationMessage("Unrecognized user ID.");
				return false;
			}

			cancelToken = new AbortController();
			var authOptions = authDefaults({
				allowCredentials: [ { type: "public-key", id: credentialsByID[userID].credentialID, }, ],
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
		let allowCredentials = [
			...(
				credentialID != null ?
					[ { type: "public-key", id: credentialID, }, ] :
					[]
			),
		];
		let authOptions = authDefaults({
			mediation: "optional",
			allowCredentials,
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
		let publicKey = unpackPublicKeyJSON(liEl.dataset.publicKey);
		let authResult = await onAuth(credentialID,publicKey);
		return checkAuthResponse(authResult,credentialID,publicKey);
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
		authSuccess ?
			showToast("Authentication successful.") :
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
