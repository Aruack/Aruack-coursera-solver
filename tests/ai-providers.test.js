const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROVIDERS,
  buildGenerationRequest,
  buildVerificationRequest,
  extractResponseText,
  parseAndValidateAnswers,
  shouldRetryWithoutSchema
} = require("../ai-providers.js");

const apiKey = "test-secret";
const prompt = "Return JSON.";

test("registers the seven supported providers", () => {
  assert.deepEqual(Object.keys(PROVIDERS), [
    "gemini",
    "openai",
    "anthropic",
    "xai",
    "deepseek",
    "groq",
    "openrouter"
  ]);
});

test("builds authenticated generation requests for every provider", () => {
  for (const [providerId, provider] of Object.entries(PROVIDERS)) {
    const request = buildGenerationRequest(providerId, apiKey, provider.defaultModel, prompt, true);
    const body = JSON.parse(request.options.body);

    assert.equal(request.options.method, "POST");
    assert.equal(body.model || provider.defaultModel, provider.defaultModel);
    assert.ok(request.url.startsWith("https://"));
    assert.ok(
      request.options.headers.Authorization === `Bearer ${apiKey}` ||
      request.options.headers["x-goog-api-key"] === apiKey ||
      request.options.headers["x-api-key"] === apiKey
    );
  }
});

test("uses the OpenAI Responses API with strict JSON Schema", () => {
  const request = buildGenerationRequest("openai", apiKey, "gpt-5.6-terra", prompt, true);
  const body = JSON.parse(request.options.body);

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.store, false);
});

test("uses provider-specific response extractors", () => {
  assert.equal(extractResponseText("gemini", {
    candidates: [{ content: { parts: [{ text: "{\"answers\":[]}" }] } }]
  }), "{\"answers\":[]}");

  assert.equal(extractResponseText("openai", {
    output: [{ content: [{ type: "output_text", text: "openai" }] }]
  }), "openai");

  assert.equal(extractResponseText("anthropic", {
    content: [{ type: "text", text: "claude" }]
  }), "claude");

  assert.equal(extractResponseText("groq", {
    choices: [{ message: { content: "groq" } }]
  }), "groq");
});

test("normalizes and validates structured quiz answers", () => {
  const questions = [
    { questionNumber: 1, type: "single_answer", options: ["A", "B"] },
    { questionNumber: 2, type: "text_input", options: [] }
  ];
  const raw = "```json\n{\"answers\":[{\"questionNumber\":2,\"correctOptions\":[\"Response\"]},{\"questionNumber\":1,\"correctOptions\":[\"B\"]}]}\n```";

  assert.deepEqual(parseAndValidateAnswers(raw, questions), [
    { questionNumber: 1, correctOptions: ["B"] },
    { questionNumber: 2, correctOptions: ["Response"] }
  ]);
});

test("accepts the legacy top-level answer array", () => {
  const questions = [{ questionNumber: 1, type: "single_answer", options: ["A"] }];
  const raw = JSON.stringify([{ questionNumber: 1, correctOptions: ["A"] }]);
  assert.deepEqual(parseAndValidateAnswers(raw, questions), [
    { questionNumber: 1, correctOptions: ["A"] }
  ]);
});

test("rejects option text that does not exist on the page", () => {
  const questions = [{ questionNumber: 1, type: "multiple_answer", options: ["A", "B"] }];
  const raw = JSON.stringify({ answers: [{ questionNumber: 1, correctOptions: ["C"] }] });
  assert.throws(() => parseAndValidateAnswers(raw, questions), /does not match the page/);
});

test("rejects partial, duplicate, and malformed answers", () => {
  const questions = [
    { questionNumber: 1, type: "text_input", options: [] },
    { questionNumber: 2, type: "text_input", options: [] }
  ];

  assert.throws(
    () => parseAndValidateAnswers(JSON.stringify({ answers: [{ questionNumber: 1, correctOptions: ["A"] }] }), questions),
    /did not answer every question/
  );
  assert.throws(
    () => parseAndValidateAnswers(JSON.stringify({ answers: [
      { questionNumber: 1, correctOptions: ["A"] },
      { questionNumber: 1, correctOptions: ["B"] }
    ] }), questions),
    /duplicate question number/
  );
  assert.throws(() => parseAndValidateAnswers("not-json", questions), /invalid JSON/);
});

test("falls back only for structured-output compatibility errors", () => {
  assert.equal(shouldRetryWithoutSchema("openai", 400, { error: { message: "Unsupported json_schema" } }), true);
  assert.equal(shouldRetryWithoutSchema("openai", 401, { error: { message: "Invalid key" } }), false);
  assert.equal(shouldRetryWithoutSchema("deepseek", 400, { error: { message: "Unsupported schema" } }), false);
});

test("builds low-cost verification requests", () => {
  const openAI = buildVerificationRequest("openai", apiKey, "gpt-5.6-terra");
  assert.equal(openAI.options.method, "GET");
  assert.match(openAI.url, /\/v1\/models\/gpt-5.6-terra$/);

  const xAI = buildVerificationRequest("xai", apiKey, "grok-4.6");
  assert.equal(xAI.options.method, "GET");
  assert.equal(xAI.url, "https://api.x.ai/v1/models");
  assert.equal(xAI.expectedModel, "grok-4.6");

  const deepSeek = buildVerificationRequest("deepseek", apiKey, "deepseek-v4-flash");
  const body = JSON.parse(deepSeek.options.body);
  assert.equal(deepSeek.options.method, "POST");
  assert.equal(body.max_tokens, 8);
});
