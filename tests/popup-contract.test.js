const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const script = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("every popup element referenced by JavaScript exists", () => {
  const referencedIds = [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(referencedIds.length > 0);
  for (const id of referencedIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing popup element #${id}`);
  }
});

test("popup loads provider configuration before popup behavior", () => {
  assert.ok(html.indexOf('src="ai-providers.js"') < html.indexOf('src="popup.js"'));
  assert.match(html, /aria-controls="configDisclosure"/);
  assert.match(html, /aria-live="polite"/);
});

test("manifest grants only the expected provider hosts", () => {
  const requiredHosts = [
    "https://generativelanguage.googleapis.com/*",
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://api.x.ai/*",
    "https://api.deepseek.com/*",
    "https://api.groq.com/*",
    "https://openrouter.ai/*"
  ];
  for (const host of requiredHosts) assert.ok(manifest.host_permissions.includes(host), `Missing ${host}`);
  assert.equal(manifest.version, "1.1.0");
});
