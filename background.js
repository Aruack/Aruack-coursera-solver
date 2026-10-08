importScripts("ai-providers.js");

const {
  ANSWER_SCHEMA,
  DIALOGUE_SCHEMA,
  PROVIDERS,
  buildGenerationRequest,
  buildVerificationRequest,
  createDialoguePrompt,
  createQuizPrompt,
  extractResponseText,
  parseAndValidateAnswers,
  parseAndValidateDialogueReply,
  providerErrorMessage,
  shouldRetryWithoutSchema
} = globalThis.AIProviderKit;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchAIExplanation") {
    getAIResponse(request.text)
      .then((answers) => sendResponse({ result: answers }))
      .catch((error) => sendResponse({ error: error.message || "Failed to fetch from AI." }));
    return true;
  }

  if (request.action === "fetchDialogueAnswer") {
    getDialogueResponse(request.messages, request.currentQuestion)
      .then((reply) => sendResponse({ result: reply }))
      .catch((error) => sendResponse({ error: error.message || "Failed to draft the dialogue answer." }));
    return true;
  }

  if (request.action === "verifyAIProvider") {
    verifyAIProvider(request.provider, request.apiKey, request.model)
      .then((message) => sendResponse({ ok: true, message }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Connection check failed." }));
    return true;
  }
});

async function loadAIConfiguration() {
  const stored = await chrome.storage.local.get([
    "aiProvider",
    "aiProviderSettings",
    "userApiKey"
  ]);

  const settings = stored.aiProviderSettings && typeof stored.aiProviderSettings === "object"
    ? { ...stored.aiProviderSettings }
    : {};

  let migrated = false;
  if (stored.userApiKey && !settings.gemini?.apiKey) {
    settings.gemini = {
      apiKey: stored.userApiKey,
      model: PROVIDERS.gemini.defaultModel
    };
    migrated = true;
  }

  const providerId = PROVIDERS[stored.aiProvider] ? stored.aiProvider : "gemini";
  const providerSettings = settings[providerId] || {};
  const configuration = {
    providerId,
    apiKey: providerSettings.apiKey || "",
    model: providerSettings.model || PROVIDERS[providerId].defaultModel
  };

  if (migrated) {
    await chrome.storage.local.set({ aiProviderSettings: settings, aiProvider: providerId });
  }

  return configuration;
}

async function getAIResponse(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("No quiz questions were provided to the AI service.");
  }

  const { providerId, apiKey, model } = await loadAIConfiguration();
  if (!apiKey) {
    throw new Error(`Add and verify a ${PROVIDERS[providerId].label} API key in the extension popup.`);
  }

  const prompt = createQuizPrompt(questions);
  const rawText = await callProvider(providerId, apiKey, model, prompt, ANSWER_SCHEMA, "quiz_answers");
  return parseAndValidateAnswers(rawText, questions);
}

async function getDialogueResponse(messages, currentQuestion) {
  if (!currentQuestion || !String(currentQuestion).trim()) {
    throw new Error("No active Coursera dialogue question was found.");
  }

  const { providerId, apiKey, model } = await loadAIConfiguration();
  if (!apiKey) {
    throw new Error(`Add and verify a ${PROVIDERS[providerId].label} API key in the extension popup.`);
  }

  const prompt = createDialoguePrompt(messages, currentQuestion);
  const rawText = await callProvider(providerId, apiKey, model, prompt, DIALOGUE_SCHEMA, "dialogue_reply");
  return parseAndValidateDialogueReply(rawText);
}

async function callProvider(providerId, apiKey, model, prompt, responseSchema, schemaName) {
  const provider = PROVIDERS[providerId];
  const structured = provider.supportsStrictSchema;
  let result = await requestJSON(buildGenerationRequest(
    providerId,
    apiKey,
    model,
    prompt,
    structured,
    responseSchema,
    schemaName
  ));

  if (!result.response.ok && structured && shouldRetryWithoutSchema(providerId, result.response.status, result.data)) {
    result = await requestJSON(buildGenerationRequest(
      providerId,
      apiKey,
      model,
      prompt,
      false,
      responseSchema,
      schemaName
    ));
  }

  if (!result.response.ok) {
    throw new Error(providerErrorMessage(providerId, result.response.status, result.data));
  }

  const rawText = extractResponseText(providerId, result.data);
  if (!rawText) {
    throw new Error(`${provider.label} returned an empty or unsupported response.`);
  }
  return rawText;
}

async function verifyAIProvider(providerId, apiKey, model) {
  if (!PROVIDERS[providerId]) throw new Error("Choose a supported AI provider.");
  if (!apiKey || !String(apiKey).trim()) throw new Error("Enter an API key first.");
  if (!model || !String(model).trim()) throw new Error("Choose or enter a model first.");

  const spec = buildVerificationRequest(providerId, String(apiKey).trim(), String(model).trim());
  const result = await requestJSON(spec);

  if (!result.response.ok) {
    throw new Error(providerErrorMessage(providerId, result.response.status, result.data));
  }

  if (spec.expectedModel) {
    const availableModels = Array.isArray(result.data?.data) ? result.data.data : [];
    if (!availableModels.some((item) => item.id === spec.expectedModel)) {
      throw new Error(`The selected ${PROVIDERS[providerId].label} model is unavailable for this account.`);
    }
  }

  return `${PROVIDERS[providerId].label} is connected.`;
}

async function requestJSON(spec) {
  let response;
  try {
    response = await fetch(spec.url, spec.options);
  } catch {
    const provider = Object.keys(PROVIDERS).find((id) => spec.url.includes(providerHostFragment(id)));
    const label = provider ? PROVIDERS[provider].label : "AI provider";
    throw new Error(`Could not reach ${label}. Check your connection and try again.`);
  }

  const rawBody = await response.text();
  let data = {};
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = { message: rawBody.slice(0, 300) };
    }
  }
  return { response, data };
}

function providerHostFragment(providerId) {
  return {
    gemini: "generativelanguage.googleapis.com",
    openai: "api.openai.com",
    anthropic: "api.anthropic.com",
    xai: "api.x.ai",
    deepseek: "api.deepseek.com",
    groq: "api.groq.com",
    openrouter: "openrouter.ai"
  }[providerId];
}
