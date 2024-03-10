import {
	register,
	regDefaults,
	auth,
	authDefaults,
	verifyAuthResponse,
}
// swap "src" for "dist" here to test against the dist/* files
from "webauthn-local-client/src";

try {
	var regResult = await register();

	console.log(regResult);

	var authResult = await auth(
		authDefaults({ mediation: "optional", })
	);

	console.log(authResult);

	var verified = await verifyAuthResponse(
		authResult.response,
		regResult.response.publicKey
	);

	console.log(`Auth verified: ${verified}`);
}
catch (err) {
	console.log(err.stack,err.cause);
}
