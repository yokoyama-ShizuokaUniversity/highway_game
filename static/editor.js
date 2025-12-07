const tableBody = document.querySelector("#node-table tbody");
const addRowButton = document.getElementById("add-row");
const reorderButton = document.getElementById("reorder");
const saveButton = document.getElementById("save");
const resultEl = document.getElementById("result");
const jsonOutput = document.getElementById("json-output");
const saveStatus = document.getElementById("save-status");

function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addRow(data = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="radio" name="start" ${tableBody.children.length === 0 ? "checked" : ""}/></td>
    <td>
      <select>
        <option value="IC" ${data.kind === "IC" ? "selected" : ""}>IC</option>
        <option value="JCT" ${data.kind === "JCT" ? "selected" : ""}>JCT</option>
        <option value="SIC" ${data.kind === "SIC" ? "selected" : ""}>SIC</option>
        <option value="PA" ${data.kind === "PA" ? "selected" : ""}>PA</option>
        <option value="SA" ${data.kind === "SA" ? "selected" : ""}>SA</option>
      </select>
    </td>
    <td><input type="text" value="${data.name || ""}" placeholder="東京" /></td>
    <td><input type="number" step="0.0001" value="${data.lat || ""}" placeholder="35.6" /></td>
    <td><input type="number" step="0.0001" value="${data.lon || ""}" placeholder="139.6" /></td>
    <td><input type="text" value="${data.connection_road || ""}" placeholder="圏央道" /></td>
    <td><input type="text" value="${data.connection_cities || ""}" placeholder="八王子方面" /></td>
    <td><button class="delete-row">削除</button></td>
  `;
  tableBody.appendChild(tr);
  tr.querySelector(".delete-row").addEventListener("click", () => tr.remove());
}

function readRows() {
  return Array.from(tableBody.querySelectorAll("tr")).map((tr, idx) => {
    const radio = tr.querySelector('input[type="radio"]');
    const kindSel = tr.querySelector("select");
    const [nameInput, latInput, lonInput, roadInput, citiesInput] = tr.querySelectorAll(
      'input[type="text"], input[type="number"]'
    );
    return {
      isStart: radio.checked || idx === 0,
      kind: kindSel.value,
      name: nameInput.value.trim(),
      lat: Number(latInput.value),
      lon: Number(lonInput.value),
      connection_road: roadInput.value.trim(),
      connection_cities: citiesInput.value.trim(),
    };
  });
}

function haversine(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestNeighbor(nodes, startIndex) {
  const remaining = nodes.map((n, idx) => ({ ...n, originalIndex: idx }));
  const ordered = [];
  let current = remaining.splice(startIndex, 1)[0];
  ordered.push(current);
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((candidate, idx) => {
      const dist = haversine(current, candidate);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    });
    current = remaining.splice(nearestIdx, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

function normalizeFromGeo(nodes) {
  if (!nodes.length) return nodes;
  const minLat = Math.min(...nodes.map((n) => n.lat));
  const minLon = Math.min(...nodes.map((n) => n.lon));
  const meanLatRad =
    (nodes.reduce((sum, n) => sum + (n.lat || 0), 0) / nodes.length) *
    (Math.PI / 180);
  const coords = nodes.map((n) => {
    const dx = (n.lon - minLon) * 111.32 * Math.cos(meanLatRad);
    const dy = (n.lat - minLat) * 110.574;
    return { dx, dy };
  });
  const spanX = Math.max(...coords.map((c) => c.dx), 1e-6);
  const spanY = Math.max(...coords.map((c) => c.dy), 1e-6);
  const span = Math.max(spanX, spanY, 1e-6);
  return nodes.map((n, idx) => ({
    ...n,
    x: (coords[idx].dx / span) * 100,
    y: 100 - (coords[idx].dy / span) * 100,
  }));
}

function buildHighway(nodes) {
  if (!nodes.length) {
    return null;
  }

  const startIdx = Math.max(nodes.findIndex((n) => n.isStart), 0);
  const ordered = nearestNeighbor(nodes, startIdx);
  let totalKm = 0;
  const withKm = ordered.map((node, idx) => {
    if (idx === 0) return { ...node, km: 0 };
    const dist = haversine(ordered[idx - 1], node);
    totalKm += dist;
    return { ...node, km: Number(totalKm.toFixed(1)) };
  });

  const normalized = normalizeFromGeo(withKm);
  const usedIds = new Set();
  const nodesForJson = normalized.map((n) => {
    let id = slugify(n.name) || `node-${Math.random().toString(16).slice(2, 6)}`;
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    usedIds.add(id);
    const nodeData = {
      id,
      name: n.name,
      kind: n.kind,
      km: n.km,
      lat: n.lat,
      lon: n.lon,
      x: Number(n.x.toFixed(2)),
      y: Number(n.y.toFixed(2)),
    };

    if (n.connection_road) {
      nodeData.connection_road = n.connection_road;
    }
    if (n.connection_cities) {
      nodeData.connection_cities = n.connection_cities;
    }
    return nodeData;
  });

  return {
    highway: {
      id: document.getElementById("hw-id").value || "sample-highway",
      name: document.getElementById("hw-name").value || "未命名高速道路",
      origin_city: document.getElementById("hw-origin").value || "",
      destination_city: document.getElementById("hw-destination").value || "",
      nodes: nodesForJson,
    },
    totalKm,
  };
}

function renderResult(nodes) {
  if (!nodes.length) {
    resultEl.textContent = "地点を1件以上入力してください";
    jsonOutput.textContent = "";
    return;
  }

  const built = buildHighway(nodes);
  if (!built) return;

  resultEl.textContent = `並び替え完了: 全${built.highway.nodes.length}地点 / 想定距離 ${built.totalKm.toFixed(
    1
  )}km`;
  jsonOutput.textContent = JSON.stringify(built.highway, null, 2);
}

async function saveHighwayToFile() {
  saveStatus.textContent = "";
  const rows = readRows();
  const validRows = rows.filter(
    (r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon)
  );
  const built = buildHighway(validRows);
  if (!built) {
    saveStatus.textContent = "地点を正しく入力してください";
    return;
  }
  renderResult(validRows);
  const res = await fetch("/api/highways", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(built.highway),
  });

  if (res.ok) {
    saveStatus.textContent = "保存しました。ゲーム用アプリで即時参照できます。";
  } else {
    const error = await res.json().catch(() => ({ error: "保存に失敗しました" }));
    saveStatus.textContent = error.error || "保存に失敗しました";
  }
}

addRowButton.addEventListener("click", () => addRow());
reorderButton.addEventListener("click", () => {
  const rows = readRows();
  const validRows = rows.filter(
    (r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon)
  );
  renderResult(validRows);
});
saveButton.addEventListener("click", () => {
  saveHighwayToFile();
});

// 初期行を2つ用意
addRow({ name: "東京", kind: "IC", lat: 35.631, lon: 139.639 });
addRow({ name: "横浜町田", kind: "IC", lat: 35.513, lon: 139.47 });
