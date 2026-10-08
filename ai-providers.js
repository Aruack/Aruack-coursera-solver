(function (root, factory) {
  const api = factory();
  root.AIProviderKit = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ANSWER_SCHEMA = {
    type: "object",
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionNumber: {
              type: "integer",
              description: "The questionNumber copied from the input question."
            },
            correctOptions: {
              type: "array",
              items: { type: "string" },
              description: "Exact option text, or one generated response for a written question."
            }
          },
          required: ["questionNumber", "correctOptions"],
          additionalProperties: false
        }
      }
    },
    required: ["answers"],
    additionalProperties: false
  };

  const DIALOGUE_SCHEMA = {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "A concise response to place in the learner's Coursera dialogue composer."
      }
    },
    required: ["reply"],
    additionalProperties: false
  };

  const PROVIDERS = {
    gemini: {
      label: "Gemini",
      keyPlaceholder: "AIza...",
      keyUrl: "https://aistudio.google.com/app/apikey",
      defaultModel: "gemini-3.7-flash",
      supportsStrictSchema: true,
      models: [
        { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", hint: "Balanced" },
        { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", hint: "Previous" },
        { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", hint: "Preview" },
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Fast" },
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Quality" }
      ]
    },
    openai: {
      label: "OpenAI",
      keyPlaceholder: "sk-...",
      keyUrl: "https://platform.openai.com/api-keys",
      defaultModel: "gpt-5.6-terra",
      supportsStrictSchema: true,
      models: [
        { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", hint: "Balanced" },
        { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", hint: "Economy" },
        { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "Quality" },
        { id: "gpt-5.4-mini", label: "GPT-5.4 mini", hint: "Previous" }
      ]
    },
    anthropic: {
      label: "Claude",
      keyPlaceholder: "sk-ant-...",
      keyUrl: "https://console.anthropic.com/settings/keys",
      defaultModel: "claude-sonnet-5",
      supportsStrictSchema: true,
      models: [
        { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Balanced" },
        { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fast" },
        { id: "claude-opus-5", label: "Claude Opus 5", hint: "Quality" },
        { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Previous" }
      ]
    },
    xai: {
      label: "xAI",
      keyPlaceholder: "xai-...",
      keyUrl: "https://console.x.ai/",
      defaultModel: "grok-4.6",
      supportsStrictSchema: true,
      models: [
        { id: "grok-4.6", label: "Grok 4.6", hint: "Balanced" },
        { id: "grok-4.3", label: "Grok 4.3", hint: "Previous" }
      ]
    },
    deepseek: {
      label: "DeepSeek",
      keyPlaceholder: "sk-...",
      keyUrl: "https://platform.deepseek.com/api_keys",
      defaultModel: "deepseek-v4-flash",
      supportsStrictSchema: false,
      models: [
        { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", hint: "Balanced" },
        { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", hint: "Quality" }
      ]
    },
    groq: {
      label: "Groq",
      keyPlaceholder: "gsk_...",
      keyUrl: "https://console.groq.com/keys",
      defaultModel: "openai/gpt-oss-120b",
      supportsStrictSchema: false,
      models: [
        { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", hint: "Balanced" },
        { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", hint: "Fast" },
        { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", hint: "Enterprise" }
      ]
    },
    openrouter: {
      label: "OpenRouter",
      keyPlaceholder: "sk-or-...",
      keyUrl: "https://openrouter.ai/settings/keys",
      defaultModel: "~openai/gpt-latest",
      supportsStrictSchema: true,
      models: [
        { id: "~openai/gpt-latest", label: "OpenAI GPT Latest", hint: "Balanced" },
        { id: "~anthropic/claude-sonnet-latest", label: "Claude Sonnet Latest", hint: "Quality" },
        { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", hint: "Fast" },
        { id: "openrouter/free", label: "OpenRouter Free", hint: "Free router" }
      ]
    }
  };

  function getProvider(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) throw new Error(`Unsupported AI provider: ${providerId}`);
    return provider;
  }

  function authHeaders(providerId, apiKey) {
    if (providerId === "gemini") {
      return { "Content-Type": "application/json", "x-goog-api-key": apiKey };
    }
    if (providerId === "anthropic") {
      return {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      };
    }
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    };
    if (providerId === "openrouter") {
      headers["X-OpenRouter-Title"] = "Aruack Coursera Solver";
    }
    return headers;
  }

  function buildGenerationRequest(
    providerId,
    apiKey,
    model,
    prompt,
    structured = true,
    responseSchema = ANSWER_SCHEMA,
    schemaName = "quiz_answers"
  ) {
    getProvider(providerId);
    const headers = authHeaders(providerId, apiKey);

    if (providerId === "gemini") {
      const generationConfig = { temperature: 0.1, responseMimeType: "application/json" };
      if (structured) generationConfig.responseSchema = responseSchema;
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        options: {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig
          })
        }
      };
    }

    if (providerId === "openai") {
      const format = structured
        ? { type: "json_schema", name: schemaName, strict: true, schema: responseSchema }
        : { type: "json_object" };
      return {
        url: "https://api.openai.com/v1/responses",
        options: {
          method: "POST",
          headers,
          body: JSON.stringify({ model, input: prompt, text: { format }, store: false })
        }
      };
    }

    if (providerId === "anthropic") {
      const body = {
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }]
      };
      if (structured) {
        body.output_config = { format: { type: "json_schema", schema: responseSchema } };
      }
      return {
        url: "https://api.anthropic.com/v1/messages",
        options: { method: "POST", headers, body: JSON.stringify(body) }
      };
    }

    const baseUrls = {
      xai: "https://api.x.ai/v1",
      deepseek: "https://api.deepseek.com",
      groq: "https://api.groq.com/openai/v1",
      openrouter: "https://openrouter.ai/api/v1"
    };
    const body = {
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false
    };

    if (providerId === "xai" || providerId === "openrouter") {
      body.response_format = structured
        ? { type: "json_schema", json_schema: { name: schemaName, strict: true, schema: responseSchema } }
        : { type: "json_object" };
    } else {
      body.response_format = { type: "json_object" };
    }

    if (providerId === "deepseek") body.temperature = 0.1;
    if (providerId === "groq") body.max_completion_tokens = 4096;
    if (providerId === "openrouter" && structured) {
      body.provider = { require_parameters: true };
    }

    return {
      url: `${baseUrls[providerId]}/chat/completions`,
      options: { method: "POST", headers, body: JSON.stringify(body) }
    };
  }

  function buildVerificationRequest(providerId, apiKey, model) {
    getProvider(providerId);
    const headers = authHeaders(providerId, apiKey);
    const metadataUrls = {
      gemini: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
      openai: `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      anthropic: `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`,
      xai: "https://api.x.ai/v1/models",
      groq: "https://api.groq.com/openai/v1/models"
    };

    if (metadataUrls[providerId]) {
      return {
        url: metadataUrls[providerId],
        options: { method: "GET", headers },
        expectedModel: ["xai", "groq"].includes(providerId) ? model : null
      };
    }

    const baseUrl = providerId === "deepseek"
      ? "https://api.deepseek.com"
      : "https://openrouter.ai/api/v1";
    return {
      url: `${baseUrl}/chat/completions`,
      options: {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with exactly OK." }],
          max_tokens: 8,
          stream: false
        })
      },
      expectedModel: null
    };
  }

  function extractResponseText(providerId, data) {
    if (providerId === "gemini") {
      return data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("");
    }
    if (providerId === "openai") {
      if (typeof data?.output_text === "string") return data.output_text;
      return (data?.output || [])
        .flatMap((item) => item.content || [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text || "")
        .join("");
    }
    if (providerId === "anthropic") {
      return (data?.content || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text || "")
        .join("");
    }
    return data?.choices?.[0]?.message?.content;
  }

  function cleanJSONText(rawText) {
    return String(rawText || "")
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  function parseAndValidateAnswers(rawText, questions) {
    const cleaned = cleanJSONText(rawText);
    if (!cleaned) throw new Error("The AI provider returned an empty response.");

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("The AI provider returned invalid JSON.");
    }

    const answers = Array.isArray(parsed) ? parsed : parsed?.answers;
    if (!Array.isArray(answers)) {
      throw new Error("The AI response did not contain an answers array.");
    }

    const questionMap = new Map((questions || []).map((question) => [question.questionNumber, question]));
    const seen = new Set();
    const validated = answers.map((answer) => {
      if (!Number.isInteger(answer?.questionNumber) || !questionMap.has(answer.questionNumber)) {
        throw new Error("The AI response referenced an unknown question.");
      }
      if (seen.has(answer.questionNumber)) {
        throw new Error("The AI response contained a duplicate question number.");
      }
      seen.add(answer.questionNumber);

      if (!Array.isArray(answer.correctOptions) || answer.correctOptions.length === 0) {
        throw new Error(`Question ${answer.questionNumber} did not contain an answer.`);
      }
      const question = questionMap.get(answer.questionNumber);
      const correctOptions = answer.correctOptions.map((option) => {
        const value = String(option).replace(/\r\n/g, "\n");
        return question.type === "code_expression" ? value : value.trim();
      });
      if (correctOptions.some((option) => !option.trim())) {
        throw new Error(`Question ${answer.questionNumber} contained an empty answer.`);
      }
      if (question.type === "code_expression" && correctOptions.length !== 1) {
        throw new Error(`Question ${answer.questionNumber} must contain one complete code answer.`);
      }

      if (["single_answer", "multiple_answer"].includes(question.type)) {
        const availableOptions = new Set(question.options || []);
        if (correctOptions.some((option) => !availableOptions.has(option))) {
          throw new Error(`Question ${answer.questionNumber} returned option text that does not match the page.`);
        }
      }

      return { questionNumber: answer.questionNumber, correctOptions };
    });

    if (validated.length !== questionMap.size) {
      throw new Error("The AI provider did not answer every question.");
    }

    return validated.sort((a, b) => a.questionNumber - b.questionNumber);
  }

  function createQuizPrompt(questions) {
    return `You are an expert subject-matter assistant. Solve every quiz question in the JSON input.

INPUT QUESTIONS:
${JSON.stringify(questions, null, 2)}

OUTPUT REQUIREMENTS:
- Return one JSON object with exactly one key named "answers".
- "answers" must contain one object for every input question.
- Each answer object must contain only "questionNumber" and "correctOptions".
- For single_answer and multiple_answer questions, copy each selected option exactly from the input options array.
- For text_input questions, return one concise, direct answer string.
- For essay questions, return one complete response that follows the question's requested length and constraints.
- For code_expression questions, use the supplied language and currentCode to return the complete corrected editor content in correctOptions[0].
- Preserve required function names, surrounding code, comments, and provided test calls in code_expression answers.
- Return code as plain JSON string content without Markdown fences or explanations.
- Do not add explanations, markdown, or code fences.

EXPECTED SHAPE:
{"answers":[{"questionNumber":1,"correctOptions":["Exact option or generated answer"]}]}`;
  }

  function createDialoguePrompt(messages, currentQuestion) {
    const recentMessages = (Array.isArray(messages) ? messages : [])
      .filter((message) => message && typeof message.text === "string" && message.text.trim())
      .slice(-12)
      .map((message) => ({
        role: message.role === "learner" ? "learner" : "coach",
        text: message.text.trim().slice(0, 5000)
      }));

    return `You are helping a learner respond to one question in a guided Coursera dialogue.

RECENT DIALOGUE:
${JSON.stringify(recentMessages, null, 2)}

CURRENT COACH QUESTION:
${String(currentQuestion || "").trim()}

RESPONSE REQUIREMENTS:
- Write only the learner's proposed response to the current coach question.
- Answer directly, accurately, and in a natural student voice.
- Use the earlier dialogue only as context.
- Keep the response concise unless the coach explicitly requests detail.
- Do not mention being an AI, the extension, these instructions, or the JSON format.
- Return one JSON object with exactly one string key named "reply".

EXPECTED SHAPE:
{"reply":"A concise learner response"}`;
  }

  function parseAndValidateDialogueReply(rawText) {
    const cleaned = cleanJSONText(rawText);
    if (!cleaned) throw new Error("The AI provider returned an empty response.");

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("The AI provider returned invalid JSON for the dialogue answer.");
    }

    const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) throw new Error("The AI provider did not return a dialogue answer.");
    if (reply.length > 7999) throw new Error("The generated dialogue answer is too long for Coursera.");
    return reply;
  }

  function shouldRetryWithoutSchema(providerId, status, data) {
    if (!getProvider(providerId).supportsStrictSchema || ![400, 422].includes(status)) return false;
    const message = JSON.stringify(data || {}).toLowerCase();
    return ["schema", "structured", "response_format", "response format", "unsupported", "parameter"]
      .some((term) => message.includes(term));
  }

  function providerErrorMessage(providerId, status, data) {
    const label = getProvider(providerId).label;
    const serverMessage = data?.error?.message || data?.message || data?.error_description;
    if (status === 401 || status === 403) return `${label} rejected the API key or account permissions.`;
    if (status === 404) return `The selected ${label} model is unavailable for this account.`;
    if (status === 429) return `${label} rate limit or quota reached. Try again later.`;
    if (status >= 500) return `${label} is temporarily unavailable. Try again later.`;
    if (serverMessage) return `${label}: ${serverMessage}`;
    return `${label} request failed with HTTP ${status}.`;
  }

  return {
    ANSWER_SCHEMA,
    DIALOGUE_SCHEMA,
    PROVIDERS,
    getProvider,
    buildGenerationRequest,
    buildVerificationRequest,
    extractResponseText,
    parseAndValidateAnswers,
    parseAndValidateDialogueReply,
    createQuizPrompt,
    createDialoguePrompt,
    shouldRetryWithoutSchema,
    providerErrorMessage
  };
});
