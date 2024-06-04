// load (non-ESM) external dependencies via <script> tag injection
await Promise.all([
	loadScript(import.meta.resolve("./external/libsodium.js")),
	loadScript(import.meta.resolve("./external/libsodium-wrappers.js"))
]);

export default window.sodium;


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
	script.async = false;	// ensure async loaded scripts execute in order
	script.src = filepath;
	document.body.appendChild(script);
	return pr;
}
