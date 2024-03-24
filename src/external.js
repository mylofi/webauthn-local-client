// load external dependencies via <script> tag injection
await Promise.all([
	loadScript(import.meta.resolve("./external/libsodium.js")),
	loadScript(import.meta.resolve("./external/cbor.js")),
	loadScript(import.meta.resolve("./external/asn1.all.min.js")),
])
await loadScript(import.meta.resolve("./external/libsodium-wrappers.js"));


var sodium = window.sodium;
var CBOR = window.CBOR;
var ASN1 = window.ASN1;
export { sodium, CBOR, ASN1 };


// ********************************

function loadScript(filepath) {
	if (typeof document == "undefined") return;
	var loadComplete = null;
	var pr = new Promise(res => loadComplete = res);
	var script = document.createElement("script");
	script.addEventListener("load",function onload(){
		if (loadComplete) loadComplete();
		if (script) script.removeEventListener("load",onload,false);
		loadComplete = pr = script = null;
	},false);
	script.async = true;
	script.src = filepath;
	document.body.appendChild(script);
	return pr;
}
