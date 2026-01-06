import * as core from "./actions-core.ts";
import { normalizeEnvKey } from "./normalize-env-key.ts";

function main() {
  const variablesInput = core.getInput("variables");
  let variables: Record<string, string> | undefined;
  try {
    variables = JSON.parse(variablesInput);
  } catch (_error) {}
  if (!variables || typeof variables !== "object") {
    core.setFailed("variables input must be a valid JSON object");
    return;
  }

  let prefix = core.getInput("prefix") || "";
  let upcase = core.getInput("upcase") === "true";
  let onConflict = core.getInput("on-conflict") || "overwrite";
  if (!["overwrite", "preserve", "error"].includes(onConflict)) {
    core.setFailed(
      "on-conflict input must be one of: overwrite, preserve, error",
    );
    return;
  }

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== "string") {
      core.setFailed(`variable value for key "${key}" must be a string`);
      return;
    }
    const keyString = normalizeEnvKey(key, { prefix, upcase });
    if (keyString in process.env) {
      if (onConflict === "error") {
        core.setFailed(`Environment variable "${keyString}" already exists`);
        return;
      } else if (onConflict === "overwrite") {
        core.warning(
          `Environment variable "${keyString}" already exists, overwriting with new value`,
        );
      } else if (onConflict === "preserve") {
        core.warning(
          `Environment variable "${keyString}" already exists, preserving existing value`,
        );
        continue;
      }
    }
    core.exportVariable(keyString, value);
  }
}

main();
