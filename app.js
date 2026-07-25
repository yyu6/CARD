const state = {
  manifest: null,
  study: null,
  participantId: null,
  accessCode: "",
  currentIndex: 0,
  responses: {},
  submissionId: null,
  submission: null,
};

const DEFAULT_NETLIFY_FORM_NAME = "card-human-likeness";

const elements = {
  landing: document.querySelector("#landing"),
  studyShell: document.querySelector("#study-shell"),
  completion: document.querySelector("#completion"),
  participantGrid: document.querySelector("#participant-grid"),
  resumeNote: document.querySelector("#resume-note"),
  studyStatus: document.querySelector("#study-status"),
  participantLabel: document.querySelector("#participant-label"),
  progressLabel: document.querySelector("#progress-label"),
  progressFill: document.querySelector("#progress-fill"),
  taskKicker: document.querySelector("#task-kicker"),
  postTitle: document.querySelector("#post-title"),
  postBody: document.querySelector("#post-body"),
  postBodyWrap: document.querySelector("#post-body-wrap"),
  postExpand: document.querySelector("#post-expand"),
  commentCountLabel: document.querySelector("#comment-count-label"),
  threadA: document.querySelector("#thread-a"),
  threadB: document.querySelector("#thread-b"),
  nextButton: document.querySelector("#next-button"),
  backButton: document.querySelector("#back-button"),
  validationMessage: document.querySelector("#validation-message"),
  instructionsButton: document.querySelector("#instructions-button"),
  instructionsDialog: document.querySelector("#instructions-dialog"),
  downloadJson: document.querySelector("#download-json"),
  downloadCsv: document.querySelector("#download-csv"),
  submitResponses: document.querySelector("#submit-responses"),
  submissionStatus: document.querySelector("#submission-status"),
  submissionFrame: document.querySelector("#submission-frame"),
  completionCopy: document.querySelector("#completion-copy"),
  backupInstructions: document.querySelector("#backup-instructions"),
  reviewButton: document.querySelector("#review-button"),
  commentTemplate: document.querySelector("#comment-template"),
};

init().catch((error) => {
  console.error(error);
  elements.landing.innerHTML = `
    <div class="protocol-card">
      <h2>Study data could not be loaded.</h2>
      <p>Run this page through the local study server rather than opening the HTML file directly.</p>
    </div>
  `;
});

async function init() {
  state.manifest = await fetchJson("data/manifest.json");
  renderParticipantButtons();
  wireEvents();

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("participant");
  state.accessCode = params.get("code")?.trim() || "";
  if (requested) {
    const normalized = normalizeParticipantId(requested);
    if (normalized) {
      await loadParticipant(normalized);
    }
  }
}

function renderParticipantButtons() {
  elements.participantGrid.replaceChildren();
  for (let index = 1; index <= state.manifest.participant_count; index += 1) {
    const participantId = `P${String(index).padStart(2, "0")}`;
    const button = document.createElement("button");
    button.className = "participant-button";
    button.type = "button";
    button.textContent = participantId;
    button.addEventListener("click", () => loadParticipant(participantId));
    elements.participantGrid.append(button);
  }

  const saved = [];
  for (let index = 1; index <= state.manifest.participant_count; index += 1) {
    const participantId = `P${String(index).padStart(2, "0")}`;
    const local = loadLocalState(participantId);
    if (Object.keys(local.responses || {}).length > 0) {
      saved.push(`${participantId}: ${Object.keys(local.responses).length} saved`);
    }
  }
  elements.resumeNote.textContent = saved.length ? `Local progress — ${saved.join(" · ")}` : "";
}

function wireEvents() {
  document.querySelectorAll(".vote-option").forEach((button) => {
    button.addEventListener("click", () => selectChoice(button.dataset.choice));
  });
  elements.nextButton.addEventListener("click", saveAndContinue);
  elements.backButton.addEventListener("click", goBack);
  elements.instructionsButton.addEventListener("click", () => {
    elements.instructionsDialog.showModal();
  });
  elements.postExpand.addEventListener("click", togglePostBody);
  elements.downloadJson.addEventListener("click", downloadJson);
  elements.downloadCsv.addEventListener("click", downloadCsv);
  elements.submitResponses.addEventListener("click", submitResponses);
  elements.reviewButton.addEventListener("click", () => {
    elements.completion.hidden = true;
    elements.studyShell.hidden = false;
    state.currentIndex = state.study.tasks.length - 1;
    renderTask();
  });
  document.addEventListener("keydown", handleKeyboard);
}

async function loadParticipant(participantId) {
  state.study = await fetchJson(`data/${participantId.toLowerCase()}.json`);
  state.participantId = participantId;
  const local = loadLocalState(participantId);
  state.responses = local.responses || {};
  state.submissionId = local.submission_id || createSubmissionId(participantId);
  state.submission = local.submission || null;
  state.currentIndex = firstIncompleteIndex();

  const url = new URL(window.location.href);
  url.searchParams.set("participant", participantId);
  window.history.replaceState({}, "", url);

  elements.landing.hidden = true;
  elements.completion.hidden = true;
  elements.studyShell.hidden = false;
  elements.studyStatus.hidden = false;
  elements.participantLabel.textContent = `Participant ${participantId}`;

  if (Object.keys(state.responses).length === state.study.task_count) {
    showCompletion();
  } else {
    renderTask();
  }
}

function renderTask() {
  const task = currentTask();
  if (!task) {
    showCompletion();
    return;
  }

  const position = state.currentIndex + 1;
  const completeCount = Object.keys(state.responses).length;
  elements.taskKicker.textContent = `Comparison ${String(position).padStart(2, "0")}`;
  elements.participantLabel.textContent = `Participant ${state.participantId}`;
  elements.progressLabel.textContent = `${completeCount} / ${state.study.task_count} saved`;
  elements.progressFill.style.width = `${(completeCount / state.study.task_count) * 100}%`;
  elements.postTitle.textContent = task.post.title;
  const postBody = stripRepeatedTitle(task.post.body, task.post.title);
  elements.postBody.textContent = postBody;
  const longPost = postBody.trim().split(/\s+/).length > 300;
  elements.postBodyWrap.classList.toggle("collapsed", longPost);
  elements.postExpand.hidden = !longPost;
  elements.postExpand.textContent = "Show full post";
  elements.commentCountLabel.textContent =
    `${task.shown_comments_per_side} comments shown on each side`;
  elements.threadA.replaceChildren(...renderForest(task.sides.a.comments));
  elements.threadB.replaceChildren(...renderForest(task.sides.b.comments));
  elements.backButton.disabled = state.currentIndex === 0;
  elements.nextButton.textContent =
    state.currentIndex === state.study.tasks.length - 1 ? "Finish study" : "Save & continue";
  elements.validationMessage.textContent = "";
  syncChoiceButtons(state.responses[task.item_id]?.choice || null);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderForest(comments) {
  return comments.map((comment) => renderComment(comment));
}

function renderComment(comment) {
  const fragment = elements.commentTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".comment");
  fragment.querySelector(".comment-author").textContent = comment.author;
  fragment.querySelector(".comment-content").textContent = comment.content;
  const replies = fragment.querySelector(".comment-replies");
  replies.replaceChildren(...renderForest(comment.replies || []));
  article.dataset.depth = String(comment.depth || 0);
  return fragment;
}

function selectChoice(choice) {
  if (!currentTask()) return;
  syncChoiceButtons(choice);
  elements.validationMessage.textContent = "";
}

function syncChoiceButtons(choice) {
  document.querySelectorAll(".vote-option").forEach((button) => {
    const selected = button.dataset.choice === choice;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function selectedChoice() {
  return document.querySelector(".vote-option.selected")?.dataset.choice || null;
}

function saveAndContinue() {
  const task = currentTask();
  const choice = selectedChoice();
  if (!choice) {
    elements.validationMessage.textContent = "Select A, B, or Cannot distinguish.";
    return;
  }
  state.responses[task.item_id] = {
    item_id: task.item_id,
    pair_id: task.pair_id,
    choice,
    recorded_at: new Date().toISOString(),
  };
  state.submission = null;
  persist();

  if (state.currentIndex >= state.study.tasks.length - 1) {
    showCompletion();
    return;
  }
  state.currentIndex += 1;
  renderTask();
}

function goBack() {
  if (state.currentIndex <= 0) return;
  state.currentIndex -= 1;
  renderTask();
}

function showCompletion() {
  elements.studyShell.hidden = true;
  elements.completion.hidden = false;
  elements.studyStatus.hidden = false;
  elements.progressLabel.textContent = `${Object.keys(state.responses).length} / ${state.study.task_count} saved`;
  elements.progressFill.style.width = "100%";
  configureCompletion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleKeyboard(event) {
  if (elements.studyShell.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "a") selectChoice("a");
  if (key === "b") selectChoice("b");
  if (key === "?" || key === "u") selectChoice("cannot");
  if (key === "enter" && selectedChoice()) saveAndContinue();
}

function firstIncompleteIndex() {
  const index = state.study.tasks.findIndex((task) => !state.responses[task.item_id]);
  return index === -1 ? state.study.tasks.length - 1 : index;
}

function currentTask() {
  return state.study?.tasks?.[state.currentIndex] || null;
}

function persist() {
  localStorage.setItem(
    storageKey(state.participantId),
    JSON.stringify({
      study_id: state.study.study_id,
      participant_id: state.participantId,
      responses: state.responses,
      submission_id: state.submissionId,
      submission: state.submission,
      updated_at: new Date().toISOString(),
    }),
  );
}

function loadLocalState(participantId) {
  try {
    const raw = localStorage.getItem(storageKey(participantId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storageKey(participantId) {
  return `${state.manifest?.study_id || "card-study"}:${participantId}`;
}

function responsePayload() {
  const ordered = state.study.tasks
    .map((task) => state.responses[task.item_id])
    .filter(Boolean);
  return {
    study_id: state.study.study_id,
    participant_id: state.participantId,
    submission_id: state.submissionId,
    exported_at: new Date().toISOString(),
    response_count: ordered.length,
    responses: ordered,
  };
}

function configureCompletion() {
  const configured = validSubmissionConfig();
  const endpointConfigured = hasSubmissionEndpoint();
  elements.submitResponses.hidden = !configured;
  elements.backupInstructions.hidden = configured;
  elements.submissionStatus.textContent = "";
  elements.submissionStatus.classList.remove("error");
  elements.submitResponses.disabled = false;
  elements.submitResponses.textContent = "Submit responses";
  if (state.submission?.status === "submitted") {
    elements.submitResponses.hidden = false;
    elements.submitResponses.disabled = true;
    elements.submitResponses.textContent = "Submitted";
    elements.submissionStatus.textContent =
      `Anonymous response ${state.participantId} was submitted successfully.`;
    elements.backupInstructions.hidden = true;
    return;
  }
  if (configured) {
    elements.completionCopy.textContent =
      "Submit your completed study without providing your name or email address. A JSON backup remains available if submission fails.";
  } else if (endpointConfigured && requiresAccessCode() && !state.accessCode) {
    elements.completionCopy.textContent =
      "Open the participant link assigned by the study coordinator to submit anonymously. Your answers remain saved in this browser.";
  } else {
    elements.completionCopy.textContent =
      "Anonymous submission is being configured. Download a JSON backup and keep it; do not send it by email.";
  }
}

async function submitResponses() {
  if (Object.keys(state.responses).length !== state.study.task_count) {
    elements.submissionStatus.textContent =
      "Complete all comparisons before submitting.";
    elements.submissionStatus.classList.add("error");
    return;
  }
  if (!validSubmissionConfig()) {
    showSubmissionFailure("Anonymous submission is not configured yet.");
    return;
  }

  elements.submitResponses.disabled = true;
  elements.submitResponses.textContent = "Submitting...";
  elements.submissionStatus.textContent = "Submitting anonymously...";
  elements.submissionStatus.classList.remove("error");

  try {
    await postToAnonymousForm(responsePayload());
    state.submission = {
      status: "submitted",
      submission_id: state.submissionId,
      submitted_at: new Date().toISOString(),
    };
    persist();
    elements.submitResponses.textContent = "Submitted";
    elements.submissionStatus.textContent =
      `Anonymous response ${state.participantId} was submitted successfully.`;
    elements.backupInstructions.hidden = true;
  } catch (error) {
    console.error(error);
    showSubmissionFailure(
      "Anonymous submission could not be confirmed. Try again or keep the JSON backup.",
    );
  }
}

function postToAnonymousForm(payload) {
  const provider = submissionProvider();
  if (provider === "netlify") {
    return postToNetlifyForm(payload);
  }
  if (provider === "apps_script") {
    return postToAppsScriptForm(payload);
  }
  return Promise.reject(new Error(`Unsupported submission provider: ${provider}`));
}

async function postToNetlifyForm(payload) {
  const formName = netlifyFormName();
  const fields = {
    "form-name": formName,
    "bot-field": "",
    study_id: payload.study_id,
    participant_id: payload.participant_id,
    submission_id: payload.submission_id,
    response_count: String(payload.response_count),
    payload: JSON.stringify(payload),
  };
  const response = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!response.ok) {
    throw new Error(`Netlify form submission failed: ${response.status}`);
  }
  return { ok: true, provider: "netlify" };
}

function postToAppsScriptForm(payload) {
  const config = state.manifest.submission;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = config.form_action;
  form.target = elements.submissionFrame.name;
  form.acceptCharset = "UTF-8";
  form.hidden = true;

  const fields = {
    [config.participant_field]: payload.participant_id,
    [config.response_count_field]: String(payload.response_count),
    [config.payload_field]: JSON.stringify(payload),
    [config.access_code_field]: state.accessCode,
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("textarea");
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Anonymous submission timed out"));
    }, 20000);

    const onMessage = (event) => {
      if (event.source !== elements.submissionFrame.contentWindow) return;
      const result = event.data;
      if (!result || result.type !== "card-submission-result") return;
      if (result.submission_id && result.submission_id !== payload.submission_id) return;
      cleanup();
      if (result.ok) {
        resolve(result);
      } else {
        reject(new Error(result.error || "Anonymous submission was rejected"));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      form.remove();
    };

    window.addEventListener("message", onMessage);
    form.submit();
  });
}

function validSubmissionConfig() {
  const provider = submissionProvider();
  if (provider === "netlify") {
    return Boolean(netlifyFormName());
  }
  if (provider === "apps_script") {
    return hasSubmissionEndpoint() && Boolean(state.accessCode);
  }
  return false;
}

function hasSubmissionEndpoint() {
  const provider = submissionProvider();
  if (provider === "netlify") {
    return Boolean(netlifyFormName());
  }
  if (provider !== "apps_script") {
    return false;
  }
  const config = state.manifest?.submission;
  return Boolean(
    config?.form_action &&
      config?.participant_field &&
      config?.response_count_field &&
      config?.payload_field &&
      config?.access_code_field,
  );
}

function requiresAccessCode() {
  return submissionProvider() === "apps_script";
}

function submissionProvider() {
  return state.manifest?.submission?.provider || "netlify";
}

function netlifyFormName() {
  return state.manifest?.submission?.form_name || DEFAULT_NETLIFY_FORM_NAME;
}

function showSubmissionFailure(message) {
  elements.submissionStatus.textContent = message;
  elements.submissionStatus.classList.add("error");
  elements.backupInstructions.hidden = false;
  elements.submitResponses.disabled = false;
  elements.submitResponses.textContent = "Try submission again";
}

function createSubmissionId(participantId) {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${state.manifest.study_id}-${participantId}-${randomPart}`;
}

function downloadJson() {
  const payload = responsePayload();
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `${state.study.study_id}_${state.participantId}_responses.json`,
    "application/json",
  );
}

function downloadCsv() {
  const rows = responsePayload().responses;
  const header = ["study_id", "participant_id", "item_id", "pair_id", "choice", "recorded_at"];
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      [
        state.study.study_id,
        state.participantId,
        row.item_id,
        row.pair_id,
        row.choice,
        row.recorded_at,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
  downloadBlob(
    csv,
    `${state.study.study_id}_${state.participantId}_responses.csv`,
    "text/csv",
  );
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function stripRepeatedTitle(body, title) {
  const text = String(body || "").trim();
  if (!title || !text.startsWith(title)) return text;
  return text.slice(title.length).trim();
}

function togglePostBody() {
  const collapsed = elements.postBodyWrap.classList.toggle("collapsed");
  elements.postExpand.textContent = collapsed ? "Show full post" : "Collapse post";
}

function normalizeParticipantId(value) {
  const number = Number.parseInt(String(value).replace(/\D/g, ""), 10);
  if (!Number.isInteger(number) || number < 1 || number > state.manifest.participant_count) {
    return null;
  }
  return `P${String(number).padStart(2, "0")}`;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}
