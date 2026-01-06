import test from "node:test";
import assert from "node:assert";
import { normalizeEnvKey } from "./normalize-env-key.ts";

test("normalizeEnvKey", () => {
  assert.equal(normalizeEnvKey("foo"), "foo");
  assert.equal(normalizeEnvKey("FOO"), "foo");
  assert.equal(normalizeEnvKey("foo", { upcase: true }), "FOO");
  assert.equal(normalizeEnvKey("foo", { prefix: "bar" }), "bar_foo");
  assert.equal(
    normalizeEnvKey("foo", { upcase: true, prefix: "bar" }),
    "BAR_FOO",
  );
  assert.equal(
    normalizeEnvKey("😅helloWorld.LolHAHAOkay!"),
    "hello_world_lol_haha_okay",
  );
  assert.equal(
    normalizeEnvKey("😅helloWorld.LolHAHAOkay!", { upcase: true }),
    "HELLO_WORLD_LOL_HAHA_OKAY",
  );
});
