const API_BASE =
  window.location.port === "3001" ? "/api" : "http://localhost:3001/api";
const FEEDBACK_TEXT = {
  frustrated: "🛡️ I sense you're struggling. I will simplify the lesson.",
  confident: "🚀 You're doing great! I will increase the challenge.",
  neutral: "👂 Keeping a steady pace. Keep practicing!"
};

const state = {
  lessonTopic: "Daily Conversation",
  moodScore: 0,
  difficulty: 30,
  isTyping: false,
  bannerTimer: null,
  ttsEnabled: true,
  isListening: false,
  points: 0,
  streak: 0,
  flashcards: [],
  chatHistory: [],
  pointsBannerTimer: null,
  currentTab: "chat",
  currentAssignment: null,
  assignmentHistory: [],
  totalMessages: 0,
  totalCorrections: 0,
  pronunciationHistory: [],
  lastPronunciationScore: null
};

const elements = {
  chatTabBtn: document.getElementById("chat-tab-btn"),
  assignmentTabBtn: document.getElementById("assignment-tab-btn"),
  flashcardsTabBtn: document.getElementById("flashcards-tab-btn"),
  pronunciationTabBtn: document.getElementById("pronunciation-tab-btn"),
  resultsTabBtn: document.getElementById("results-tab-btn"),
  chatTab: document.getElementById("chat-tab"),
  assignmentTab: document.getElementById("assignment-tab"),
  flashcardsTab: document.getElementById("flashcards-tab"),
  pronunciationTab: document.getElementById("pronunciation-tab"),
  resultsTab: document.getElementById("results-tab"),
  pointsPill: document.getElementById("points-pill"),
  streakPill: document.getElementById("streak-pill"),
  pointsMessage: document.getElementById("points-message"),
  chatMessages: document.getElementById("chat-messages"),
  userInput: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn"),
  voiceBtn: document.getElementById("voice-btn"),
  ttsBtn: document.getElementById("tts-btn"),
  voiceStatus: document.getElementById("voice-status"),
  lessonSelect: document.getElementById("lesson-select"),
  resetBtn: document.getElementById("reset-btn"),
  moodBar: document.getElementById("mood-bar"),
  moodValue: document.getElementById("mood-value"),
  difficultyBar: document.getElementById("difficulty-bar"),
  difficultyValue: document.getElementById("difficulty-value"),
  feedbackBanner: document.getElementById("feedback-banner"),
  feedbackText: document.getElementById("feedback-text"),
  serverStatus: document.getElementById("server-status"),
  serverStatusText: document.getElementById("server-status-text"),
  assignmentDifficulty: document.getElementById("assignment-difficulty"),
  assignmentType: document.getElementById("assignment-type"),
  generateAssignmentBtn: document.getElementById("generate-assignment-btn"),
  assignmentCard: document.getElementById("assignment-card"),
  assignmentPrompt: document.getElementById("assignment-prompt"),
  assignmentImage: document.getElementById("assignment-image"),
  assignmentAnswer: document.getElementById("assignment-answer"),
  submitAssignmentBtn: document.getElementById("submit-assignment-btn"),
  assignmentResult: document.getElementById("assignment-result"),
  assignmentHistory: document.getElementById("assignment-history"),
  flashcardEmpty: document.getElementById("flashcard-empty"),
  flashcardBox: document.getElementById("flashcard-box"),
  flashcardText: document.getElementById("flashcard-text"),
  prevFlashcardBtn: document.getElementById("prev-flashcard-btn"),
  nextFlashcardBtn: document.getElementById("next-flashcard-btn"),
  pronunciationTarget: document.getElementById("pronunciation-target"),
  suggestPronunciationBtn: document.getElementById("suggest-pronunciation-btn"),
  startPronunciationBtn: document.getElementById("start-pronunciation-btn"),
  pronunciationHeard: document.getElementById("pronunciation-heard"),
  pronunciationScore: document.getElementById("pronunciation-score"),
  resultsSummary: document.getElementById("results-summary"),
  resultsHistory: document.getElementById("results-history")
};

const positiveKeywords = ["great", "easy", "love", "understand"];
const negativeKeywords = ["hard", "difficult", "confused", "angry"];
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let manualStopListening = false;
let flashcardIndex = 0;

function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  const positiveHits = positiveKeywords.filter((word) => lower.includes(word)).length;
  const negativeHits = negativeKeywords.filter((word) => lower.includes(word)).length;
  const score = positiveHits - negativeHits;

  if (score < 0) return { mood: "frustrated", polarity: -1 };
  if (score > 0) return { mood: "confident", polarity: 1 };
  return { mood: "neutral", polarity: 0 };
}

function sanitizeText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function loadStateFromStorage() {
  const points = Number(localStorage.getItem("echomind_points")) || 0;
  const streak = Number(localStorage.getItem("echomind_streak")) || 0;
  const flashcards = JSON.parse(localStorage.getItem("echomind_flashcards") || "[]");
  const assignmentHistory = JSON.parse(localStorage.getItem("echomind_assignment_history") || "[]");
  const totalMessages = Number(localStorage.getItem("echomind_total_messages")) || 0;
  const totalCorrections = Number(localStorage.getItem("echomind_total_corrections")) || 0;
  const pronunciationHistory = JSON.parse(localStorage.getItem("echomind_pronunciation_history") || "[]");
  state.points = points;
  state.streak = streak;
  state.flashcards = Array.isArray(flashcards) ? flashcards : [];
  state.assignmentHistory = Array.isArray(assignmentHistory) ? assignmentHistory : [];
  state.totalMessages = totalMessages;
  state.totalCorrections = totalCorrections;
  state.pronunciationHistory = Array.isArray(pronunciationHistory) ? pronunciationHistory : [];
  state.lastPronunciationScore = state.pronunciationHistory.length
    ? state.pronunciationHistory[0].score
    : null;
}

function persistProgress() {
  localStorage.setItem("echomind_points", String(state.points));
  localStorage.setItem("echomind_streak", String(state.streak));
  localStorage.setItem("echomind_flashcards", JSON.stringify(state.flashcards));
  localStorage.setItem("echomind_assignment_history", JSON.stringify(state.assignmentHistory));
  localStorage.setItem("echomind_total_messages", String(state.totalMessages));
  localStorage.setItem("echomind_total_corrections", String(state.totalCorrections));
  localStorage.setItem("echomind_pronunciation_history", JSON.stringify(state.pronunciationHistory));
}

function updateHeaderStats() {
  elements.pointsPill.textContent = `⭐ Points: ${state.points}`;
  elements.streakPill.textContent = `🔥 Streak: ${state.streak}`;
}

function showPointsGain(text) {
  elements.pointsMessage.textContent = text;
  elements.pointsMessage.classList.remove("hidden");
  if (state.pointsBannerTimer) clearTimeout(state.pointsBannerTimer);
  state.pointsBannerTimer = setTimeout(() => {
    elements.pointsMessage.classList.add("hidden");
  }, 3000);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateStreakAndDailyBonus() {
  const today = todayKey();
  const last = localStorage.getItem("echomind_last_chat_day");
  if (last === today) return 0;

  let bonus = 50;
  if (last) {
    const d1 = new Date(last);
    const d2 = new Date(today);
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    state.streak = diffDays === 1 ? state.streak + 1 : 1;
  } else {
    state.streak = 1;
  }
  localStorage.setItem("echomind_last_chat_day", today);
  return bonus;
}

function awardPoints(basePoints, hasCorrection) {
  const correctionBonus = hasCorrection ? 20 : 0;
  const dailyBonus = updateStreakAndDailyBonus();
  const gained = basePoints + correctionBonus + dailyBonus;
  state.points += gained;
  persistProgress();
  updateHeaderStats();

  const parts = [`+${basePoints} message`];
  if (correctionBonus) parts.push(`+${correctionBonus} correction`);
  if (dailyBonus) parts.push(`+${dailyBonus} daily bonus`);
  showPointsGain(`Points earned: ${parts.join(" | ")} (Total: ${state.points})`);
}

function addMessage(text, isUser) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${isUser ? "user" : "bot"}`;
  wrapper.innerHTML = `
    <div class="avatar">${isUser ? "👤" : "🤖"}</div>
    <div class="bubble">${sanitizeText(text)}</div>
  `;
  if (!isUser && text.includes("💡 Correction:")) {
    const bubble = wrapper.querySelector(".bubble");
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const btn = document.createElement("button");
    btn.className = "mini-btn";
    btn.type = "button";
    btn.textContent = "Save to Flashcards";
    btn.addEventListener("click", () => saveCorrectionToFlashcards(text));
    actions.appendChild(btn);
    bubble.appendChild(actions);
  }
  elements.chatMessages.appendChild(wrapper);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function saveCorrectionToFlashcards(text) {
  const match = String(text).match(/💡\s*Correction:\s*([^\n]+)/i);
  if (!match) {
    showPointsGain("No correction detected to save.");
    return;
  }
  state.flashcards.unshift({
    correction: match[1].trim(),
    createdAt: new Date().toISOString()
  });
  state.flashcards = state.flashcards.slice(0, 100);
  persistProgress();
  showPointsGain("Saved to flashcards.");
  renderFlashcardLearning();
}

function showTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot";
  wrapper.id = "typing-indicator";
  wrapper.innerHTML = `
    <div class="avatar">🤖</div>
    <div class="bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  elements.chatMessages.appendChild(wrapper);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  state.isTyping = true;
}

function hideTypingIndicator() {
  const node = document.getElementById("typing-indicator");
  if (node) node.remove();
  state.isTyping = false;
}

function difficultyLabel(value) {
  if (value <= 40) return "Easy";
  if (value <= 75) return "Medium";
  return "Hard";
}

function updateDifficultyByMood(mood) {
  if (mood === "frustrated") {
    state.difficulty = Math.max(0, state.difficulty - 15);
  } else if (mood === "confident") {
    state.difficulty = Math.min(100, state.difficulty + 15);
  }
}

function updateMeters() {
  const moodPercent = 50 + state.moodScore * 50;
  elements.moodBar.style.width = `${moodPercent}%`;

  if (state.moodScore < 0) {
    elements.moodBar.style.backgroundColor = "var(--danger)";
    elements.moodValue.textContent = "Frustrated";
  } else if (state.moodScore > 0) {
    elements.moodBar.style.backgroundColor = "var(--success)";
    elements.moodValue.textContent = "Confident";
  } else {
    elements.moodBar.style.backgroundColor = "var(--warning)";
    elements.moodValue.textContent = "Neutral";
  }

  elements.difficultyBar.style.width = `${state.difficulty}%`;
  const level = difficultyLabel(state.difficulty);
  elements.difficultyValue.textContent = level;

  if (level === "Easy") elements.difficultyBar.style.backgroundColor = "var(--success)";
  if (level === "Medium") elements.difficultyBar.style.backgroundColor = "var(--warning)";
  if (level === "Hard") elements.difficultyBar.style.backgroundColor = "var(--danger)";
}

function showFeedbackBanner(mood) {
  elements.feedbackText.textContent = FEEDBACK_TEXT[mood];
  elements.feedbackBanner.classList.remove("hidden");
  if (state.bannerTimer) clearTimeout(state.bannerTimer);
  state.bannerTimer = setTimeout(() => {
    elements.feedbackBanner.classList.add("hidden");
  }, 4000);
}

function setVoiceStatus(text) {
  if (elements.voiceStatus) elements.voiceStatus.textContent = text;
}

function stripForSpeech(text) {
  return String(text)
    .replace(/💡/g, "")
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .trim();
}

function speakText(text) {
  if (!state.ttsEnabled || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(stripForSpeech(text));
  utterance.lang = "en-US";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function setVoiceButtonState() {
  if (!elements.voiceBtn) return;
  elements.voiceBtn.classList.toggle("active", state.isListening);
  elements.voiceBtn.textContent = state.isListening ? "🛑" : "🎤";
  elements.voiceBtn.title = state.isListening ? "Stop voice input" : "Start voice input";
}

function setTtsButtonState() {
  if (!elements.ttsBtn) return;
  elements.ttsBtn.classList.toggle("active", state.ttsEnabled);
  elements.ttsBtn.textContent = state.ttsEnabled ? "🔊" : "🔇";
  elements.ttsBtn.title = state.ttsEnabled ? "Disable AI voice" : "Enable AI voice";
}

function initializeVoiceRecognition() {
  if (!SpeechRecognition) {
    setVoiceStatus("Voice: not supported in this browser");
    if (elements.voiceBtn) elements.voiceBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isListening = true;
    setVoiceButtonState();
    setVoiceStatus("Voice: Listening...");
  };

  recognition.onresult = (event) => {
    let interim = "";
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interim += transcript;
    }

    if (finalTranscript.trim()) {
      elements.userInput.value = `${elements.userInput.value} ${finalTranscript}`.trim();
    } else if (interim.trim()) {
      const base = elements.userInput.value.replace(/\s*\[[^\]]*\]$/, "").trim();
      elements.userInput.value = `${base} [${interim.trim()}]`;
    }
    autoResizeInput();
  };

  recognition.onerror = () => {
    setVoiceStatus("Voice: Mic error or permission denied");
  };

  recognition.onend = () => {
    state.isListening = false;
    setVoiceButtonState();
    const current = elements.userInput.value.replace(/\s*\[[^\]]*\]$/, "").trim();
    elements.userInput.value = current;
    autoResizeInput();

    if (!manualStopListening) {
      try {
        recognition.start();
      } catch (error) {
        setVoiceStatus("Voice: Ready");
      }
    } else {
      manualStopListening = false;
      setVoiceStatus("Voice: Ready");
    }
  };
}

function toggleVoiceInput() {
  if (!recognition) return;
  if (state.isListening) {
    manualStopListening = true;
    recognition.stop();
    return;
  }

  try {
    manualStopListening = false;
    recognition.start();
  } catch (error) {
    setVoiceStatus("Voice: Unable to start");
  }
}

function toggleTts() {
  state.ttsEnabled = !state.ttsEnabled;
  setTtsButtonState();
  if (!state.ttsEnabled && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { method: "GET" });
    if (!response.ok) throw new Error("offline");
    elements.serverStatus.classList.add("online");
    elements.serverStatus.classList.remove("offline");
    elements.serverStatusText.textContent = "🟢 Online";
  } catch (error) {
    elements.serverStatus.classList.add("offline");
    elements.serverStatus.classList.remove("online");
    elements.serverStatusText.textContent = "🔴 Offline";
  }
}

async function requestTutorReply(message, mood) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      topic: state.lessonTopic,
      mood,
      difficulty: state.difficulty
    })
  });

  const payload = await parseApiResponse(response);
  if (!response.ok) throw new Error(payload.message || "Unable to get tutor response");
  return payload.response;
}

async function parseApiResponse(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Server returned non-JSON response (${response.status}). ` +
      "Restart backend with latest code and open app on http://localhost:3001."
    );
  }
}

async function requestAssignment(difficulty, assignmentType) {
  const response = await fetch(`${API_BASE}/assignment/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      difficulty,
      assignmentType,
      topic: state.lessonTopic,
      chatHistory: state.chatHistory.slice(-8)
    })
  });
  const payload = await parseApiResponse(response);
  if (!response.ok) throw new Error(payload.message || "Failed to generate assignment");
  return payload.assignment;
}

async function submitAssignmentForGrade() {
  if (!state.currentAssignment) return;
  const answer = elements.assignmentAnswer.value.trim();
  if (!answer) {
    elements.assignmentResult.classList.remove("hidden");
    elements.assignmentResult.textContent = "Please write your answer before submitting.";
    return;
  }

  elements.submitAssignmentBtn.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/assignment/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentPrompt: state.currentAssignment.prompt,
        answer,
        difficulty: elements.assignmentDifficulty.value
      })
    });
    const payload = await parseApiResponse(response);
    if (!response.ok) throw new Error(payload.message || "Grading failed");

    const { score, feedback } = payload.result;
    elements.assignmentResult.classList.remove("hidden");
    elements.assignmentResult.innerHTML = `<strong>Score: ${score}/100</strong><br>${sanitizeText(feedback)}`;

    state.assignmentHistory.unshift({
      title: state.currentAssignment.title,
      score,
      submittedAt: new Date().toLocaleString()
    });
    state.assignmentHistory = state.assignmentHistory.slice(0, 20);
    persistProgress();
    renderAssignmentHistory();
  } catch (error) {
    elements.assignmentResult.classList.remove("hidden");
    elements.assignmentResult.textContent = `⚠️ ${error.message}`;
  } finally {
    elements.submitAssignmentBtn.disabled = false;
  }
}

function renderAssignmentHistory() {
  if (!state.assignmentHistory.length) {
    elements.assignmentHistory.innerHTML = '<p class="voice-status">No completed assignments yet.</p>';
    return;
  }
  elements.assignmentHistory.innerHTML = state.assignmentHistory
    .map((item) => `<div class="history-item"><strong>${sanitizeText(item.title)}</strong><br>Score: ${item.score}/100<br>${sanitizeText(item.submittedAt)}</div>`)
    .join("");
}

function setTab(tabName) {
  state.currentTab = tabName;
  const isChat = tabName === "chat";
  const isAssignment = tabName === "assignment";
  const isFlashcards = tabName === "flashcards";
  const isPronunciation = tabName === "pronunciation";
  const isResults = tabName === "results";
  elements.chatTabBtn.classList.toggle("active", isChat);
  elements.assignmentTabBtn.classList.toggle("active", isAssignment);
  elements.flashcardsTabBtn.classList.toggle("active", isFlashcards);
  elements.pronunciationTabBtn.classList.toggle("active", isPronunciation);
  elements.resultsTabBtn.classList.toggle("active", isResults);
  elements.chatTab.classList.toggle("active", isChat);
  elements.assignmentTab.classList.toggle("active", isAssignment);
  elements.flashcardsTab.classList.toggle("active", isFlashcards);
  elements.pronunciationTab.classList.toggle("active", isPronunciation);
  elements.resultsTab.classList.toggle("active", isResults);
}

function renderFlashcardLearning() {
  if (!state.flashcards.length) {
    elements.flashcardEmpty.classList.remove("hidden");
    elements.flashcardBox.classList.add("hidden");
    return;
  }

  if (flashcardIndex >= state.flashcards.length) flashcardIndex = 0;
  const card = state.flashcards[flashcardIndex];
  elements.flashcardEmpty.classList.add("hidden");
  elements.flashcardBox.classList.remove("hidden");
  elements.flashcardText.textContent = `${flashcardIndex + 1}/${state.flashcards.length}: ${card.correction}`;
}

function comparePronunciation(reference, spoken) {
  const normalize = (value) =>
    String(value).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const refWords = normalize(reference).split(/\s+/).filter(Boolean);
  const spokenWords = new Set(normalize(spoken).split(/\s+/).filter(Boolean));
  if (!refWords.length) return 0;
  let match = 0;
  refWords.forEach((word) => {
    if (spokenWords.has(word)) match += 1;
  });
  return Math.round((match / refWords.length) * 100);
}

function suggestionByPronunciationScore(score) {
  if (score == null || score < 50) {
    return "I like to read books every day.";
  }
  if (score < 75) {
    return "Yesterday I visited my friend and we cooked dinner together.";
  }
  return "Although the weather was unpredictable, we still enjoyed exploring the old city market.";
}

function renderResultsTab() {
  const assignmentCount = state.assignmentHistory.length;
  const avgAssignment = assignmentCount
    ? Math.round(state.assignmentHistory.reduce((acc, item) => acc + Number(item.score || 0), 0) / assignmentCount)
    : 0;
  const pronunciationCount = state.pronunciationHistory.length;
  const avgPronunciation = pronunciationCount
    ? Math.round(state.pronunciationHistory.reduce((acc, item) => acc + Number(item.score || 0), 0) / pronunciationCount)
    : 0;

  elements.resultsSummary.innerHTML = `
    <div><strong>Total points:</strong> ${state.points}</div>
    <div><strong>Current streak:</strong> ${state.streak} day(s)</div>
    <div><strong>Messages sent:</strong> ${state.totalMessages}</div>
    <div><strong>Corrections received:</strong> ${state.totalCorrections}</div>
    <div><strong>Assignments done:</strong> ${assignmentCount} (avg ${avgAssignment}/100)</div>
    <div><strong>Pronunciation tests:</strong> ${pronunciationCount} (avg ${avgPronunciation}%)</div>
  `;

  const rows = [];
  state.pronunciationHistory.slice(0, 10).forEach((item) => {
    rows.push(
      `<div class="history-item"><strong>Pronunciation:</strong> ${item.score}%<br>${sanitizeText(item.target)}<br>${sanitizeText(item.time)}</div>`
    );
  });
  state.assignmentHistory.slice(0, 10).forEach((item) => {
    rows.push(
      `<div class="history-item"><strong>Assignment:</strong> ${sanitizeText(item.title)}<br>Score: ${item.score}/100<br>${sanitizeText(item.submittedAt)}</div>`
    );
  });

  elements.resultsHistory.innerHTML = rows.length
    ? rows.join("")
    : '<p class="voice-status">No results yet. Start chatting, assignments, or pronunciation tests.</p>';
}

function runPronunciationTest() {
  const target = elements.pronunciationTarget.value.trim();
  if (!target) {
    elements.pronunciationScore.classList.remove("hidden");
    elements.pronunciationScore.textContent = "Please enter a target sentence first.";
    return;
  }
  if (!SpeechRecognition) {
    elements.pronunciationScore.classList.remove("hidden");
    elements.pronunciationScore.textContent = "Speech recognition is not supported in this browser.";
    return;
  }

  if (state.isListening && recognition) {
    manualStopListening = true;
    recognition.stop();
  }

  const testRecognition = new SpeechRecognition();
  testRecognition.lang = "en-US";
  testRecognition.continuous = false;
  testRecognition.interimResults = false;

  elements.startPronunciationBtn.disabled = true;
  elements.pronunciationHeard.textContent = "Listening... Speak now.";
  elements.pronunciationScore.classList.add("hidden");

  testRecognition.onresult = (event) => {
    const heard = event.results[0][0].transcript || "";
    const score = comparePronunciation(target, heard);
    state.lastPronunciationScore = score;
    state.pronunciationHistory.unshift({
      score,
      target,
      heard,
      time: new Date().toLocaleString()
    });
    state.pronunciationHistory = state.pronunciationHistory.slice(0, 100);
    persistProgress();
    renderResultsTab();

    const nextSentence = suggestionByPronunciationScore(score);
    elements.pronunciationHeard.textContent = `You said: "${heard}"`;
    elements.pronunciationScore.classList.remove("hidden");
    elements.pronunciationScore.innerHTML =
      `<strong>Pronunciation Score: ${score}%</strong><br>` +
      `Try this next sentence: "${sanitizeText(nextSentence)}"`;
    elements.pronunciationTarget.value = nextSentence;
  };

  testRecognition.onerror = () => {
    elements.pronunciationScore.classList.remove("hidden");
    elements.pronunciationScore.textContent = "Could not capture speech. Please allow microphone and try again.";
  };

  testRecognition.onend = () => {
    elements.startPronunciationBtn.disabled = false;
  };

  try {
    testRecognition.start();
  } catch (error) {
    elements.startPronunciationBtn.disabled = false;
    elements.pronunciationScore.classList.remove("hidden");
    elements.pronunciationScore.textContent = "Unable to start pronunciation test.";
  }
}

async function generateAssignment() {
  elements.generateAssignmentBtn.disabled = true;
  elements.assignmentResult.classList.add("hidden");
  try {
    const assignment = await requestAssignment(
      elements.assignmentDifficulty.value,
      elements.assignmentType.value
    );
    state.currentAssignment = assignment;
    elements.assignmentCard.classList.remove("hidden");
    elements.assignmentPrompt.textContent = assignment.prompt || "No prompt available.";
    if (assignment.imageUrl) {
      elements.assignmentImage.classList.remove("hidden");
      elements.assignmentImage.src = assignment.imageUrl;
    } else {
      elements.assignmentImage.classList.add("hidden");
      elements.assignmentImage.src = "";
    }
    elements.assignmentAnswer.value = "";
  } catch (error) {
    elements.assignmentResult.classList.remove("hidden");
    elements.assignmentResult.textContent = `⚠️ ${error.message}`;
  } finally {
    elements.generateAssignmentBtn.disabled = false;
  }
}

function resetLesson() {
  state.moodScore = 0;
  state.difficulty = 30;
  state.lessonTopic = elements.lessonSelect.value;
  elements.chatMessages.innerHTML = "";
  addMessage(`Hi! I am your English tutor. Let's practice ${state.lessonTopic}.`, false);
  updateMeters();
  elements.feedbackBanner.classList.add("hidden");
  elements.userInput.value = "";
  elements.userInput.style.height = "auto";
  elements.userInput.focus();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

async function handleSend() {
  const text = elements.userInput.value.trim();
  if (!text || state.isTyping) return;

  addMessage(text, true);
  state.totalMessages += 1;
  elements.userInput.value = "";
  elements.userInput.style.height = "auto";

  const sentiment = analyzeSentiment(text);
  state.chatHistory.push(`Student: ${text}`);
  state.chatHistory = state.chatHistory.slice(-20);
  state.moodScore = sentiment.polarity;
  updateDifficultyByMood(sentiment.mood);
  updateMeters();
  showFeedbackBanner(sentiment.mood);

  elements.sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const response = await requestTutorReply(text, sentiment.mood);
    hideTypingIndicator();
    addMessage(response, false);
    state.chatHistory.push(`Tutor: ${response}`);
    state.chatHistory = state.chatHistory.slice(-20);
    const hasCorrection = response.includes("💡 Correction:");
    if (hasCorrection) state.totalCorrections += 1;
    awardPoints(10, hasCorrection);
    persistProgress();
    renderResultsTab();
    speakText(response);
  } catch (error) {
    hideTypingIndicator();
    addMessage(`⚠️ ${error.message}`, false);
  } finally {
    elements.sendBtn.disabled = false;
    elements.userInput.focus();
  }
}

function autoResizeInput() {
  elements.userInput.style.height = "auto";
  elements.userInput.style.height = `${Math.min(elements.userInput.scrollHeight, 170)}px`;
}

function init() {
  loadStateFromStorage();
  updateMeters();
  resetLesson();
  updateHeaderStats();
  renderAssignmentHistory();
  renderFlashcardLearning();
  renderResultsTab();
  checkServerHealth();
  setInterval(checkServerHealth, 30000);
  initializeVoiceRecognition();
  setVoiceButtonState();
  setTtsButtonState();
  setVoiceStatus("Voice: Ready");

  elements.sendBtn.addEventListener("click", handleSend);
  elements.voiceBtn.addEventListener("click", toggleVoiceInput);
  elements.ttsBtn.addEventListener("click", toggleTts);
  elements.resetBtn.addEventListener("click", resetLesson);
  elements.lessonSelect.addEventListener("change", (event) => {
    state.lessonTopic = event.target.value;
  });
  elements.chatTabBtn.addEventListener("click", () => setTab("chat"));
  elements.assignmentTabBtn.addEventListener("click", () => setTab("assignment"));
  elements.flashcardsTabBtn.addEventListener("click", () => {
    setTab("flashcards");
    renderFlashcardLearning();
  });
  elements.pronunciationTabBtn.addEventListener("click", () => setTab("pronunciation"));
  elements.resultsTabBtn.addEventListener("click", () => {
    setTab("results");
    renderResultsTab();
  });
  elements.generateAssignmentBtn.addEventListener("click", generateAssignment);
  elements.submitAssignmentBtn.addEventListener("click", submitAssignmentForGrade);
  elements.prevFlashcardBtn.addEventListener("click", () => {
    if (!state.flashcards.length) return;
    flashcardIndex = (flashcardIndex - 1 + state.flashcards.length) % state.flashcards.length;
    renderFlashcardLearning();
  });
  elements.nextFlashcardBtn.addEventListener("click", () => {
    if (!state.flashcards.length) return;
    flashcardIndex = (flashcardIndex + 1) % state.flashcards.length;
    renderFlashcardLearning();
  });
  elements.startPronunciationBtn.addEventListener("click", runPronunciationTest);
  elements.suggestPronunciationBtn.addEventListener("click", () => {
    const sentence = suggestionByPronunciationScore(state.lastPronunciationScore);
    elements.pronunciationTarget.value = sentence;
  });

  elements.userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
  elements.userInput.addEventListener("input", autoResizeInput);
}

document.addEventListener("DOMContentLoaded", init);