import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";

//#region actions-core.ts
function getInput(name, options) {
	const val = process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "";
	if (options?.required && !val) throw new Error(`Input required and not supplied: ${name}`);
	if (options?.trimWhitespace === false) return val;
	return val.trim();
}
function setFailed(message) {
	process.exitCode = 1;
	error(message);
}
function issueCommand(command, properties, message) {
	let cmdStr = "::" + command;
	if (properties && Object.keys(properties).length > 0) cmdStr += " " + Object.entries(properties).map(([key, value]) => `${key}=${escapeProperty(value)}`).join(",");
	cmdStr += `::${escapeData(message)}`;
	process.stdout.write(cmdStr + os.EOL);
}
function escapeData(s) {
	return toCommandValue(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(s) {
	return toCommandValue(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function toCommandValue(input) {
	if (input === null || input === void 0) return "";
	else if (typeof input === "string" || input instanceof String) return input.toString();
	return JSON.stringify(input);
}
function issueFileCommand(command, message) {
	const filePath = process.env[`GITHUB_${command}`];
	if (!filePath) throw new Error(`Unable to find environment variable for file command ${command}`);
	if (!fs.existsSync(filePath)) throw new Error(`Missing file at path: ${filePath}`);
	fs.appendFileSync(filePath, `${toCommandValue(message)}${os.EOL}`, { encoding: "utf8" });
}
function prepareKeyValueMessage(key, value) {
	const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
	const convertedValue = toCommandValue(value);
	if (key.includes(delimiter)) throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
	if (convertedValue.includes(delimiter)) throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
	return `${key}<<${delimiter}${os.EOL}${convertedValue}${os.EOL}${delimiter}`;
}
function error(message, properties) {
	issueCommand("error", properties || {}, message);
}
function warning(message, properties) {
	issueCommand("warning", properties || {}, message);
}
function exportVariable(name, value) {
	const convertedValue = toCommandValue(value);
	process.env[name] = convertedValue;
	if (process.env["GITHUB_ENV"] || "") return issueFileCommand("ENV", prepareKeyValueMessage(name, value));
	issueCommand("set-env", { name }, convertedValue);
}

//#endregion
//#region normalize-env-key.ts
function normalizeEnvKey(key, options = {}) {
	let keyString = key;
	if (options.prefix) keyString = `${options.prefix}_${keyString}`;
	keyString = keyString.replace(/(?<=(?:^|[a-z]))([A-Z])/g, "_$1").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
	if (options.upcase) keyString = keyString.toUpperCase();
	else keyString = keyString.toLowerCase();
	keyString = keyString.replace(/[^a-zA-Z0-9_]/g, "_");
	keyString = keyString.replace(/_+/g, "_");
	keyString = keyString.replace(/^_|_$/g, "");
	return keyString;
}

//#endregion
//#region main.ts
function main() {
	const variablesInput = getInput("variables");
	let variables;
	try {
		variables = JSON.parse(variablesInput);
	} catch (_error) {}
	if (!variables || typeof variables !== "object") {
		setFailed("variables input must be a valid JSON object");
		return;
	}
	let prefix = getInput("prefix") || "";
	let upcase = getInput("upcase") === "true";
	let onConflict = getInput("on-conflict") || "overwrite";
	if (![
		"overwrite",
		"preserve",
		"error"
	].includes(onConflict)) {
		setFailed("on-conflict input must be one of: overwrite, preserve, error");
		return;
	}
	for (const [key, value] of Object.entries(variables)) {
		if (typeof value !== "string") {
			setFailed(`variable value for key "${key}" must be a string`);
			return;
		}
		const keyString = normalizeEnvKey(key, {
			prefix,
			upcase
		});
		if (keyString in process.env) {
			if (onConflict === "error") {
				setFailed(`Environment variable "${keyString}" already exists`);
				return;
			} else if (onConflict === "overwrite") warning(`Environment variable "${keyString}" already exists, overwriting with new value`);
			else if (onConflict === "preserve") {
				warning(`Environment variable "${keyString}" already exists, preserving existing value`);
				continue;
			}
		}
		exportVariable(keyString, value);
	}
}
main();

//#endregion
export {  };