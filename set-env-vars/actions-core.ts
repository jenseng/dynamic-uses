import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";

// minimal functionality from @actions/core, since its dist isn't amenable to treeshaking
// see https://github.com/actions/toolkit/pull/2122

type InputOptions = {
  /** Optional. Whether the input is required. If required and not present, will throw. Defaults to false */
  required?: boolean;
  /** Optional. Whether leading/trailing whitespace will be trimmed for the input. Defaults to true */
  trimWhitespace?: boolean;
};

export function getInput(name: string, options?: InputOptions): string {
  const val =
    process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "";
  if (options?.required && !val)
    throw new Error(`Input required and not supplied: ${name}`);
  if (options?.trimWhitespace === false) return val;
  return val.trim();
}

export function getMultilineInput(
  name: string,
  options?: InputOptions,
): string[] {
  const inputs = getInput(name, options)
    .split("\n")
    .filter((x) => x !== "");
  if (options?.trimWhitespace === false) return inputs;
  return inputs.map((input) => input.trim());
}

export function getBooleanInput(name: string, options?: InputOptions): boolean {
  const trueValue = ["true", "True", "TRUE"];
  const falseValue = ["false", "False", "FALSE"];
  const val = getInput(name, options);
  if (trueValue.includes(val)) return true;
  if (falseValue.includes(val)) return false;
  throw new TypeError(
    `Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
      `Support boolean input list: \`true | True | TRUE | false | False | FALSE\``,
  );
}

export function setOutput(name: string, value: unknown): void {
  const filePath = process.env["GITHUB_OUTPUT"] || "";
  if (filePath) {
    return issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
  }
  process.stdout.write(os.EOL);
  issueCommand("set-output", { name }, toCommandValue(value));
}

export function setCommandEcho(enabled: boolean): void {
  issue("echo", enabled ? "on" : "off");
}

export function setFailed(message: string): void {
  process.exitCode = 1;
  error(message);
}

function issueCommand(
  command: string,
  properties: Record<string, string>,
  message: string,
): void {
  let cmdStr = "::" + command;
  if (properties && Object.keys(properties).length > 0) {
    cmdStr +=
      " " +
      Object.entries(properties)
        .map(([key, value]) => `${key}=${escapeProperty(value)}`)
        .join(",");
  }
  cmdStr += `::${escapeData(message)}`;
  process.stdout.write(cmdStr + os.EOL);
}

function issue(name: string, message = ""): void {
  issueCommand(name, {}, message);
}

function escapeData(s: unknown): string {
  return toCommandValue(s)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}
function escapeProperty(s: unknown): string {
  return toCommandValue(s)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function toCommandValue(input: unknown): string {
  if (input === null || input === void 0) return "";
  else if (typeof input === "string" || input instanceof String)
    return input.toString();
  return JSON.stringify(input);
}

function issueFileCommand(command: string, message: string): void {
  const filePath = process.env[`GITHUB_${command}`];
  if (!filePath)
    throw new Error(
      `Unable to find environment variable for file command ${command}`,
    );
  if (!fs.existsSync(filePath))
    throw new Error(`Missing file at path: ${filePath}`);
  fs.appendFileSync(filePath, `${toCommandValue(message)}${os.EOL}`, {
    encoding: "utf8",
  });
}

function prepareKeyValueMessage(key: string, value: unknown): string {
  const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
  const convertedValue = toCommandValue(value);
  if (key.includes(delimiter))
    throw new Error(
      `Unexpected input: name should not contain the delimiter "${delimiter}"`,
    );
  if (convertedValue.includes(delimiter))
    throw new Error(
      `Unexpected input: value should not contain the delimiter "${delimiter}"`,
    );
  return `${key}<<${delimiter}${os.EOL}${convertedValue}${os.EOL}${delimiter}`;
}

export function debug(message: string): void {
  issueCommand("debug", {}, message);
}

export function error(
  message: string,
  properties?: Record<string, string>,
): void {
  issueCommand("error", properties || {}, message);
}

export function warning(
  message: string,
  properties?: Record<string, string>,
): void {
  issueCommand("warning", properties || {}, message);
}

export function notice(
  message: string,
  properties?: Record<string, string>,
): void {
  issueCommand("notice", properties || {}, message);
}

export function info(message: string): void {
  process.stdout.write(`${message}${os.EOL}`);
}

export function exportVariable(name: string, value: unknown): void {
  const convertedValue = toCommandValue(value);
  process.env[name] = convertedValue;
  if (process.env["GITHUB_ENV"] || "")
    return issueFileCommand("ENV", prepareKeyValueMessage(name, value));
  issueCommand("set-env", { name }, convertedValue);
}

export function setSecret(secret: string): void {
  issueCommand("add-mask", {}, secret);
}

export function startGroup(name: string): void {
  issue("group", name);
}

export function endGroup(): void {
  issue("endgroup");
}

export function group<T>(name: string, fn: () => Promise<T>): Promise<T> {
  startGroup(name);
  try {
    return fn();
  } finally {
    endGroup();
  }
}

function saveState(name: string, value: unknown): void {
  const filePath = process.env["GITHUB_STATE"] || "";
  if (filePath) {
    return issueFileCommand("STATE", prepareKeyValueMessage(name, value));
  }
  issueCommand("save-state", { name }, toCommandValue(value));
}

export function getState(name: string): string {
  return process.env[`STATE_${name}`] || "";
}
