/*
  charts.js
  Minimal dependency-free chart drawing on an HTML5 <canvas>.
  Mirrors the desktop app's Tkinter canvas charts so the offline PWA
  needs no external library (keeps the whole app installable with a
  single, small file set — nothing to download from a CDN at runtime).
*/

const PALETTE = ["#1C3D3A", "#C08A28", "#2F7A5C", "#B4453A", "#6D5B8C",
                 "#7A6A53", "#5B7FA6", "#8C8C8C", "#B79A3E", "#4E8FA6"];

function setupCanvasDPR(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function drawEmpty(ctx, w, h, message = "No data for this period") {
  ctx.fillStyle = "#8a8a8a";
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, w / 2, h / 2);
}

function drawBarChart(canvas, labels, values, { title = "", valueFmt = (v) => v.toFixed(0) } = {}) {
  const { ctx, w, h } = setupCanvasDPR(canvas);
  ctx.clearRect(0, 0, w, h);

  const padLeft = 46, padRight = 14, padTop = title ? 26 : 10, padBottom = 34;
  const chartW = Math.max(w - padLeft - padRight, 40);
  const chartH = Math.max(h - padTop - padBottom, 40);

  if (title) {
    ctx.fillStyle = "#1C3D3A";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, w / 2, 16);
  }

  if (!values.length) return drawEmpty(ctx, w, h);

  const maxVal = Math.max(...values, 1);
  const n = values.length;
  const gap = 10;
  const barW = Math.max((chartW - gap * (n + 1)) / n, 4);
  const x0 = padLeft, y0 = padTop;

  ctx.strokeStyle = "#ccc";
  ctx.beginPath();
  ctx.moveTo(x0, y0 + chartH);
  ctx.lineTo(x0 + chartW, y0 + chartH);
  ctx.stroke();

  ctx.fillStyle = "#777";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = y0 + chartH - (chartH * i) / 4;
    const val = (maxVal * i) / 4;
    ctx.strokeStyle = "#eee";
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + chartW, y);
    ctx.stroke();
    ctx.fillText(valueFmt(val), x0 - 6, y + 3);
  }

  labels.forEach((label, i) => {
    const val = values[i];
    const barH = (val / maxVal) * chartH;
    const x = x0 + gap + i * (barW + gap);
    const yTop = y0 + chartH - barH;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(x, yTop, barW, barH);

    ctx.fillStyle = "#333";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(valueFmt(val), x + barW / 2, yTop - 5);

    let shortLabel = String(label);
    if (shortLabel.length > 10) shortLabel = shortLabel.slice(0, 9) + "…";
    ctx.fillStyle = "#555";
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillText(shortLabel, x + barW / 2, y0 + chartH + 14);
  });
}

function drawLineChart(canvas, labels, values, { title = "", valueFmt = (v) => v.toFixed(0), color = "#1C3D3A" } = {}) {
  const { ctx, w, h } = setupCanvasDPR(canvas);
  ctx.clearRect(0, 0, w, h);

  const padLeft = 46, padRight = 14, padTop = title ? 26 : 10, padBottom = 24;
  const chartW = Math.max(w - padLeft - padRight, 40);
  const chartH = Math.max(h - padTop - padBottom, 40);

  if (title) {
    ctx.fillStyle = "#1C3D3A";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, w / 2, 16);
  }

  if (!values.length) return drawEmpty(ctx, w, h);

  const maxVal = Math.max(...values, 1);
  const n = values.length;
  const x0 = padLeft, y0 = padTop;

  ctx.strokeStyle = "#ccc";
  ctx.beginPath();
  ctx.moveTo(x0, y0 + chartH);
  ctx.lineTo(x0 + chartW, y0 + chartH);
  ctx.stroke();

  ctx.fillStyle = "#777";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = y0 + chartH - (chartH * i) / 4;
    const val = (maxVal * i) / 4;
    ctx.strokeStyle = "#eee";
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + chartW, y);
    ctx.stroke();
    ctx.fillText(valueFmt(val), x0 - 6, y + 3);
  }

  const pointsX = n === 1 ? [x0 + chartW / 2] : values.map((_, i) => x0 + (chartW * i) / (n - 1));
  const points = values.map((val, i) => [pointsX[i], y0 + chartH - (val / maxVal) * chartH]);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  ctx.fillStyle = color;
  points.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelStep = Math.max(1, Math.floor(n / 6));
  ctx.fillStyle = "#555";
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < n; i += labelStep) {
    const shortLabel = String(labels[i]).slice(-5);
    ctx.fillText(shortLabel, pointsX[i], y0 + chartH + 14);
  }
}

function drawPieChart(canvas, labels, values, { title = "" } = {}) {
  const { ctx, w, h } = setupCanvasDPR(canvas);
  ctx.clearRect(0, 0, w, h);

  if (title) {
    ctx.fillStyle = "#1C3D3A";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, w / 2, 16);
  }

  const total = values.reduce((a, b) => a + b, 0);
  if (!values.length || total <= 0) return drawEmpty(ctx, w, h);

  const diameter = Math.max(Math.min(w * 0.55, h - 50), 20);
  const cx = w * 0.32, cy = h / 2 + 8;
  const radius = Math.max(diameter / 2, 1);

  let startAngle = -Math.PI / 2;
  let legendY = 30;
  const legendX = w * 0.6;

  labels.forEach((label, i) => {
    const val = values[i];
    const slice = (val / total) * Math.PI * 2;
    const color = PALETTE[i % PALETTE.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    startAngle += slice;

    const pct = (val / total) * 100;
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY, 10, 10);
    let shortLabel = String(label);
    if (shortLabel.length > 16) shortLabel = shortLabel.slice(0, 15) + "…";
    ctx.fillStyle = "#333";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${shortLabel} (${pct.toFixed(0)}%)`, legendX + 15, legendY + 9);
    legendY += 18;
  });
}
