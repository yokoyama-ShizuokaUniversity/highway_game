const highwaySelect = document.getElementById("highway-select");
const selectButton = document.getElementById("select-highway");
const resetButton = document.getElementById("reset");
const giveUpButton = document.getElementById("giveup");
const board = document.getElementById("board");
const info = document.getElementById("highway-info");
const nodeTemplate = document.getElementById("node-template");
const zoomRange = document.getElementById("zoom-range");
const zoomValue = document.getElementById("zoom-value");

let currentHighway = null;
let nodeStates = new Map();
let zoom = 100;

async function loadHighways() {
  const res = await fetch("/api/highways");
  const data = await res.json();
  highwaySelect.innerHTML = "";
  data.forEach((hw) => {
    const option = document.createElement("option");
    option.value = hw.id;
    option.textContent = hw.name;
    highwaySelect.appendChild(option);
  });
  if (data.length) {
    highwaySelect.value = data[0].id;
    await setHighway(data[0].id);
  }
}

async function setHighway(id) {
  const res = await fetch(`/api/highways/${id}`);
  const hw = await res.json();
  currentHighway = hw;
  nodeStates.clear();
  renderBoard(hw);
  info.textContent = `${hw.name}：${hw.description}`;
}

function renderBoard(hw) {
  board.innerHTML = "";
  const container = document.createElement("div");
  container.className = "road-container";

  // zoom
  container.style.transform = `scale(${zoom / 100})`;
  container.style.transformOrigin = "0 50%";

  const base = document.createElement("div");
  base.className = "road-base";
  container.appendChild(base);

  const positionedNodes = hw.nodes.map((node) => ({
    ...node,
    x: typeof node.x === "number" ? node.x : 0,
    y: typeof node.y === "number" ? node.y : 50,
  }));

  // segments between consecutive nodes
  for (let i = 0; i < positionedNodes.length - 1; i++) {
    const start = positionedNodes[i];
    const end = positionedNodes[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const segment = document.createElement("div");
    segment.className = "segment";
    segment.dataset.from = start.id;
    segment.dataset.to = end.id;
    segment.style.left = `${start.x}%`;
    segment.style.top = `${start.y}%`;
    segment.style.width = `${length}%`;
    segment.style.transform = `translateY(-50%) rotate(${angle}deg)`;
    container.appendChild(segment);
  }

  positionedNodes.forEach((node) => {
    const clone = nodeTemplate.content.firstElementChild.cloneNode(true);
    clone.style.left = `${node.x}%`;
    clone.style.top = `${node.y}%`;
    clone.dataset.nodeId = node.id;

    const icon = clone.querySelector(".icon");
    const input = clone.querySelector(".node-input");
    input.value = "";

    let iconLabel = "〇";
    let extraClass = "ic";
    if (node.kind === "JCT") {
      iconLabel = "◇";
      extraClass = "jct";
    } else if (node.kind === "PA") {
      iconLabel = "■";
      extraClass = "pa";
    } else if (node.kind === "SA") {
      iconLabel = "□";
      extraClass = "sa";
    }
    icon.textContent = "";
    const span = document.createElement("span");
    span.textContent = iconLabel;
    icon.appendChild(span);
    clone.classList.add(extraClass);

    input.addEventListener("input", () => handleInput(node.id, input.value));

    const label = document.createElement("div");
    label.className = "node-label";
    label.textContent = `${node.kind}`;
    clone.appendChild(label);

    container.appendChild(clone);
    nodeStates.set(node.id, { correct: false, filled: false, expected: node.name });
  });

  if (Array.isArray(hw.landmarks)) {
    hw.landmarks.forEach((lm) => {
      const lmEl = document.createElement("div");
      lmEl.className = "landmark";
      lmEl.textContent = lm.name;
      lmEl.style.left = `${lm.x}%`;
      lmEl.style.top = `${lm.y}%`;
      container.appendChild(lmEl);
    });
  }

  const status = document.createElement("div");
  status.id = "status";
  status.className = "status-message";
  status.textContent = "入力して高速道路を完成させよう";

  board.appendChild(container);
  board.appendChild(status);
}

function handleInput(nodeId, value) {
  const trimmed = value.trim();
  const node = currentHighway.nodes.find((n) => n.id === nodeId);
  const entry = nodeStates.get(nodeId);
  entry.filled = trimmed.length > 0;
  entry.correct = isCorrectInput(trimmed, node.name);
  nodeStates.set(nodeId, entry);
  updateNodeUI(nodeId, entry, trimmed.length > 0);
  updateSegments();
  checkCompletion();
}

function normalizeName(text) {
  return text
    .replace(/[\s]/g, "")
    .replace(/[－―ー–ｰ]/g, "-")
    .toLowerCase();
}

function stripSuffix(name) {
  const suffixes = [
    "ic",
    "jct",
    "pa",
    "sa",
    "インターチェンジ",
    "ジャンクション",
    "サービスエリア",
    "パーキングエリア",
  ];
  let normalized = normalizeName(name);
  suffixes.forEach((suf) => {
    if (normalized.endsWith(suf)) {
      normalized = normalized.slice(0, -suf.length);
    }
  });
  return normalized;
}

function isCorrectInput(userInput, expected) {
  if (!userInput) return false;
  const normalizedInput = stripSuffix(userInput);
  const normalizedExpected = stripSuffix(expected);
  return normalizedInput === normalizedExpected;
}

function updateNodeUI(nodeId, entry, hasInput) {
  const nodeEl = board.querySelector(`[data-node-id="${nodeId}"]`);
  if (!nodeEl) return;
  nodeEl.classList.remove("correct", "error");
  if (entry.correct) {
    nodeEl.classList.add("correct");
  } else if (hasInput) {
    nodeEl.classList.add("error");
  }
}

function updateSegments() {
  const segments = board.querySelectorAll(".segment");
  segments.forEach((seg) => {
    const from = nodeStates.get(seg.dataset.from);
    const to = nodeStates.get(seg.dataset.to);
    const canOpen = from?.correct && to?.correct;
    seg.style.background = canOpen ? "var(--road-green)" : "var(--road-grey)";
  });
}

function checkCompletion() {
  const status = document.getElementById("status");
  const allCorrect = Array.from(nodeStates.values()).every((v) => v.correct);
  if (allCorrect && nodeStates.size > 0) {
    status.textContent = "高速道路完成！おめでとう！";
  } else {
    status.textContent = "入力して高速道路を完成させよう";
  }
}

function resetBoard() {
  if (!currentHighway) return;
  renderBoard(currentHighway);
}

function giveUp() {
  if (!currentHighway) return;
  currentHighway.nodes.forEach((node) => {
    const nodeEl = board.querySelector(`[data-node-id="${node.id}"]`);
    const input = nodeEl.querySelector(".node-input");
    input.value = node.name;
    nodeStates.set(node.id, { correct: true, filled: true, expected: node.name });
    updateNodeUI(node.id, { correct: true }, true);
  });
  updateSegments();
  checkCompletion();
}

selectButton.addEventListener("click", () => setHighway(highwaySelect.value));
resetButton.addEventListener("click", resetBoard);
giveUpButton.addEventListener("click", giveUp);
zoomRange.addEventListener("input", (e) => {
  zoom = Number(e.target.value);
  zoomValue.textContent = `${zoom}%`;
  if (currentHighway) {
    renderBoard(currentHighway);
  }
});

loadHighways();
