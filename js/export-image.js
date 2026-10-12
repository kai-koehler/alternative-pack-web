/* Draws the shareable Alternative Pack card (1500 × 1500) onto a canvas. */
(function () {
  "use strict";

  const SIZE = 1500;
  const MARGIN = 72;
  const GRID_TOP = 300;
  const GRID_BOTTOM = SIZE - MARGIN;
  const GAP = 24;

  const COLORS = {
    page: "#111317",
    layer: "#21242C",
    layerSecondary: "#373C49",
    border: "#373C49",
    heading: "#F0F2F4",
    body: "#D5D9E0",
    caption: "#848FA4",
    primary: "#00CCAA",
    primary100: "#002922",
  };

  const HEADING_FONT = '"Poppins", -apple-system, "Segoe UI", sans-serif';
  const BODY_FONT = '"Roboto", -apple-system, "Segoe UI", Arial, sans-serif';

  const logoCache = new Map();

  /** Resolves to the loaded logo, or null when it is missing. */
  function loadLogo(id) {
    if (!logoCache.has(id)) {
      logoCache.set(id, new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `assets/logos/${id}.jpg`;
      }));
    }
    return logoCache.get(id);
  }

  async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`600 40px ${HEADING_FONT}`),
          document.fonts.load(`400 20px ${BODY_FONT}`),
          document.fonts.load(`500 20px ${BODY_FONT}`),
        ]),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // System fonts are an acceptable fallback.
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawLogo(ctx, app, logo, x, y, size) {
    const radius = size * 0.22;
    ctx.save();
    roundRect(ctx, x, y, size, size, radius);
    ctx.clip();
    if (logo) {
      ctx.drawImage(logo, x, y, size, size);
    } else {
      ctx.fillStyle = COLORS.primary100;
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = COLORS.primary;
      ctx.font = `600 ${Math.round(size * 0.42)}px ${HEADING_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(app.name.trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2 + size * 0.03);
    }
    ctx.restore();
  }

  /** Shrinks the font down to 70% to fit, then truncates with an ellipsis. */
  function fitText(ctx, text, maxWidth, fontSize, weight, family) {
    let size = fontSize;
    const minSize = Math.max(9, fontSize * 0.7);
    ctx.font = `${weight} ${size}px ${family}`;
    while (ctx.measureText(text).width > maxWidth && size > minSize) {
      size -= 0.5;
      ctx.font = `${weight} ${size}px ${family}`;
    }
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return `${cut.trimEnd()}…`;
  }

  function drawText(ctx, text, x, y, maxWidth, options) {
    const { size, weight = 400, family = BODY_FONT, color = COLORS.body, align = "left" } = options;
    const fitted = fitText(ctx, text, maxWidth, size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(fitted, x, y);
  }

  function drawArrow(ctx, cx, cy, length) {
    const head = length * 0.32;
    ctx.save();
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = Math.max(2, length * 0.09);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - length / 2, cy);
    ctx.lineTo(cx + length / 2, cy);
    ctx.moveTo(cx + length / 2 - head, cy - head);
    ctx.lineTo(cx + length / 2, cy);
    ctx.lineTo(cx + length / 2 - head, cy + head);
    ctx.stroke();
    ctx.restore();
  }

  // Hugeicons "arrow-data-transfer-horizontal" (stroke rounded), 24 × 24.
  const SWAP_ICON = new Path2D("M19 9H6.659c-1.006 0-1.51 0-1.634-.309c-.125-.308.23-.672.941-1.398L8.211 5M5 15h12.341c1.006 0 1.51 0 1.634.309c.125.308-.23.672-.941 1.398L15.789 19");

  function drawMark(ctx, x, y, size) {
    const s = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = COLORS.primary;
    roundRect(ctx, 0, 0, 24, 24, 6.5);
    ctx.fill();
    // Scale the icon to sit inside the tile with the same padding as before.
    ctx.translate(12, 12);
    ctx.scale(0.66, 0.66);
    ctx.translate(-12, -12);
    ctx.strokeStyle = COLORS.page;
    ctx.lineWidth = 2.2 / 0.66;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(SWAP_ICON);
    ctx.restore();
  }

  function layoutFor(count) {
    const columns = count <= 12 ? Math.max(1, Math.min(count, 3)) : 4;
    const rows = Math.ceil(count / columns);
    const areaWidth = SIZE - MARGIN * 2;
    const areaHeight = GRID_BOTTOM - GRID_TOP;
    const width = (areaWidth - GAP * (columns - 1)) / columns;
    const maxHeight = count <= 3 ? 420 : 300;
    const height = Math.min(maxHeight, (areaHeight - GAP * (rows - 1)) / rows);
    const gridHeight = rows * height + (rows - 1) * GAP;
    const top = GRID_TOP + Math.max(0, (areaHeight - gridHeight) / 2);
    return { columns, rows, width, height, top };
  }

  function drawCard(ctx, item, logos, x, y, w, h) {
    const k = h / 300; // scale relative to a 300px tall card
    const pad = Math.max(14, 24 * k);

    ctx.fillStyle = COLORS.layer;
    roundRect(ctx, x, y, w, h, 22 * k + 4);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Category label
    const labelSize = Math.max(13, 20 * k);
    drawText(ctx, item.category.toUpperCase(), x + pad, y + pad + labelSize * 0.8, w - pad * 2, {
      size: labelSize,
      weight: 500,
      color: COLORS.caption,
    });

    const contentTop = y + pad + labelSize * 1.5;
    const contentHeight = y + h - pad - contentTop;
    const arrowLength = Math.max(18, Math.min(40 * k, w * 0.08));
    const arrowGap = arrowLength * 0.5;
    const columnWidth = (w - pad * 2 - arrowLength - arrowGap * 2) / 2;
    const nameSize = Math.max(12, 22 * k);
    const logoSize = Math.min(columnWidth * 0.78, contentHeight - nameSize * 1.9, 170);
    const blockHeight = logoSize + nameSize * 1.7;
    const blockTop = contentTop + (contentHeight - blockHeight) / 2;
    const leftCenter = x + pad + columnWidth / 2;
    const rightX = x + w - pad - columnWidth;

    // Mainstream app
    drawLogo(ctx, item.main, logos.get(item.main.id), leftCenter - logoSize / 2, blockTop, logoSize);
    drawText(ctx, item.main.name, leftCenter, blockTop + logoSize + nameSize * 1.35, columnWidth, {
      size: nameSize,
      color: COLORS.caption,
      align: "center",
    });

    drawArrow(ctx, x + pad + columnWidth + arrowGap + arrowLength / 2, blockTop + logoSize / 2, arrowLength);

    // Alternatives
    if (item.alts.length === 1) {
      const alt = item.alts[0];
      const center = rightX + columnWidth / 2;
      drawLogo(ctx, alt, logos.get(alt.id), center - logoSize / 2, blockTop, logoSize);
      drawText(ctx, alt.name, center, blockTop + logoSize + nameSize * 1.35, columnWidth, {
        size: nameSize,
        weight: 500,
        color: COLORS.heading,
        align: "center",
      });
      return;
    }

    const rowGap = Math.max(6, 12 * k);
    const smallLogo = Math.min(
      (contentHeight - rowGap * (item.alts.length - 1)) / item.alts.length,
      logoSize * 0.5,
      64,
    );
    const listHeight = item.alts.length * smallLogo + (item.alts.length - 1) * rowGap;
    let rowY = blockTop + logoSize / 2 - listHeight / 2;
    const smallName = Math.max(11, Math.min(nameSize * 0.85, smallLogo * 0.5));
    for (const alt of item.alts) {
      drawLogo(ctx, alt, logos.get(alt.id), rightX, rowY, smallLogo);
      drawText(ctx, alt.name, rightX + smallLogo + 10 * k + 4, rowY + smallLogo / 2 + smallName * 0.36, columnWidth - smallLogo - 10 * k - 4, {
        size: smallName,
        weight: 500,
        color: COLORS.heading,
      });
      rowY += smallLogo + rowGap;
    }
  }

  function drawFrame(ctx, count) {
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const glow = ctx.createRadialGradient(SIZE - 120, 80, 0, SIZE - 120, 80, 760);
    glow.addColorStop(0, "rgba(0, 204, 170, 0.16)");
    glow.addColorStop(1, "rgba(0, 204, 170, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Eyebrow
    drawMark(ctx, MARGIN, MARGIN, 40);
    ctx.fillStyle = COLORS.primary;
    ctx.font = `500 22px ${BODY_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("MY ALTERNATIVE PACK", MARGIN + 56, MARGIN + 21);

    // Title
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.heading;
    ctx.font = `600 64px ${HEADING_FONT}`;
    ctx.fillText("I switched to", MARGIN, MARGIN + 132);
    const lead = ctx.measureText("I switched to ").width;
    ctx.fillStyle = COLORS.primary;
    ctx.fillText("alternative apps.", MARGIN + lead, MARGIN + 132);

    ctx.fillStyle = COLORS.caption;
    ctx.font = `400 26px ${BODY_FONT}`;
    const label = count === 1 ? "1 switch" : `${count} switches`;
    ctx.fillText(`${label} and counting.`, MARGIN, MARGIN + 182);
  }

  function drawEmpty(ctx) {
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = COLORS.layerSecondary;
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 4;
    roundRect(ctx, 120, 120, SIZE - 240, SIZE - 240, 60);
    ctx.stroke();
    ctx.setLineDash([]);
    drawMark(ctx, SIZE / 2 - 60, SIZE / 2 - 190, 120);
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.heading;
    ctx.font = `600 60px ${HEADING_FONT}`;
    ctx.fillText("Your pack is empty", SIZE / 2, SIZE / 2 + 30);
    ctx.fillStyle = COLORS.caption;
    ctx.font = `400 36px ${BODY_FONT}`;
    ctx.fillText("Pick an alternative to get started.", SIZE / 2, SIZE / 2 + 100);
  }

  /**
   * Renders the pack. `items` holds only categories with alternatives:
   * { category, main: { id, name }, alts: [{ id, name }] }.
   * With `withLogos: false` every logo is drawn as a letter tile.
   */
  async function render(canvas, items, { pixelSize = SIZE, withLogos = true } = {}) {
    await ensureFonts();
    const logos = new Map();
    if (withLogos) {
      const apps = items.flatMap((item) => [item.main, ...item.alts]);
      const loaded = await Promise.all(apps.map((app) => loadLogo(app.id)));
      apps.forEach((app, index) => logos.set(app.id, loaded[index]));
    }

    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelSize / SIZE, 0, 0, pixelSize / SIZE, 0, 0);
    ctx.imageSmoothingQuality = "high";

    if (items.length === 0) {
      drawEmpty(ctx);
      return canvas;
    }

    drawFrame(ctx, items.length);
    const layout = layoutFor(items.length);
    items.forEach((item, index) => {
      const row = Math.floor(index / layout.columns);
      const col = index % layout.columns;
      // Center an incomplete last row.
      const inRow = row === layout.rows - 1 ? items.length - row * layout.columns : layout.columns;
      const rowWidth = inRow * layout.width + (inRow - 1) * GAP;
      const left = (SIZE - rowWidth) / 2;
      drawCard(
        ctx,
        item,
        logos,
        left + col * (layout.width + GAP),
        layout.top + row * (layout.height + GAP),
        layout.width,
        layout.height,
      );
    });
    return canvas;
  }

  /** Renders a 3000px PNG. Falls back to letter tiles if the logos taint the canvas (file://). */
  async function toPngBlob(items) {
    const canvas = document.createElement("canvas");
    const attempt = (withLogos) => render(canvas, items, { pixelSize: SIZE * 2, withLogos }).then(
      () => new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Empty image"))), "image/png");
        } catch (error) {
          reject(error);
        }
      }),
    );
    try {
      return { blob: await attempt(true), withLogos: true };
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
      return { blob: await attempt(false), withLogos: false };
    }
  }

  window.AlternativePackImage = { render, toPngBlob, loadLogo };
})();
