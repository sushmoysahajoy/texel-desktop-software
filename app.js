(() => {
  "use strict";

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const state = {
    rows: 8,
    cols: 8,
    matrix: [],
    warpColor: "#6f3de0",
    weftColor: "#f7f7f7",
    zoom: 4,
    live: true,
    designName: "",
    shafts: 1,
    threading: [],
    lifting: [],
    undoStack: [],
    redoStack: [],
    painting: false,
    paintValue: 1,
  };

  const defaultPattern = [
    [0, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 1, 0, 0, 1, 1, 0],
    [0, 1, 0, 0, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 1, 1, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 1, 1, 1],
  ];

  const weavePresets = {
    twill: [
      [0, 1],
      [1, 0],
    ],

    brighton_honeycomb: [
      [0, 1, 1, 1, 0, 1, 0, 1],
      [1, 0, 1, 0, 0, 0, 1, 0],
      [0, 1, 0, 1, 0, 1, 0, 0],
      [1, 1, 1, 0, 1, 0, 1, 0],

      [0, 1, 0, 1, 0, 1, 1, 1],
      [0, 0, 1, 0, 1, 0, 1, 0],
      [0, 1, 0, 0, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 1, 1, 0],
    ],

    satin: [
      [0, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 0, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 1],

      [1, 1, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 0],
      [1, 1, 0, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 0, 1, 1],
    ],

    diamond: [
      [0, 0, 1, 1, 1, 0, 0, 1],
      [0, 1, 1, 0, 1, 1, 0, 0],
      [1, 1, 0, 0, 0, 1, 1, 0],
      [1, 0, 0, 1, 0, 0, 1, 1],

      [1, 1, 0, 0, 0, 1, 1, 0],
      [0, 1, 1, 0, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 1],
      [1, 0, 0, 1, 0, 0, 1, 1],
    ],

    diaper: [
      [0, 0, 1, 1, 0, 0, 1, 1],
      [0, 1, 1, 0, 1, 0, 0, 1],
      [1, 1, 0, 0, 1, 1, 0, 0],
      [1, 0, 0, 1, 0, 1, 1, 0],

      [0, 1, 1, 0, 1, 0, 0, 1],
      [0, 0, 1, 1, 0, 0, 1, 1],
      [1, 0, 0, 1, 0, 1, 1, 0],
      [1, 1, 0, 0, 1, 1, 0, 0],
    ],
  };

  function makeEmptyMatrix(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  function cloneMatrix(m) {
    return m.map((r) => [...r]);
  }

  function normalizeMatrix(matrix, rows, cols) {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => Number(Boolean(matrix?.[r]?.[c]))),
    );
  }

  function initializeMatrix() {
    state.rows = defaultPattern.length;
    state.cols = defaultPattern[0].length;
    state.matrix = cloneMatrix(defaultPattern);
    deriveLoomFromDrawdown();
  }

  /*
    Proper drawdown -> threading/lifting derivation.

    Each warp end is represented by its complete vertical profile through all
    weft picks. Warp ends with the same profile can share one shaft.

    This creates the minimum number of shafts needed to reproduce the current
    drawdown exactly:

      threading[column] = shaft index
      lifting[row][shaft] = 1 when that shaft is lifted on that pick

    Therefore:
      lifting[row][threading[column]] === matrix[row][column]
  */
  function deriveLoomFromDrawdown() {
    const signatureToShaft = new Map();
    const threading = Array(state.cols).fill(0);
    const shaftProfiles = [];

    for (let c = 0; c < state.cols; c++) {
      const profile = Array.from({ length: state.rows }, (_, r) =>
        Number(Boolean(state.matrix?.[r]?.[c])),
      );
      const signature = profile.join("");

      let shaft = signatureToShaft.get(signature);

      if (shaft === undefined) {
        shaft = shaftProfiles.length;
        signatureToShaft.set(signature, shaft);
        shaftProfiles.push(profile);
      }

      threading[c] = shaft;
    }

    if (!shaftProfiles.length) {
      shaftProfiles.push(Array(state.rows).fill(0));
    }

    const lifting = Array.from({ length: state.rows }, (_, r) =>
      Array.from({ length: shaftProfiles.length }, (_, shaft) =>
        shaftProfiles[shaft][r] ? 1 : 0,
      ),
    );

    state.shafts = shaftProfiles.length;
    state.threading = threading;
    state.lifting = lifting;

    return {
      shafts: state.shafts,
      threading: state.threading,
      lifting: state.lifting,
    };
  }

  function snapshot() {
    return JSON.stringify({
      rows: state.rows,
      cols: state.cols,
      matrix: state.matrix,
      warpColor: state.warpColor,
      weftColor: state.weftColor,
      zoom: state.zoom,
      designName: state.designName,
      live: state.live,
    });
  }

  function pushHistory() {
    const snap = snapshot();
    const last = state.undoStack[state.undoStack.length - 1];

    if (last !== snap) {
      state.undoStack.push(snap);
      if (state.undoStack.length > 80) state.undoStack.shift();
    }

    state.redoStack.length = 0;
  }

  function restoreSnapshot(snap) {
    const data = JSON.parse(snap);

    state.rows = clamp(Number(data.rows) || 8, 2, 24);
    state.cols = clamp(Number(data.cols) || 8, 2, 24);
    state.matrix = normalizeMatrix(data.matrix, state.rows, state.cols);
    state.warpColor = data.warpColor || "#6f3de0";
    state.weftColor = data.weftColor || "#f7f7f7";
    state.zoom = clamp(Number(data.zoom) || 4, 1, 8);
    state.designName = data.designName || "";
    state.live = data.live !== false;

    deriveLoomFromDrawdown();
    syncControls();
    renderAll();
  }

  function undo() {
    if (!state.undoStack.length) return toast("Nothing to undo");

    state.redoStack.push(snapshot());
    restoreSnapshot(state.undoStack.pop());
  }

  function redo() {
    if (!state.redoStack.length) return toast("Nothing to redo");

    state.undoStack.push(snapshot());
    restoreSnapshot(state.redoStack.pop());
  }

  function syncControls() {
    const warpEnds = qs("#warpEnds");
    const weftPicks = qs("#weftPicks");
    const warpColor = qs("#warpColor");
    const weftColor = qs("#weftColor");
    const zoomRange = qs("#zoomRange");
    const designName = qs("#designName");
    const liveStatus = qs("#liveStatus");

    if (warpEnds) warpEnds.value = state.cols;
    if (weftPicks) weftPicks.value = state.rows;
    if (warpColor) warpColor.value = state.warpColor;
    if (weftColor) weftColor.value = state.weftColor;
    if (zoomRange) zoomRange.value = state.zoom;
    if (designName) designName.value = state.designName || "";
    if (liveStatus) liveStatus.textContent = state.live ? "On" : "Off";

    document.documentElement.style.setProperty(
      "--weave-print-warp",
      state.warpColor,
    );
    document.documentElement.style.setProperty(
      "--weave-print-weft",
      state.weftColor,
    );
  }

  function renderAll() {
    deriveLoomFromDrawdown();
    renderDraftingPlan();
    renderPatternGrid();
    renderLiftingPlan();
    updateStats();
    drawFabric();

    requestAnimationFrame(syncPatternGeometry);
  }

  function syncPatternGeometry() {
    const inner = qs(".pattern-inner");
    const layout = qs(".pattern-layout");
    const draft = qs(".draft-section");

    if (!inner || !layout || !draft) return;

    // On compact/mobile layouts the page is intentionally allowed to flow.
    // Desktop/tablet keeps the workspace fixed and scales the loom geometry
    // so the drafting, drawdown and lifting plan always remain fully visible.
    if (window.innerWidth <= 1080) {
      layout.style.removeProperty("--pattern-size");
      layout.style.removeProperty("--lifting-width");
      layout.style.removeProperty("--draft-row-height");
      return;
    }

    const { shafts } = deriveLoomFromDrawdown();
    const innerStyles = getComputedStyle(inner);
    const horizontalPadding =
      parseFloat(innerStyles.paddingLeft || 0) +
      parseFloat(innerStyles.paddingRight || 0);
    const verticalPadding =
      parseFloat(innerStyles.paddingTop || 0) +
      parseFloat(innerStyles.paddingBottom || 0);

    const usableW = Math.max(320, inner.clientWidth - horizontalPadding);
    const usableH = Math.max(360, inner.clientHeight - verticalPadding);

    const sideLabel = 30;
    const columnGap = 12;
    const labelsHeight = 48;
    const draftHeading = 30;
    const draftGap = 8;

    // Give every lifting shaft a sensible minimum width, but keep the lifting
    // plan proportional on ordinary 4/8-shaft drafts. This is what prevents
    // wide lifting plans from being cut by the card's right edge.
    const liftingWidth = clamp(shafts * 17, 92, Math.min(360, usableW * 0.46));

    // Drafting rows shrink gracefully for high shaft counts instead of pushing
    // the pattern grid below the fixed viewport.
    const maxDraftArea = Math.max(96, usableH * 0.38);
    const draftRowHeight = clamp(
      Math.floor((maxDraftArea - draftHeading) / Math.max(1, shafts)),
      9,
      28,
    );
    const draftHeight = draftHeading + shafts * draftRowHeight + draftGap;

    const availablePatternW = Math.max(
      190,
      usableW - sideLabel - liftingWidth - columnGap * 2,
    );
    const availablePatternH = Math.max(
      190,
      usableH - draftHeight - labelsHeight,
    );

    const size = Math.floor(Math.min(availablePatternW, availablePatternH));

    layout.style.setProperty("--pattern-size", `${size}px`);
    layout.style.setProperty(
      "--lifting-width",
      `${Math.floor(liftingWidth)}px`,
    );
    layout.style.setProperty("--draft-row-height", `${draftRowHeight}px`);
  }

  function renderDraftingPlan() {
    const root = qs("#draftingPlan");
    const labels = qs("#draftRowLabels");

    if (!root) return;

    root.innerHTML = "";
    if (labels) labels.innerHTML = "";

    const { shafts, threading } = deriveLoomFromDrawdown();

    root.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    root.style.gridTemplateRows = `repeat(${shafts}, 1fr)`;

    if (labels) {
      labels.style.gridTemplateRows = `repeat(${shafts}, 1fr)`;
    }

    // Top to bottom: highest shaft -> shaft 1
    for (let shaft = shafts - 1; shaft >= 0; shaft--) {
      if (labels) {
        const label = document.createElement("span");
        label.textContent = shaft + 1;
        labels.appendChild(label);
      }

      for (let c = 0; c < state.cols; c++) {
        const active = threading[c] === shaft;

        const div = document.createElement("div");

        div.className = "draft-cell" + (active ? " active" : "");

        div.dataset.shaft = String(shaft);
        div.dataset.c = String(c);

        div.title = active
          ? `Warp end ${c + 1} → Shaft ${shaft + 1}`
          : `Shaft ${shaft + 1}, Warp end ${c + 1}`;

        div.textContent = active ? String(shaft + 1) : "";

        root.appendChild(div);
      }
    }
  }

  function renderPatternGrid() {
    const grid = qs("#patternGrid");
    const top = qs("#colLabels");
    const bottom = qs("#bottomLabels");
    const rows = qs("#rowLabels");

    if (!grid || !top || !bottom || !rows) return;

    grid.innerHTML = "";
    top.innerHTML = "";
    bottom.innerHTML = "";
    rows.innerHTML = "";

    grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;
    top.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    bottom.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    rows.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;

    for (let c = 0; c < state.cols; c++) {
      for (const parent of [top, bottom]) {
        const s = document.createElement("span");
        s.textContent = c + 1;
        parent.appendChild(s);
      }
    }

    for (let r = 0; r < state.rows; r++) {
      const s = document.createElement("span");
      s.textContent = state.rows - r;
      rows.appendChild(s);
    }

    state.matrix.forEach((row, r) => {
      row.forEach((value, c) => {
        const cell = document.createElement("div");

        cell.className = "pattern-cell" + (value ? " active" : "");
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.title = `Row ${r + 1}, Column ${c + 1}: ${
          value ? "Warp up" : "Weft up"
        }`;

        grid.appendChild(cell);
      });
    });
  }

  function renderLiftingPlan() {
    const root = qs("#liftingPlan");
    const labels = qs("#liftColLabels");

    if (!root) return;

    root.innerHTML = "";
    if (labels) labels.innerHTML = "";

    const { shafts, lifting } = deriveLoomFromDrawdown();

    root.style.gridTemplateColumns = `repeat(${shafts}, 1fr)`;

    root.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;

    if (labels) {
      labels.style.gridTemplateColumns = `repeat(${shafts}, 1fr)`;

      for (let shaft = 0; shaft < shafts; shaft++) {
        const label = document.createElement("span");
        label.textContent = shaft + 1;
        labels.appendChild(label);
      }
    }

    for (let r = 0; r < state.rows; r++) {
      for (let shaft = 0; shaft < shafts; shaft++) {
        const active = Boolean(lifting[r][shaft]);

        const div = document.createElement("div");

        div.className = "lift-cell" + (active ? " active" : "");

        div.dataset.r = String(r);
        div.dataset.shaft = String(shaft);

        div.title = active
          ? `Pick ${r + 1}: Lift Shaft ${shaft + 1}`
          : `Pick ${r + 1}: Shaft ${shaft + 1} down`;

        div.textContent = active ? String(shaft + 1) : "";

        root.appendChild(div);
      }
    }
  }

  function updateStats() {
    const on = state.matrix.flat().filter(Boolean).length;

    const cellCount = qs("#cellCount");
    const warpUpCount = qs("#warpUpCount");
    const repeatLabel = qs("#repeatLabel");

    if (cellCount) cellCount.textContent = state.rows * state.cols;
    if (warpUpCount) warpUpCount.textContent = on;
    if (repeatLabel) repeatLabel.textContent = `${state.cols} × ${state.rows}`;

    const draft = qs("#draftingPlan");
    const lift = qs("#liftingPlan");

    if (draft)
      draft.setAttribute("aria-label", `${state.shafts}-shaft drafting plan`);
    if (lift)
      lift.setAttribute("aria-label", `${state.shafts}-shaft lifting plan`);
  }

  function drawFabric() {
    const canvas = qs("#fabricCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 720;

    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = state.weftColor || "#ffffff";
    ctx.fillRect(0, 0, size, size);

    /*
      Zoom direction:
        state.zoom 1 -> 8 repeats visible (zoomed out)
        state.zoom 8 -> 1 repeat visible  (zoomed in)
    */
    const repeat = Math.max(1, 9 - state.zoom);
    const totalCols = Math.max(1, state.cols * repeat);
    const totalRows = Math.max(1, state.rows * repeat);
    const cw = size / totalCols;
    const ch = size / totalRows;

    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const on = state.matrix[r % state.rows][c % state.cols];

        ctx.fillStyle = on ? state.warpColor : state.weftColor;

        /*
          Slight overlap removes anti-aliased hairlines between cells.
          No strokeRect = no visible border line in live preview.
        */
        ctx.fillRect(c * cw, r * ch, Math.ceil(cw) + 1, Math.ceil(ch) + 1);
      }
    }

    if (!state.live) {
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(0, 0, size, size);
    }
  }

  function applyPreset(name) {
    const preset = weavePresets[name];

    if (!preset) {
      toast("Preset not found");
      return;
    }

    pushHistory();

    state.rows = preset.length;
    state.cols = preset[0].length;

    state.matrix = cloneMatrix(preset);

    state.designName = name.charAt(0).toUpperCase() + name.slice(1) + " Weave";

    deriveLoomFromDrawdown();

    syncControls();
    renderAll();

    qsa(".weave-preset").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === name);
    });

    toast(`${state.designName} loaded`);
  }

  function resizeGrid(rows, cols) {
    rows = clamp(Number(rows) || 8, 2, 24);
    cols = clamp(Number(cols) || 8, 2, 24);

    if (rows === state.rows && cols === state.cols) {
      return toast(`Grid is already ${cols} × ${rows}`);
    }

    pushHistory();

    const next = makeEmptyMatrix(rows, cols);

    for (let r = 0; r < Math.min(rows, state.rows); r++) {
      for (let c = 0; c < Math.min(cols, state.cols); c++) {
        next[r][c] = state.matrix[r][c];
      }
    }

    state.rows = rows;
    state.cols = cols;
    state.matrix = next;

    deriveLoomFromDrawdown();
    syncControls();
    renderAll();

    toast(`Grid changed to ${cols} × ${rows}`);
  }

  function setCell(r, c, value, record = false) {
    if (state.matrix[r]?.[c] === undefined) return;

    const normalized = value ? 1 : 0;
    if (state.matrix[r][c] === normalized) return;

    if (record) pushHistory();

    state.matrix[r][c] = normalized;

    const cell = qs(`.pattern-cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) cell.classList.toggle("active", Boolean(normalized));

    /*
      A drawdown edit can change the shaft grouping, so BOTH plans must be
      recalculated. This is what fixes the old "3 fixed rows/columns" behavior.
    */
    deriveLoomFromDrawdown();
    renderDraftingPlan();
    renderLiftingPlan();
    updateStats();

    if (state.live) drawFabric();

    requestAnimationFrame(syncPatternGeometry);
  }

  function showModal(title, html, actions = []) {
    const titleEl = qs("#modalTitle");
    const bodyEl = qs("#modalBody");
    const area = qs("#modalActions");
    const backdrop = qs("#modalBackdrop");

    if (!titleEl || !bodyEl || !area || !backdrop) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    area.innerHTML = "";

    actions.forEach((a) => {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.className = a.primary ? "primary" : "secondary";
      b.addEventListener("click", () => a.onClick?.());
      area.appendChild(b);
    });

    backdrop.classList.remove("hidden");
  }

  function closeModal() {
    qs("#modalBackdrop")?.classList.add("hidden");
  }

  let toastTimer;

  function toast(msg) {
    const el = qs("#toast");
    if (!el) return;

    el.textContent = msg;
    el.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 300);
  }

  function saveProject() {
    const nameInput = qs("#designName");
    if (nameInput) state.designName = nameInput.value.trim();

    deriveLoomFromDrawdown();

    const data = {
      format: "Texel",
      version: 1.0,
      savedAt: new Date().toISOString(),
      ...JSON.parse(snapshot()),

      /*
        Stored for inspection/interchange. On load these are recalculated from
        the matrix so old project files remain compatible.
      */
      shafts: state.shafts,
      threading: [...state.threading],
      lifting: state.lifting.map((row) => [...row]),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    downloadBlob(blob, `${safeName(state.designName || "weave-pattern")}.json`);

    toast("Project saved");
  }

  function loadProjectFile(file) {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (!data.matrix || !Array.isArray(data.matrix)) {
          throw new Error("Invalid project file");
        }

        const rows = clamp(Number(data.rows) || data.matrix.length || 8, 2, 24);

        const cols = clamp(
          Number(data.cols) || data.matrix[0]?.length || 8,
          2,
          24,
        );

        pushHistory();

        state.rows = rows;
        state.cols = cols;
        state.matrix = normalizeMatrix(data.matrix, rows, cols);
        state.warpColor = data.warpColor || "#6f3de0";
        state.weftColor = data.weftColor || "#f7f7f7";
        state.zoom = clamp(Number(data.zoom) || 4, 1, 8);
        state.designName = data.designName || "";
        state.live = data.live !== false;

        deriveLoomFromDrawdown();
        syncControls();
        renderAll();

        toast("Project opened");
      } catch (e) {
        showModal("Open failed", `<p>${escapeHtml(e.message)}</p>`);
      }
    };

    reader.readAsText(file);
  }

  function newProject() {
    pushHistory();

    state.rows = 8;
    state.cols = 8;
    state.matrix = makeEmptyMatrix(8, 8);
    state.designName = "";
    state.zoom = 4;
    state.warpColor = "#6f3de0";
    state.weftColor = "#f7f7f7";
    state.live = true;

    deriveLoomFromDrawdown();
    syncControls();
    renderAll();

    toast("New project created");
  }

  function clearPattern() {
    pushHistory();

    state.matrix = makeEmptyMatrix(state.rows, state.cols);

    deriveLoomFromDrawdown();
    renderAll();

    toast("Pattern cleared");
  }

  function safeName(name) {
    return (
      String(name)
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "weave-pattern"
    );
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>'"]/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#039;",
          '"': "&quot;",
        })[m],
    );
  }

  function exportPNG() {
    drawFabric();

    const canvas = qs("#fabricCanvas");
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return toast("PNG export failed");

      downloadBlob(
        blob,
        `${safeName(state.designName || "weave-pattern")}.png`,
      );
    }, "image/png");

    closeModal();
    toast("PNG exported");
  }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(",")[1]);
    const arr = new Uint8Array(bin.length);

    for (let i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }

    return arr;
  }

  function buildSimplePdfFromJpeg(jpegBytes, width, height) {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let total = 0;

    const add = (data) => {
      const bytes = typeof data === "string" ? enc.encode(data) : data;
      chunks.push(bytes);
      total += bytes.length;
    };

    const obj = (n, body) => {
      offsets[n] = total;
      add(`${n} 0 obj\n${body}\nendobj\n`);
    };

    add("%PDF-1.4\n%âãÏÓ\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");

    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 36;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / width, maxH / height);
    const drawW = width * scale;
    const drawH = height * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    obj(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    );

    offsets[4] = total;

    add(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    );

    add(jpegBytes);
    add("\nendstream\nendobj\n");

    const content =
      `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ` +
      `${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;

    obj(5, `<< /Length ${content.length} >>\nstream\n${content}endstream`);

    const xref = total;

    add("xref\n0 6\n0000000000 65535 f \n");

    for (let i = 1; i <= 5; i++) {
      add(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }

    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

    const out = new Uint8Array(total);
    let pos = 0;

    chunks.forEach((ch) => {
      out.set(ch, pos);
      pos += ch.length;
    });

    return out;
  }

  function exportPDF() {
    drawFabric();

    const canvas = qs("#fabricCanvas");
    if (!canvas) return;

    const jpeg = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.95));
    const pdf = buildSimplePdfFromJpeg(jpeg, canvas.width, canvas.height);

    downloadBlob(
      new Blob([pdf], { type: "application/pdf" }),
      `${safeName(state.designName || "weave-pattern")}.pdf`,
    );

    closeModal();
    toast("PDF exported");
  }

  function openExportDialog() {
    showModal(
      "Export Pattern",
      `
        <p>Choose an export format. The exported file contains the repeated live fabric preview.</p>
        <div class="option-grid">
          <button class="option-btn" id="exportPngOption">
            <strong>PNG Image</strong><br>
            <small>High-quality image, easy to share or print.</small>
          </button>
          <button class="option-btn" id="exportPdfOption">
            <strong>PDF Document</strong><br>
            <small>A4 page with the repeated fabric preview centered on the page.</small>
          </button>
        </div>
      `,
    );

    qs("#exportPngOption")?.addEventListener("click", exportPNG);
    qs("#exportPdfOption")?.addEventListener("click", exportPDF);
  }

  function actionHandler(action) {
    closeMenus();

    switch (action) {
      case "new":
        return confirmNew();

      case "open":
        return qs("#openFileInput")?.click();

      case "save":
        return saveProject();

      case "print":
        return printProject();

      case "exit":
        window.close();

        setTimeout(() => {
          showModal(
            "Exit",
            "<p>Your browser may block scripts from closing this tab. You can safely close the tab or window manually.</p>",
          );
        }, 100);

        return;

      case "undo":
        return undo();

      case "redo":
        return redo();

      case "color":
        return showColorDialog();

      case "clear":
        return clearPattern();

      case "zoomIn":
        return changeZoom(1);

      case "zoomOut":
        return changeZoom(-1);

      case "liveSimulation":
        state.live = !state.live;
        syncControls();
        drawFabric();
        return toast(`Live Simulation ${state.live ? "On" : "Off"}`);

      case "about":
        return showModal(
          "About Texel",
          `<p><strong>Texel</strong> is an interactive weave pattern designer for building drawdowns, deriving proper threading and lifting plans, previewing repeated fabric, saving projects, printing, and exporting artwork.</p><p>Designed by Sushmoy Saha Joy.</p>`,
        );

      case "tutorials":
        return showTutorials();

      case "account":
        return showAccount();

      case "updates":
        return showModal(
          "Updates",
          `<p><strong>Version 1.0</strong></p>
           <p>If you have any suggestions for improving this web app, please email me: <a href="mailto:sushmoysaha2299@gmail.com" style="text-decoration: none;">sushmoysaha2299@gmail.com</a></p>
           <p>Follow me on facebook: <a href="https://www.facebook.com/sushmoysahajoy" style="text-decoration: none;">Sushmoy Saha Joy</a></p>`,
        );

      default:
        return;
    }
  }

  function confirmNew() {
    showModal(
      "New Project",
      "<p>Create a new project? Unsaved changes will be lost.</p>",
      [
        { label: "Cancel", onClick: closeModal },
        {
          label: "Create New",
          primary: true,
          onClick: () => {
            closeModal();
            newProject();
          },
        },
      ],
    );
  }

  function showColorDialog() {
    showModal(
      "Yarn Colors",
      `
        <div class="option-grid">
          <label>
            Warp color<br>
            <input id="modalWarp" type="color" value="${state.warpColor}">
          </label>
          <label>
            Weft color<br>
            <input id="modalWeft" type="color" value="${state.weftColor}">
          </label>
        </div>
      `,
      [
        { label: "Cancel", onClick: closeModal },
        {
          label: "Apply",
          primary: true,
          onClick: () => {
            pushHistory();

            state.warpColor = qs("#modalWarp")?.value || state.warpColor;
            state.weftColor = qs("#modalWeft")?.value || state.weftColor;

            syncControls();
            renderAll();
            closeModal();
          },
        },
      ],
    );
  }

  function showTutorials() {
    showModal(
      "Tutorials",
      `
        <p><strong>1. Build a drawdown:</strong> click or drag across cells in the large pattern grid. Colored cells mean warp-up; light cells mean weft-up.</p>
        <p><strong>2. Drafting plan:</strong> the app groups identical warp-column profiles onto the same shaft, producing the minimum shaft count needed to reproduce your drawdown exactly.</p>
        <p><strong>3. Lifting plan:</strong> for every weft pick, the app marks the shafts that must be lifted. Drafting + lifting therefore recreates the main pattern exactly.</p>
        <p><strong>4. Resize:</strong> choose Warp Ends and Weft Picks in the Control Panel, then select Apply.</p>
        <p><strong>5. Colors:</strong> pick Warp and Weft yarn colors, then Apply.</p>
        <p><strong>6. Preview:</strong> move Zoom right / press + to zoom in; move it left / press − to zoom out.</p>
        <p><strong>7. Save/Open:</strong> projects are stored as JSON files and can be reopened later.</p>
        <p><strong>8. Print:</strong> File → Print prints the pattern, drafting plan, lifting plan and fabric preview using the page print layout.</p>
        <p><strong>9. Export:</strong> use the purple Export button for a PNG or fabric-preview PDF.</p>
      `,
    );
  }

  function showAccount() {
    const saved = localStorage.getItem("texelAccount") || "";

    showModal(
      "My Account",
      `<p>This lightweight web app keeps your display name locally in this browser.</p>
       <label>
         Display name<br>
         <input
           id="accountName"
           type="text"
           value="${escapeHtml(saved)}"
           style="width:100%;margin-top:6px;padding:9px;border:1px solid #ccd2d9;border-radius:6px"
         >
       </label>`,
      [
        { label: "Cancel", onClick: closeModal },
        {
          label: "Save",
          primary: true,
          onClick: () => {
            localStorage.setItem(
              "texelAccount",
              qs("#accountName")?.value.trim() || "",
            );

            closeModal();
            toast("Account name saved locally");
          },
        },
      ],
    );
  }

  function changeZoom(delta) {
    state.zoom = clamp(state.zoom + delta, 1, 8);

    const zoomRange = qs("#zoomRange");
    if (zoomRange) zoomRange.value = state.zoom;

    drawFabric();
  }

  function closeMenus() {
    qsa(".dropdown").forEach((d) => d.classList.remove("open"));
    qsa(".menu-btn").forEach((b) => b.classList.remove("active"));
  }

  function updatePrintHeader() {
    const printName = qs("#printDesignName");

    if (printName) {
      printName.textContent = state.designName
        ? `Design: ${state.designName}`
        : "Weave Pattern Design";
    }
  }

  function printProject() {
    updatePrintHeader();
    deriveLoomFromDrawdown();
    renderDraftingPlan();
    renderLiftingPlan();
    drawFabric();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  function ensureRuntimeStyles() {
    if (qs("#texelRuntimeStyles")) return;

    const style = document.createElement("style");
    style.id = "texelRuntimeStyles";

    style.textContent = `
      @media print {
        *,
        *::before,
        *::after {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        .pattern-cell.active {
          background: var(--weave-print-warp, #6f3de0) !important;
          background-image: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .draft-cell.active,
        .lift-cell.active {
          background: #c9bdea !important;
          background-image: none !important;
          color: #2f2450 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        #fabricCanvas {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function bindMenus() {
    qsa(".menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const menu = qs(`#${btn.dataset.menu}`);
        if (!menu) return;

        const was = menu.classList.contains("open");
        closeMenus();

        if (!was) {
          menu.classList.add("open");
          btn.classList.add("active");
        }
      });
    });

    qsa(".dropdown button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => actionHandler(btn.dataset.action));
    });

    document.addEventListener("click", closeMenus);
  }

  function bindControls() {
    qs("#applyGrid")?.addEventListener("click", () => {
      resizeGrid(qs("#weftPicks")?.value, qs("#warpEnds")?.value);
    });

    // Default weave preset buttons
    qsa(".weave-preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyPreset(btn.dataset.preset);
      });
    });

    qs("#applyColor")?.addEventListener("click", () => {
      pushHistory();

      state.warpColor = qs("#warpColor")?.value || state.warpColor;
      state.weftColor = qs("#weftColor")?.value || state.weftColor;

      syncControls();
      renderAll();

      toast("Yarn colors applied");
    });

    qs("#designName")?.addEventListener("input", (e) => {
      state.designName = e.target.value;
    });

    qs("#zoomRange")?.addEventListener("input", (e) => {
      state.zoom = clamp(Number(e.target.value) || 4, 1, 8);
      drawFabric();
    });

    qs("#zoomMinus")?.addEventListener("click", () => changeZoom(-1));
    qs("#zoomPlus")?.addEventListener("click", () => changeZoom(1));
    qs("#exportBtn")?.addEventListener("click", openExportDialog);
    qs("#previewMenu")?.addEventListener("click", openExportDialog);
    qs("#modalClose")?.addEventListener("click", closeModal);

    qs("#modalBackdrop")?.addEventListener("click", (e) => {
      if (e.target.id === "modalBackdrop") closeModal();
    });

    qs("#openFileInput")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) loadProjectFile(f);
      e.target.value = "";
    });
  }

  function bindPatternPainting() {
    const grid = qs("#patternGrid");
    if (!grid) return;

    grid.addEventListener("pointerdown", (e) => {
      const cell = e.target.closest(".pattern-cell");
      if (!cell) return;

      e.preventDefault();
      pushHistory();

      state.painting = true;

      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);

      state.paintValue = state.matrix[r][c] ? 0 : 1;

      setCell(r, c, state.paintValue);
      grid.setPointerCapture?.(e.pointerId);
    });

    grid.addEventListener("pointermove", (e) => {
      if (!state.painting) return;

      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest?.(".pattern-cell");

      if (!el || !grid.contains(el)) return;

      setCell(Number(el.dataset.r), Number(el.dataset.c), state.paintValue);
    });

    window.addEventListener("pointerup", () => {
      if (!state.painting) return;

      state.painting = false;

      if (!state.live) drawFabric();
    });
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (mod && key === "s") {
        e.preventDefault();
        saveProject();
      } else if (mod && key === "o") {
        e.preventDefault();
        qs("#openFileInput")?.click();
      } else if (mod && key === "p") {
        e.preventDefault();
        printProject();
      } else if (e.key === "Escape") {
        closeMenus();
        closeModal();
      } else if (mod && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        changeZoom(1);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        changeZoom(-1);
      }
    });
  }

  function init() {
    ensureRuntimeStyles();
    initializeMatrix();
    syncControls();

    bindMenus();
    bindControls();
    bindPatternPainting();
    bindKeyboard();

    window.addEventListener("resize", () => {
      syncPatternGeometry();
      drawFabric();
    });

    window.addEventListener("beforeprint", () => {
      updatePrintHeader();
      drawFabric();
    });

    renderAll();
    requestAnimationFrame(syncPatternGeometry);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

// Right-click menu disable
document.addEventListener("contextmenu", (event) => event.preventDefault());

// Inspect element o view source er keyboard shortcuts disable
document.onkeydown = function (e) {
  // F12 disable
  if (e.keyCode == 123) {
    return false;
  }
  // Ctrl+Shift+I (Inspect)
  if (e.ctrlKey && e.shiftKey && e.keyCode == "I".charCodeAt(0)) {
    return false;
  }
  // Ctrl+Shift+C (Inspect Element)
  if (e.ctrlKey && e.shiftKey && e.keyCode == "C".charCodeAt(0)) {
    return false;
  }
  // Ctrl+Shift+J (Console)
  if (e.ctrlKey && e.shiftKey && e.keyCode == "J".charCodeAt(0)) {
    return false;
  }
  // Ctrl+U (View Page Source)
  if (e.ctrlKey && e.keyCode == "U".charCodeAt(0)) {
    return false;
  }
};
