const i18n = {
  pt: {
    "ready.title": "Instalar moss",
    "ready.updateTitle": "Atualizar moss",
    "ready.subtitle": "Versão 1.0.0",
    "ready.btn": "Instalar",
    "ready.updateBtn": "Atualizar",
    "installing.step1": "Preparando",
    "installing.step2": "Instalando",
    "installing.step3": "Criando atalhos",
    "installing.step4": "Concluindo",
    "installing.progressLabel": "Progresso da instalação",
    "installing.stepsLabel": "Etapas da instalação",
    "success.title": "moss instalado",
    "success.open": "Abrir moss",
    "success.close": "Fechar",
    "error.title": "Erro na instalação",
    "error.message": "Falha ao preparar arquivos",
    "error.retry": "Tentar novamente",
    "error.details": "Detalhes",
    "error.details_label": "Detalhes do erro",
    "close": "Fechar",
    "langLabel": "Idioma",
  },
  en: {
    "ready.title": "Install moss",
    "ready.updateTitle": "Update moss",
    "ready.subtitle": "Version 1.0.0",
    "ready.btn": "Install",
    "ready.updateBtn": "Update",
    "installing.step1": "Preparing",
    "installing.step2": "Installing",
    "installing.step3": "Creating shortcuts",
    "installing.step4": "Finishing",
    "installing.progressLabel": "Installation progress",
    "installing.stepsLabel": "Installation steps",
    "success.title": "moss installed",
    "success.open": "Open moss",
    "success.close": "Close",
    "error.title": "Installation error",
    "error.message": "Failed to prepare files",
    "error.retry": "Try again",
    "error.details": "Details",
    "error.details_label": "Error details",
    "close": "Close",
    "langLabel": "Language",
  },
};

const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke;
const listen = tauri.event?.listen;
const getCurrentWindow = tauri.window?.getCurrentWindow;

function detectLanguage() {
  const lang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
  return lang.startsWith("pt") ? "pt" : "en";
}

let currentLang = detectLanguage();
let existingInstall = false;
let currentStep = 1;
let customError = null;
let defaultLogPath = "%LOCALAPPDATA%\\moss\\install.log";

const installerEl = document.querySelector(".installer");
const stateSections = installerEl.querySelectorAll(".state");
const closeBtn = document.querySelector(".btn-close");
const headerDrag = document.querySelector(".header-drag");
const installBtn = document.getElementById("btn-install");
const openBtn = document.getElementById("btn-open");
const finishCloseBtn = document.getElementById("btn-finish-close");
const retryBtn = document.getElementById("btn-retry");
const detailsBtn = document.getElementById("btn-details");
const errorSection = document.querySelector(".state.error");
const errorDetails = document.querySelector(".error-details");
const errorMessageEl = document.getElementById("error-message");
const errorLogPathEl = document.getElementById("error-log-path");
const progressBar = document.querySelector(".progress");
const progressFill = document.querySelector(".progress-fill");
const installStatusEl = document.getElementById("install-status");
const stepEls = document.querySelectorAll(".steps .step");
const readyTitleEl = document.getElementById("installer-title");
const langSelectorEl = document.querySelector(".lang-selector");
const stepsListEl = document.querySelector(".steps");

function applyReadyCopy(lang) {
  const dict = i18n[lang];
  readyTitleEl.textContent = existingInstall ? dict["ready.updateTitle"] : dict["ready.title"];
  installBtn.textContent = existingInstall ? dict["ready.updateBtn"] : dict["ready.btn"];
}

function applyErrorCopy(lang) {
  const dict = i18n[lang];
  if (customError) {
    errorMessageEl.textContent = lang === "pt" ? customError.messagePt : customError.messageEn;
  } else {
    errorMessageEl.textContent = dict["error.message"];
  }
}

function applyLanguage(lang) {
  currentLang = lang;
  const dict = i18n[lang];
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en-US";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  applyReadyCopy(lang);
  applyErrorCopy(lang);
  updateInstallingStep(currentStep);

  closeBtn.setAttribute("aria-label", dict.close);
  langSelectorEl.setAttribute("aria-label", dict.langLabel);
  progressBar.setAttribute("aria-label", dict["installing.progressLabel"]);
  stepsListEl.setAttribute("aria-label", dict["installing.stepsLabel"]);

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    const isActive = btn.dataset.lang === lang;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

function showState(name) {
  stateSections.forEach((section) => {
    section.hidden = section.dataset.state !== name;
  });
  installerEl.dataset.state = name;

  const isInstalling = name === "installing";
  closeBtn.disabled = isInstalling;
  closeBtn.setAttribute("aria-disabled", String(isInstalling));
}

function updateInstallingStep(step, percent) {
  const clamped = Math.max(1, Math.min(4, Number(step) || 1));
  currentStep = clamped;
  const pct = typeof percent === "number" ? percent : clamped * 25;

  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute("aria-valuenow", String(pct));

  const stepKey = `installing.step${clamped}`;
  installStatusEl.dataset.i18n = stepKey;
  installStatusEl.textContent = i18n[currentLang][stepKey];

  stepEls.forEach((el) => {
    const stepNum = Number(el.dataset.step);
    el.classList.toggle("done", stepNum < clamped);
    el.classList.toggle("active", stepNum === clamped);
  });
}

function resetErrorDetails() {
  errorDetails.hidden = true;
  errorDetails.open = false;
  errorSection.classList.remove("details-open");
  detailsBtn.setAttribute("aria-expanded", "false");
}

function normalizeError(err) {
  if (err && typeof err === "object") {
    return {
      messagePt: err.messagePt || err.message || i18n.pt["error.message"],
      messageEn: err.messageEn || err.message || i18n.en["error.message"],
      logPath: err.logPath || defaultLogPath,
    };
  }
  const text = typeof err === "string" && err.trim() ? err.trim() : null;
  return {
    messagePt: text || i18n.pt["error.message"],
    messageEn: text || i18n.en["error.message"],
    logPath: defaultLogPath,
  };
}

function showError(err) {
  customError = normalizeError(err);
  errorLogPathEl.textContent = customError.logPath;
  applyErrorCopy(currentLang);
  resetErrorDetails();
  showState("error");
}

async function refreshInstallStatus() {
  if (!invoke) return;
  try {
    const status = await invoke("check_existing_install");
    existingInstall = Boolean(status?.installed);
    if (status?.logPath) {
      defaultLogPath = status.logPath;
      errorLogPathEl.textContent = defaultLogPath;
    }
    applyReadyCopy(currentLang);
  } catch {
    existingInstall = false;
    applyReadyCopy(currentLang);
  }
}

async function closeWindow() {
  if (installerEl.dataset.state === "installing") return;
  if (invoke) {
    try {
      await invoke("close_installer");
      return;
    } catch {
      return;
    }
  }
  window.close?.();
}

async function startInstall() {
  if (!invoke || installerEl.dataset.state === "installing") return;
  customError = null;
  resetErrorDetails();
  updateInstallingStep(1, 25);
  showState("installing");

  try {
    const result = await invoke("run_install");
    if (result?.logPath) {
      defaultLogPath = result.logPath;
    }
    updateInstallingStep(4, 100);
    showState("success");
  } catch (err) {
    showError(err);
  }
}

async function openMoss() {
  if (!invoke) return;
  openBtn.disabled = true;
  try {
    await invoke("launch_moss");
    await invoke("close_installer");
  } catch (err) {
    openBtn.disabled = false;
    showError(err);
  }
}

headerDrag.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  getCurrentWindow?.().startDragging().catch(() => {});
});

installBtn.addEventListener("click", startInstall);
openBtn.addEventListener("click", openMoss);
finishCloseBtn.addEventListener("click", closeWindow);
closeBtn.addEventListener("click", closeWindow);

retryBtn.addEventListener("click", async () => {
  customError = null;
  resetErrorDetails();
  await refreshInstallStatus();
  showState("ready");
});

detailsBtn.addEventListener("click", () => {
  const show = errorDetails.hidden;
  errorDetails.hidden = !show;
  errorDetails.open = show;
  errorSection.classList.toggle("details-open", show);
  detailsBtn.setAttribute("aria-expanded", String(show));
});

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyLanguage(btn.dataset.lang);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && installerEl.dataset.state !== "installing") {
    closeWindow();
  }
});

if (listen) {
  listen("install-progress", (event) => {
    const payload = event.payload || {};
    updateInstallingStep(payload.step, payload.percent);
  }).catch(() => {});
}

applyLanguage(currentLang);
refreshInstallStatus();
