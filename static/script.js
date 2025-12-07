const highwaySelect = document.getElementById("highway-select");
const selectButton = document.getElementById("select-highway");
const resetButton = document.getElementById("reset");
const giveUpButton = document.getElementById("giveup");
const board = document.getElementById("board");
const info = document.getElementById("highway-info");
const nodeTemplate = document.getElementById("node-template");
const zoomRange = document.getElementById("zoom-range");
const zoomValue = document.getElementById("zoom-value");
const panRangeX = document.getElementById("pan-range-x");
const panRangeY = document.getElementById("pan-range-y");
const panValueX = document.getElementById("pan-value-x");
const panValueY = document.getElementById("pan-value-y");
const panButtons = document.querySelectorAll(".pan-btn");

let currentHighway = null;
let nodeStates = new Map();
let zoom = 100;
let panX = 0;
let panY = 0;
const DISTANCE_SCALE = 1.65;
const MIN_GAP = 16;
panValueX.textContent = `${panX}px`;
panValueY.textContent = `${panY}px`;
zoomValue.textContent = `${zoom}%`;

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

  // zoom & pan
  container.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom / 100})`;
  container.style.transformOrigin = "50% 50%";

  board.appendChild(container);

  const normalizedNodes = computeNormalizedNodes(hw.nodes);
  const spacedNodes = applyDirectionalSpacing(normalizedNodes);
  const fittedNodes = fitNodesToViewport(spacedNodes);
  const labelOffsets = computeLabelOffsets(fittedNodes);

  const widthPx = board.clientWidth || 1;
  const layout = measureSpan(fittedNodes);
  const baseHeight = Math.max(320, (layout.spanY / layout.spanX || 0) * widthPx, 240);
  container.style.height = `${baseHeight}px`;

  const heightPx = container.offsetHeight || 1;

  const spanWidthPx = (layout.spanX / 100) * widthPx * (zoom / 100);
  const spanHeightPx = (layout.spanY / 100) * heightPx * (zoom / 100);
  const safetyX = Math.max(widthPx, spanWidthPx) + 200;
  const safetyY = Math.max(heightPx, spanHeightPx) + 200;
  syncPanLimits(safetyX, safetyY);

  // segments between consecutive nodes
  for (let i = 0; i < fittedNodes.length - 1; i++) {
    const start = fittedNodes[i];
    const end = fittedNodes[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const scaledDx = (dx / 100) * widthPx;
    const scaledDy = (dy / 100) * heightPx;
    const length = Math.sqrt(scaledDx * scaledDx + scaledDy * scaledDy);
    const angle = Math.atan2(scaledDy, scaledDx) * (180 / Math.PI);
    const segment = document.createElement("div");
    segment.className = "segment";
    segment.dataset.from = start.id;
    segment.dataset.to = end.id;
    segment.style.left = `${start.x}%`;
    segment.style.top = `${start.y}%`;
    segment.style.width = `${length}px`;
    segment.style.transform = `translateY(-50%) rotate(${angle}deg)`;
    container.appendChild(segment);
  }

  fittedNodes.forEach((node) => {
    const clone = nodeTemplate.content.firstElementChild.cloneNode(true);
    clone.style.left = `${node.x}%`;
    clone.style.top = `${node.y}%`;
    clone.dataset.nodeId = node.id;

    const icon = clone.querySelector(".icon");
    const input = clone.querySelector(".node-input");
    input.value = "";
    const desiredWidth = Math.max(node.name.length + 4, 12);
    input.style.width = `${desiredWidth}ch`;
    const offset = labelOffsets.get(node.id) || { x: 0, y: 0 };

    let extraClass = "ic";
    if (node.kind === "JCT") {
      extraClass = "jct";
    } else if (node.kind === "PA") {
      extraClass = "pa";
    } else if (node.kind === "SA") {
      extraClass = "sa";
    } else if (node.kind === "SIC") {
      extraClass = "sic";
    }
    icon.setAttribute("aria-label", `${node.name} (${node.kind})`);
    clone.classList.add(extraClass);

    const textRow = document.createElement("div");
    textRow.className = "text-row";
    textRow.style.left = `${offset.x}px`;
    textRow.style.top = `${36 + offset.y}px`;
    const badge = document.createElement("span");
    badge.className = "kind-badge";
    badge.textContent = node.kind;

    input.addEventListener("input", () => handleInput(node.id, input.value));
    textRow.appendChild(input);
    textRow.appendChild(badge);
    clone.appendChild(textRow);

    if (node.kind === "JCT" && (node.connection_road || node.connection_cities)) {
      const conn = document.createElement("div");
      conn.className = "jct-connection";
      const road = node.connection_road ? `接続: ${node.connection_road}` : "";
      const cities = node.connection_cities ? `（${node.connection_cities}）` : "";
      conn.textContent = `${road}${cities}`.trim();
      conn.style.left = `${offset.x}px`;
      conn.style.top = `${36 + offset.y + 32}px`;
      clone.appendChild(conn);
    }

    container.appendChild(clone);
    nodeStates.set(node.id, { correct: false, filled: false, expected: node.name });
  });

  if (Array.isArray(hw.landmarks)) {
    hw.landmarks.forEach((lm) => {
      const lmEl = document.createElement("div");
      lmEl.className = "landmark";
      if (lm.type) {
        lmEl.classList.add(String(lm.type));
      }
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
    "sic",
    "jct",
    "pa",
    "sa",
    "インターチェンジ",
    "スマートインターチェンジ",
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

function computeLabelOffsets(nodes) {
  const offsets = new Map();
  nodes.forEach((node, idx) => {
    const prev = nodes[idx - 1] || nodes[idx + 1];
    const next = nodes[idx + 1] || nodes[idx - 1];
    if (!prev || !next) {
      offsets.set(node.id, { x: 0, y: 0 });
      return;
    }
    const vx = next.x - prev.x;
    const vy = next.y - prev.y;
    const len = Math.hypot(vx, vy) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const px = -ny;
    const py = nx;
    const neighborDist = Math.hypot(next.x - node.x, next.y - node.y) || 1;
    const spreadBase = 52;
    const spreadBoost = Math.max(0, MIN_GAP * 1.2 - neighborDist) * 0.9;
    const spread = Math.min(120, spreadBase + spreadBoost);
    const side = idx % 2 === 0 ? 1 : -1;
    offsets.set(node.id, { x: px * spread * side, y: py * spread * side });
  });
  return offsets;
}

function isCorrectInput(userInput, expected) {
  if (!userInput) return false;
  const normalizedInput = stripSuffix(userInput);
  const normalizedExpected = stripSuffix(expected);
  return normalizedInput === normalizedExpected;
}

function measureSpan(nodes) {
  const xs = nodes.map((n) => (typeof n.x === "number" ? n.x : 0));
  const ys = nodes.map((n) => (typeof n.y === "number" ? n.y : 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    spanX: Math.max(maxX - minX, 1),
    spanY: Math.max(maxY - minY, 1),
  };
}

function computeNormalizedNodes(nodes) {
  const hasGeo = nodes.every(
    (n) => typeof n.lat === "number" && typeof n.lon === "number"
  );
  if (!hasGeo) {
    return nodes.map((node) => ({
      ...node,
      x: typeof node.x === "number" ? node.x : 0,
      y: typeof node.y === "number" ? node.y : 50,
    }));
  }

  const minLat = Math.min(...nodes.map((n) => n.lat));
  const minLon = Math.min(...nodes.map((n) => n.lon));
  const meanLatRad =
    (nodes.reduce((sum, n) => sum + (n.lat || 0), 0) / Math.max(nodes.length, 1)) *
    (Math.PI / 180);

  const coords = nodes.map((n) => {
    const dx = (n.lon - minLon) * 111.32 * Math.cos(meanLatRad);
    const dy = (n.lat - minLat) * 110.574;
    return { dx, dy };
  });

  const spanX = Math.max(...coords.map((c) => c.dx), 1e-6);
  const spanY = Math.max(...coords.map((c) => c.dy), 1e-6);
  const span = Math.max(spanX, spanY, 1e-6);

  return nodes.map((node, idx) => {
    const normX = (coords[idx].dx / span) * 100;
    const normY = 100 - (coords[idx].dy / span) * 100;
    return { ...node, x: normX, y: normY };
  });
}

function applyDirectionalSpacing(nodes) {
  if (!nodes.length) return nodes;
  const adjusted = [nodes[0]];
  for (let i = 1; i < nodes.length; i++) {
    const prevOriginal = nodes[i - 1];
    const currOriginal = nodes[i];
    const dirX = currOriginal.x - prevOriginal.x;
    const dirY = currOriginal.y - prevOriginal.y;
    const dist = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / dist;
    const ny = dirY / dist;
    const targetDist = Math.max(dist * DISTANCE_SCALE, MIN_GAP);
    const prevPlaced = adjusted[i - 1];
    adjusted.push({
      ...currOriginal,
      x: prevPlaced.x + nx * targetDist,
      y: prevPlaced.y + ny * targetDist,
    });
  }
  return adjusted;
}

function fitNodesToViewport(nodes) {
  if (!nodes.length) return nodes;
  const layout = measureSpan(nodes);
  const margin = 6; // keep icons within view and away from edges
  return nodes.map((n) => ({
    ...n,
    x:
      ((n.x - layout.minX) / Math.max(layout.spanX, 1e-6)) *
        (100 - margin * 2) +
      margin,
    y:
      ((n.y - layout.minY) / Math.max(layout.spanY, 1e-6)) *
        (100 - margin * 2) +
      margin,
  }));
}

function clampToRange(value, input) {
  const min = Number(input.min);
  const max = Number(input.max);
  return Math.min(max, Math.max(min, value));
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function syncPanLimits(limitX, limitY) {
  panRangeX.min = -Math.abs(limitX);
  panRangeX.max = Math.abs(limitX);
  panRangeY.min = -Math.abs(limitY);
  panRangeY.max = Math.abs(limitY);
  panX = clampValue(panX, Number(panRangeX.min), Number(panRangeX.max));
  panY = clampValue(panY, Number(panRangeY.min), Number(panRangeY.max));
  panRangeX.value = -panX;
  panRangeY.value = -panY;
  panValueX.textContent = `${panRangeX.value}px`;
  panValueY.textContent = `${panRangeY.value}px`;
}

function applyPan() {
  panRangeX.value = -panX;
  panRangeY.value = -panY;
  panValueX.textContent = `${panRangeX.value}px`;
  panValueY.textContent = `${panRangeY.value}px`;
  if (currentHighway) {
    renderBoard(currentHighway);
  }
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
panRangeX.addEventListener("input", (e) => {
  const requested = -Number(e.target.value);
  panX = clampValue(requested, Number(panRangeX.min), Number(panRangeX.max));
  panValueX.textContent = `${-panX}px`;
  if (currentHighway) {
    renderBoard(currentHighway);
  }
});

panRangeY.addEventListener("input", (e) => {
  const requested = -Number(e.target.value);
  panY = clampValue(requested, Number(panRangeY.min), Number(panRangeY.max));
  panValueY.textContent = `${-panY}px`;
  if (currentHighway) {
    renderBoard(currentHighway);
  }
});

panButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const deltaX = Number(btn.dataset.panX || 0);
    const deltaY = Number(btn.dataset.panY || 0);
    panX = clampValue(panX + deltaX, Number(panRangeX.min), Number(panRangeX.max));
    panY = clampValue(panY + deltaY, Number(panRangeY.min), Number(panRangeY.max));
    applyPan();
  });
});

loadHighways();
