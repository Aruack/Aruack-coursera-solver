const { PROVIDERS } = globalThis.AIProviderKit;

const elements = {
  configToggle: document.getElementById("configToggle"),
  configDisclosure: document.getElementById("configDisclosure"),
  providerSignal: document.getElementById("providerSignal"),
  activeConfigLabel: document.getElementById("activeConfigLabel"),
  configBadge: document.getElementById("configBadge"),
  providerSelect: document.getElementById("providerSelect"),
  modelSelect: document.getElementById("modelSelect"),
  customModelField: document.getElementById("customModelField"),
  customModelInput: document.getElementById("customModelInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  toggleVisibilityBtn: document.getElementById("toggleVisibilityBtn"),
  saveBtn: document.getElementById("saveBtn"),
  clearKeyBtn: document.getElementById("clearKeyBtn"),
  configStatus: document.getElementById("configStatus"),
  getKeyLink: document.getElementById("getKeyLink"),
  explainBtn: document.getElementById("explainBtn"),
  dialogueBtn: document.getElementById("dialogueBtn"),
  showQuestionsBtn: document.getElementById("showQuestionsBtn"),
  getGradedLinksBtn: document.getElementById("getGradedLinksBtn"),
  completeVideosBtn: document.getElementById("completeVideosBtn"),
  result: document.getElementById("result")
};

let providerSettings = {};
let activeProviderId = "gemini";
let editingProviderId = "gemini";

elements.explainBtn.disabled = true;
elements.dialogueBtn.disabled = true;

function setConfigOpen(open) {
  elements.configToggle.setAttribute("aria-expanded", String(open));
  elements.configDisclosure.classList.toggle("open", open);
}

function setConfigStatus(message = "", type = "default") {
  elements.configStatus.textContent = message;
  elements.configStatus.className = "config-status";
  if (type !== "default") elements.configStatus.classList.add(type);
}

function setButtonLoading(button, loading, loadingText, defaultText) {
  button.disabled = loading;
  button.innerHTML = loading ? `<span class="spinner" aria-hidden="true"></span>${loadingText}` : defaultText;
}

function showResult(message, type = "default") {
  elements.result.replaceChildren();
  elements.result.textContent = message;
  elements.result.className = type === "default" ? "" : type;
  elements.result.style.display = "block";
}

function hideResult() {
  elements.result.style.display = "none";
  elements.result.className = "";
  elements.result.replaceChildren();
}

function modelDisplayName(providerId, modelId) {
  const provider = PROVIDERS[providerId];
  return provider.models.find((model) => model.id === modelId)?.label || modelId || provider.defaultModel;
}

function renderProviderOptions() {
  elements.providerSelect.replaceChildren();
  Object.entries(PROVIDERS).forEach(([id, provider]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = provider.label;
    elements.providerSelect.appendChild(option);
  });
}

function renderModelOptions(providerId, selectedModel) {
  const provider = PROVIDERS[providerId];
  elements.modelSelect.replaceChildren();

  provider.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.label} — ${model.hint}`;
    elements.modelSelect.appendChild(option);
  });

  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "Custom model ID…";
  elements.modelSelect.appendChild(customOption);

  const isPreset = provider.models.some((model) => model.id === selectedModel);
  elements.modelSelect.value = isPreset ? selectedModel : "__custom__";
  elements.customModelField.hidden = isPreset;
  elements.customModelInput.value = isPreset ? "" : selectedModel;
}

function loadProviderForm(providerId) {
  const provider = PROVIDERS[providerId];
  const settings = providerSettings[providerId] || {};
  editingProviderId = providerId;

  elements.providerSelect.value = providerId;
  elements.apiKeyInput.type = "password";
  elements.toggleVisibilityBtn.setAttribute("aria-label", "Show API key");
  elements.toggleVisibilityBtn.setAttribute("title", "Show API key");
  elements.apiKeyInput.placeholder = provider.keyPlaceholder;
  elements.apiKeyInput.value = settings.apiKey || "";
  elements.getKeyLink.href = provider.keyUrl;
  elements.clearKeyBtn.disabled = !settings.apiKey;
  renderModelOptions(providerId, settings.model || provider.defaultModel);
  setConfigStatus();
}

function selectedModel() {
  if (elements.modelSelect.value === "__custom__") {
    return elements.customModelInput.value.trim();
  }
  return elements.modelSelect.value;
}

function updateActiveSummary() {
  const provider = PROVIDERS[activeProviderId] || PROVIDERS.gemini;
  const settings = providerSettings[activeProviderId] || {};
  const hasKey = Boolean(settings.apiKey);
  const isVerified = Boolean(settings.verifiedAt);
  const model = settings.model || provider.defaultModel;

  elements.activeConfigLabel.textContent = `${provider.label} · ${modelDisplayName(activeProviderId, model)}`;
  elements.providerSignal.className = "provider-signal";
  elements.configBadge.className = "status-badge";

  if (isVerified) {
    elements.providerSignal.classList.add("ready");
    elements.configBadge.classList.add("ready");
    elements.configBadge.textContent = "Ready";
  } else if (hasKey) {
    elements.providerSignal.classList.add("saved");
    elements.configBadge.classList.add("saved");
    elements.configBadge.textContent = "Saved";
  } else {
    elements.configBadge.textContent = "Needs setup";
  }

  elements.explainBtn.disabled = !hasKey;
  elements.explainBtn.title = hasKey ? "" : "Configure an AI provider first";
  elements.dialogueBtn.disabled = !hasKey;
  elements.dialogueBtn.title = hasKey ? "" : "Configure an AI provider first";
}

async function initializeProviderSettings() {
  const stored = await chrome.storage.local.get(["aiProvider", "aiProviderSettings", "userApiKey"]);
  providerSettings = stored.aiProviderSettings && typeof stored.aiProviderSettings === "object"
    ? { ...stored.aiProviderSettings }
    : {};

  if (stored.userApiKey && !providerSettings.gemini?.apiKey) {
    providerSettings.gemini = {
      apiKey: stored.userApiKey,
      model: PROVIDERS.gemini.defaultModel
    };
    await chrome.storage.local.set({ aiProviderSettings: providerSettings });
  }

  activeProviderId = PROVIDERS[stored.aiProvider] ? stored.aiProvider : "gemini";
  await chrome.storage.local.set({ aiProvider: activeProviderId });
  renderProviderOptions();
  loadProviderForm(activeProviderId);
  updateActiveSummary();
  setConfigOpen(!providerSettings[activeProviderId]?.apiKey);
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab was found.");
  return tab;
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

elements.configToggle.addEventListener("click", () => {
  setConfigOpen(elements.configToggle.getAttribute("aria-expanded") !== "true");
});

elements.providerSelect.addEventListener("change", () => {
  loadProviderForm(elements.providerSelect.value);
});

elements.modelSelect.addEventListener("change", () => {
  const isCustom = elements.modelSelect.value === "__custom__";
  elements.customModelField.hidden = !isCustom;
  if (isCustom) elements.customModelInput.focus();
});

elements.toggleVisibilityBtn.addEventListener("click", () => {
  const willShow = elements.apiKeyInput.type === "password";
  elements.apiKeyInput.type = willShow ? "text" : "password";
  const label = willShow ? "Hide API key" : "Show API key";
  elements.toggleVisibilityBtn.setAttribute("aria-label", label);
  elements.toggleVisibilityBtn.setAttribute("title", label);
});

elements.saveBtn.addEventListener("click", async () => {
  const apiKey = elements.apiKeyInput.value.trim();
  const model = selectedModel();
  const provider = PROVIDERS[editingProviderId];

  if (!apiKey) {
    setConfigStatus("Enter an API key first.", "error");
    elements.apiKeyInput.focus();
    return;
  }
  if (!model) {
    setConfigStatus("Enter a custom model ID first.", "error");
    elements.customModelInput.focus();
    return;
  }

  setButtonLoading(elements.saveBtn, true, "Checking…", "Save &amp; verify");
  elements.clearKeyBtn.disabled = true;
  setConfigStatus(`Checking ${provider.label}…`);

  try {
    const response = await sendRuntimeMessage({
      action: "verifyAIProvider",
      provider: editingProviderId,
      apiKey,
      model
    });

    if (!response?.ok) throw new Error(response?.error || "Connection check failed.");

    providerSettings = {
      ...providerSettings,
      [editingProviderId]: { apiKey, model, verifiedAt: Date.now() }
    };
    const storageUpdate = {
      aiProvider: editingProviderId,
      aiProviderSettings: providerSettings
    };
    if (editingProviderId === "gemini") storageUpdate.userApiKey = apiKey;
    await chrome.storage.local.set(storageUpdate);

    activeProviderId = editingProviderId;
    updateActiveSummary();
    setConfigStatus(response.message || `${provider.label} is connected.`, "success");
    setTimeout(() => setConfigOpen(false), 750);
  } catch (error) {
    setConfigStatus(error.message || "Connection check failed.", "error");
  } finally {
    setButtonLoading(elements.saveBtn, false, "", "Save &amp; verify");
    elements.clearKeyBtn.disabled = !providerSettings[editingProviderId]?.apiKey;
  }
});

elements.clearKeyBtn.addEventListener("click", async () => {
  const nextSettings = { ...providerSettings };
  delete nextSettings[editingProviderId];
  providerSettings = nextSettings;
  await chrome.storage.local.set({ aiProviderSettings: providerSettings });
  if (editingProviderId === "gemini") await chrome.storage.local.remove("userApiKey");

  loadProviderForm(editingProviderId);
  updateActiveSummary();
  setConfigOpen(true);
  setConfigStatus("Saved key cleared.", "success");
});

elements.explainBtn.addEventListener("click", async () => {
  if (!providerSettings[activeProviderId]?.apiKey) {
    setConfigOpen(true);
    showResult("Configure an AI provider before solving a quiz.", "error");
    return;
  }

  setButtonLoading(elements.explainBtn, true, "Starting AI…", "Solve Current Quiz");
  hideResult();
  try {
    const tab = await getActiveTab();
    await sendTabMessage(tab.id, { action: "solveQuizDirectly" });
    showResult(`Solver started with ${PROVIDERS[activeProviderId].label}. You can close this popup while it works.`, "success");
  } catch {
    showResult("Refresh the Coursera page, then try again.", "error");
  } finally {
    setButtonLoading(elements.explainBtn, false, "", "Solve Current Quiz");
    updateActiveSummary();
  }
});

elements.dialogueBtn.addEventListener("click", async () => {
  if (!providerSettings[activeProviderId]?.apiKey) {
    setConfigOpen(true);
    showResult("Configure an AI provider before drafting a dialogue answer.", "error");
    return;
  }

  setButtonLoading(elements.dialogueBtn, true, "Writing answer…", "Fill Dialogue Answer");
  showResult("Reading the current Coursera dialogue…");
  try {
    const tab = await getActiveTab();
    const response = await sendTabMessage(tab.id, { action: "fillDialogueAnswer" });
    if (response?.error) throw new Error(response.error);
    if (response?.status !== "filled") throw new Error("The dialogue answer could not be filled.");
    showResult("Answer added to Coursera. Review it, then click Send.", "success");
  } catch (error) {
    showResult(error.message || "Refresh the Coursera page, then try again.", "error");
  } finally {
    setButtonLoading(elements.dialogueBtn, false, "", "Fill Dialogue Answer");
    updateActiveSummary();
  }
});

elements.completeVideosBtn.addEventListener("click", async () => {
  setButtonLoading(elements.completeVideosBtn, true, "Working…", "Complete Materials");
  hideResult();
  try {
    const tab = await getActiveTab();
    const response = await sendTabMessage(tab.id, { action: "completeVideos" });
    if (response?.status === "started") {
      showResult("Course completion started. Wait for the confirmation on the page.", "success");
    } else if (response?.error) {
      showResult(response.error, "error");
    } else {
      showResult("The completion task did not start. Refresh the course page and try again.", "error");
    }
  } catch {
    showResult("Refresh the Coursera page, then try again.", "error");
  } finally {
    setButtonLoading(elements.completeVideosBtn, false, "", "Complete Materials");
  }
});

function formatRequirementTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function formatWeightPercent(value) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function createRequirementBadge(text, tone) {
  const badge = document.createElement("span");
  badge.className = `requirement-badge ${tone}`;
  badge.textContent = text;
  return badge;
}

function safeCourseRequirementUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "www.coursera.org" && url.pathname.startsWith("/learn/")) {
      return url.href;
    }
  } catch {
    return "";
  }
  return "";
}

elements.getGradedLinksBtn.addEventListener("click", async () => {
  setButtonLoading(elements.getGradedLinksBtn, true, "Finding work…", "Course Requirements");
  showResult("Finding course requirements…");
  try {
    const tab = await getActiveTab();
    const response = await sendTabMessage(tab.id, { action: "getCourseRequirements" });
    if (response?.error) throw new Error(response.error);
    const requirements = Array.isArray(response?.data?.requirements) ? response.data.requirements : [];
    const summary = response?.data?.summary || {};
    if (!requirements.length) {
      showResult("No grade-relevant activities were identified for this course.");
      return;
    }

    elements.result.replaceChildren();
    elements.result.className = "requirements-result";
    elements.result.style.display = "block";

    const heading = document.createElement("div");
    heading.className = "result-heading";
    const headingCopy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${requirements.length} graded activit${requirements.length === 1 ? "y" : "ies"}`;
    const subtitle = document.createElement("span");
    subtitle.className = "requirements-source";
    subtitle.textContent = summary.confirmed ? "Confirmed by Coursera" : "Detected from activity types";
    headingCopy.append(title, subtitle);

    const headingBadges = document.createElement("div");
    headingBadges.className = "requirements-heading-badges";
    if (summary.requiredCount) {
      headingBadges.append(createRequirementBadge(`${summary.requiredCount} required`, "required"));
    }
    if (summary.lockedCount) {
      headingBadges.append(createRequirementBadge(`${summary.lockedCount} locked`, "locked"));
    }
    heading.append(headingCopy, headingBadges);

    const note = document.createElement("p");
    note.className = "requirements-note";
    note.textContent = summary.unresolvedCount || summary.unmappedCount
      ? "Some course requirements could not be fully linked. Completion status and current grade are not included."
      : "Coursera’s materials data does not include your completion status or current grade.";

    const groups = new Map();
    requirements.forEach((requirement) => {
      const moduleName = requirement.moduleName || "Other course work";
      if (!groups.has(moduleName)) groups.set(moduleName, []);
      groups.get(moduleName).push(requirement);
    });

    const groupList = document.createElement("div");
    groupList.className = "requirement-groups";
    groups.forEach((moduleRequirements, moduleName) => {
      const group = document.createElement("section");
      group.className = "requirement-group";

      const groupHeading = document.createElement("div");
      groupHeading.className = "requirement-group-heading";
      const groupTitle = document.createElement("strong");
      groupTitle.textContent = moduleName;
      const groupCount = document.createElement("span");
      groupCount.textContent = `${moduleRequirements.length}`;
      groupHeading.append(groupTitle, groupCount);

      const items = document.createElement("div");
      items.className = "requirement-items";
      moduleRequirements.forEach((requirement) => {
        const link = safeCourseRequirementUrl(requirement.link);
        const row = document.createElement("button");
        row.type = "button";
        row.className = "requirement-row";
        row.disabled = !link;
        row.setAttribute(
          "aria-label",
          link ? `Open ${requirement.name}` : `${requirement.name}; navigation unavailable`
        );

        const copy = document.createElement("span");
        copy.className = "requirement-copy";
        const name = document.createElement("strong");
        name.className = "requirement-name";
        name.textContent = requirement.name || "Graded activity";
        const meta = document.createElement("span");
        meta.className = "requirement-meta";
        const metaParts = [
          requirement.lessonName,
          formatRequirementTime(requirement.timeCommitment)
        ].filter(Boolean);
        meta.textContent = metaParts.join(" · ");

        const badges = document.createElement("span");
        badges.className = "requirement-badges";
        if (requirement.requiredForPassing) {
          badges.append(createRequirementBadge("Required", "required"));
        }
        if (requirement.groupRequirement?.requiredPassedCount) {
          badges.append(createRequirementBadge(
            `Pass ${requirement.groupRequirement.requiredPassedCount} choice${requirement.groupRequirement.requiredPassedCount === 1 ? "" : "s"}`,
            "group"
          ));
        }
        if (Number.isFinite(requirement.weightPercent)) {
          badges.append(createRequirementBadge(
            `${formatWeightPercent(requirement.weightPercent)}% weight`,
            "weight"
          ));
        }
        if (requirement.source === "detected") {
          badges.append(createRequirementBadge("Detected", "detected"));
        }
        if (requirement.locked) {
          const lockedBadge = createRequirementBadge("Locked", "locked");
          if (requirement.lockReason) lockedBadge.title = requirement.lockReason;
          badges.append(lockedBadge);
        }
        if (!link) {
          badges.append(createRequirementBadge("Link unavailable", "unavailable"));
        }

        copy.append(name);
        if (meta.textContent) copy.append(meta);
        copy.append(badges);

        const arrow = document.createElement("span");
        arrow.className = "requirement-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        row.append(copy, arrow);

        if (link) {
          row.addEventListener("click", async () => {
            try {
              await chrome.tabs.update(tab.id, { url: link });
            } catch {
              showResult("Coursera could not open that activity. Refresh the page and try again.", "error");
            }
          });
        }
        items.append(row);
      });

      group.append(groupHeading, items);
      groupList.append(group);
    });

    elements.result.append(heading, note, groupList);
  } catch (error) {
    showResult(error.message || "Refresh the Coursera page, then try again.", "error");
  } finally {
    setButtonLoading(elements.getGradedLinksBtn, false, "", "Course Requirements");
  }
});

elements.showQuestionsBtn.addEventListener("click", async () => {
  setButtonLoading(elements.showQuestionsBtn, true, "Extracting…", "Copy Questions");
  showResult("Extracting questions…");
  try {
    const tab = await getActiveTab();
    const response = await sendTabMessage(tab.id, { action: "getSelection" });
    const questions = Array.isArray(response?.data) ? response.data : [];
    if (!questions.length) throw new Error("No questions were found on this page.");

    const rawText = JSON.stringify(questions, null, 2);
    elements.result.replaceChildren();
    elements.result.className = "";
    elements.result.style.display = "block";

    const heading = document.createElement("div");
    heading.className = "result-heading";
    const title = document.createElement("strong");
    title.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"} found`;
    const copyButton = document.createElement("button");
    copyButton.className = "btn btn-primary btn-compact";
    copyButton.type = "button";
    copyButton.textContent = "Copy";
    heading.append(title, copyButton);

    const content = document.createElement("div");
    content.className = "result-content";
    content.textContent = rawText;
    elements.result.append(heading, content);

    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(rawText);
      copyButton.textContent = "Copied";
      setTimeout(() => { copyButton.textContent = "Copy"; }, 1500);
    });
  } catch (error) {
    showResult(error.message || "Refresh the Coursera page, then try again.", "error");
  } finally {
    setButtonLoading(elements.showQuestionsBtn, false, "", "Copy Questions");
  }
});

initializeProviderSettings().catch(() => {
  setConfigOpen(true);
  setConfigStatus("Could not load saved provider settings.", "error");
});
