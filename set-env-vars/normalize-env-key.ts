export function normalizeEnvKey(
  key: string,
  options: { prefix?: string; upcase?: boolean } = {},
): string {
  let keyString = key;
  if (options.prefix) {
    keyString = `${options.prefix}_${keyString}`;
  }
  keyString = keyString
    .replace(/(?<=(?:^|[a-z]))([A-Z])/g, "_$1")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
  if (options.upcase) {
    keyString = keyString.toUpperCase();
  } else {
    keyString = keyString.toLowerCase();
  }
  keyString = keyString.replace(/[^a-zA-Z0-9_]/g, "_");
  keyString = keyString.replace(/_+/g, "_");
  keyString = keyString.replace(/^_|_$/g, "");
  return keyString;
}
