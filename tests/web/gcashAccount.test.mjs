// Tests for the GCash number display helper.
//   node --import ./tests/web/register.mjs --test tests/web/
import { test } from "node:test";
import assert from "node:assert/strict";

import { formatGcashNumber } from "../../src/lib/gcashAccount.ts";

test("an 11-digit number is grouped for reading aloud", () => {
  assert.equal(formatGcashNumber("09171234567"), "0917 123 4567");
});

test("anything else is shown as it is, and empty values are safe", () => {
  assert.equal(formatGcashNumber("12345"), "12345");
  assert.equal(formatGcashNumber(""), "");
  assert.equal(formatGcashNumber(null), "");
  assert.equal(formatGcashNumber(undefined), "");
});
