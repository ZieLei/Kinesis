import test from "node:test";
import assert from "node:assert/strict";

// themePreference.ts imports "@/lib/deviceCache"; load it with an in-memory
// cache standing in for localStorage / SecureStore.
const store = new Map();
globalThis.__cache = {
  getItem: async (k) => store.get(k) ?? null,
  setItem: async (k, v) => void store.set(k, v),
  removeItem: async (k) => void store.delete(k),
};

const source = await (await import("node:fs/promises")).readFile(
  new URL("../../src/lib/themePreference.ts", import.meta.url),
  "utf8",
);

// Strip the type syntax and the import so the module body can run in node.
const js = source
  .replace(/^import .*$/m, "const deviceCache = globalThis.__cache;")
  .replace(/export type .*;\n/g, "")
  .replace(/: Promise<[^>]*>/g, "")
  .replace(/\(\s*theme: ThemePreference,?\s*\)/g, "(theme)")
  .replace(/: ThemePreference/g, "")
  .replace(/export async function/g, "async function");

const { loadThemePreference, saveThemePreference } = new Function(
  `${js}; return { loadThemePreference, saveThemePreference };`,
)();

test("nothing saved yet", async () => {
  assert.equal(await loadThemePreference(), null);
});

test("saved choice survives a reload", async () => {
  await saveThemePreference("light");
  assert.equal(await loadThemePreference(), "light");
  await saveThemePreference("dark");
  assert.equal(await loadThemePreference(), "dark");
});

test("garbage in storage is ignored", async () => {
  store.set("kinesis.theme", "purple");
  assert.equal(await loadThemePreference(), null);
});
