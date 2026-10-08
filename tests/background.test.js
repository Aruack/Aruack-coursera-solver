const test = require("node:test");
const assert = require("node:assert/strict");

test("migrates a legacy Gemini key and returns normalized answers through messaging", async () => {
  const storage = { userApiKey: "legacy-gemini-key" };
  let messageListener;
  let requestedUrl;

  global.importScripts = () => {
    global.AIProviderKit = require("../ai-providers.js");
  };
  global.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, storage[key]]));
        },
        async set(update) {
          Object.assign(storage, update);
        }
      }
    }
  };
  global.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify({ answers: [{ questionNumber: 1, correctOptions: ["B"] }] }) }]
            }
          }]
        });
      }
    };
  };

  delete require.cache[require.resolve("../background.js")];
  require("../background.js");

  const response = await new Promise((resolve) => {
    const keepChannelOpen = messageListener({
      action: "fetchAIExplanation",
      text: [{ questionNumber: 1, type: "single_answer", question: "Pick B", options: ["A", "B"] }]
    }, {}, resolve);
    assert.equal(keepChannelOpen, true);
  });

  assert.deepEqual(response, {
    result: [{ questionNumber: 1, correctOptions: ["B"] }]
  });
  assert.equal(storage.aiProvider, "gemini");
  assert.equal(storage.aiProviderSettings.gemini.apiKey, "legacy-gemini-key");
  assert.match(requestedUrl, /gemini-3\.7-flash:generateContent$/);
});
