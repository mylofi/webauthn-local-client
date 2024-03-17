#!/usr/bin/env node

"use strict";

var path = require("path");
var fs = require("fs");
var fsp = require("fs/promises");

var micromatch = require("micromatch");
var recursiveReadDir = require("recursive-readdir-sync");
var terser = require("terser");

const PKG_ROOT_DIR = path.join(__dirname,"..");
const SRC_DIR = path.join(PKG_ROOT_DIR,"src");
const MAIN_COPYRIGHT_HEADER = path.join(SRC_DIR,"copyright-header.txt");
const NODE_MODULES_DIR = path.join(PKG_ROOT_DIR,"node_modules");
const ASN1_SRC = path.join(NODE_MODULES_DIR,"@yoursunny","asn1","dist","asn1.all.min.js");
const ASN1_COPYRIGHT_HEADER = path.join(__dirname,"asn1-copyright-header.txt");
const CBOR_SRC = path.join(NODE_MODULES_DIR,"cbor-js","cbor.js");
const LIBSODIUM_SRC = path.join(NODE_MODULES_DIR,"libsodium","dist","modules","libsodium.js");
const LIBSODIUM_WRAPPERS_SRC = path.join(NODE_MODULES_DIR,"libsodium-wrappers","dist","modules","libsodium-wrappers.js");
const DIST_DIR = path.join(PKG_ROOT_DIR,"dist");
const DIST_INDEX_FILE = path.join(DIST_DIR,"index.js");
const DIST_EXTERNAL_DIR = path.join(DIST_DIR,"external");


main().catch(console.error);


// **********************

async function main() {
	console.log("*** Building JS ***");

	// try to make the dist/ and dist/external/ directories, if needed
	if (!(await safeMkdir(DIST_DIR))) {
		throw new Error(`Target directory (${DIST_DIR}) does not exist and could not be created.`);
	}
	if (!(await safeMkdir(DIST_EXTERNAL_DIR))) {
		throw new Error(`Target directory (${DIST_EXTERNAL_DIR}) does not exist and could not be created.`);
	}

	// read package.json
	var packageJSON = JSON.parse(
		await fsp.readFile(
			path.join(PKG_ROOT_DIR,"package.json"),
			{ encoding: "utf8", }
		)
	);
	// read version number from package.json
	var version = packageJSON.version;
	var [ mainCopyrightHeader, asn1CopyrightHeader, ] = await Promise.all([
		// read main src copyright-header text,
		fsp.readFile(MAIN_COPYRIGHT_HEADER,{ encoding: "utf8", }),

		// read ASN1 copyright header (required by MPL2 license)
		fsp.readFile(ASN1_COPYRIGHT_HEADER,{ encoding: "utf8", }),
	]);
	// render main copyright header with version and year
	mainCopyrightHeader = (
		mainCopyrightHeader
			.replace(/#VERSION#/g,version)
			.replace(/#YEAR#/g,(new Date()).getFullYear())
	);

	// copy src/* files
	await copyFilesTo(
		recursiveReadDir(SRC_DIR),
		SRC_DIR,
		DIST_DIR,
		mainCopyrightHeader,
		/*skipPatterns=*/[ "**/*.txt", "**/*.json", "**/external" ]
	);

	var [
		bundlersIndexContents,
		asn1Contents,
	] = await Promise.all([
		fsp.readFile(DIST_INDEX_FILE,{ encoding: "utf8", }),
		fsp.readFile(ASN1_SRC,{ encoding: "utf8", }),
	]);

	// prepare bundler.index.js
	bundlersIndexContents = (
		bundlersIndexContents
			// update the filename in the copyright header
			.replace(/(WebAuthn-Local-Client: )(index.js)/,"$1bundlers.$2")

			// remove reference to importing the "external.js" module
			// since bundlers handle the dependencies
			.replace(/import ?".\/external.js";?/,"")
	);

	// prepend MPL2-required copyright header
	asn1Contents = `${asn1CopyrightHeader}\n${asn1Contents}`;

	await Promise.all([
		// build bundlers.index.js (for bundlers)
		fsp.writeFile(
			path.join(DIST_DIR,`bundlers.${path.basename(DIST_INDEX_FILE)}`),
			bundlersIndexContents,
			{ encoding: "utf8", }
		),
		// add ASN1's license-required copyright header
		fsp.writeFile(
			path.join(DIST_EXTERNAL_DIR,path.basename(ASN1_SRC)),
			asn1Contents,
			{ encoding: "utf8", }
		),
		fsp.copyFile(
			CBOR_SRC,
			path.join(DIST_EXTERNAL_DIR,path.basename(CBOR_SRC))
		),
		fsp.copyFile(
			LIBSODIUM_SRC,
			path.join(DIST_EXTERNAL_DIR,path.basename(LIBSODIUM_SRC))
		),
		fsp.copyFile(
			LIBSODIUM_WRAPPERS_SRC,
			path.join(DIST_EXTERNAL_DIR,path.basename(LIBSODIUM_WRAPPERS_SRC))
		),
	]);

	console.log("Complete.");
}

async function copyFilesTo(files,fromBasePath,toDir,copyrightHeader,skipPatterns) {
	for (let fromPath of files) {
		// should we skip copying this file?
		if (matchesSkipPattern(fromPath,skipPatterns)) {
			continue;
		}
		let relativePath = fromPath.slice(fromBasePath.length);
		let outputPath = path.join(toDir,relativePath);
		let outputDir = path.dirname(outputPath);

		if (!(fs.existsSync(outputDir))) {
			if (!(await safeMkdir(outputDir))) {
				throw new Error(`While copying src/* to dist/, directory (${outputDir}) could not be created.`);
			}
		}

		let contents = await fsp.readFile(fromPath,{ encoding: "utf8", });

		// JS file (to minify)?
		if (/\.[mc]?js$/i.test(relativePath)) {
			contents = await minifyJS(contents);
		}

		await fsp.writeFile(
			outputPath,
			`${
				copyrightHeader.replace(/#FILENAME#/g,path.basename(outputPath))
			}\n${
				contents
			}`,
			{ encoding: "utf8", }
		);
	}
}

async function minifyJS(contents) {
	let result = await terser.minify(contents,{
		mangle: {
			keep_fnames: true,
		},
		compress: {
			keep_fnames: true,
		},
		output: {
			comments: /^!/,
		},
		module: true,
	});
	if (!(result && result.code)) {
		if (result.error) throw result.error;
		else throw result;
	}
	return result.code;
}

function matchesSkipPattern(pathStr,skipPatterns) {
	if (skipPatterns && skipPatterns.length > 0) {
		return (micromatch(pathStr,skipPatterns).length > 0);
	}
}

async function safeMkdir(pathStr) {
	if (!fs.existsSync(pathStr)) {
		try {
			await fsp.mkdir(pathStr,0o755);
			return true;
		}
		catch (err) {}
		return false;
	}
	return true;
}
