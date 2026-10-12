(function () {
  "use strict";

  const MAX_ALTERNATIVES = 3;
  const STORAGE_KEY = "alternative-pack:v1";
  const FILENAME = "alternative-pack.png";
  const SHARE_URL = "https://tools.kai-koehler.com/alternative-pack/";

  const toApp = ([id, name]) => ({ id, name });
  const byName = (a, b) => a.name.localeCompare(b.name);

  const catalog = window.ALTERNATIVE_PACK_CATALOG.map((category) => ({
    name: category.name,
    defaultMain: toApp(category.mainstream[0]),
    mainstream: category.mainstream.map(toApp).sort(byName),
    alternatives: category.alternatives.map(toApp).sort(byName),
  }));

  // ---------- State ----------

  /** category name -> { main: App, alts: App[] (in pick order) } */
  const state = new Map(catalog.map((category) => [category.name, { main: category.defaultMain, alts: [] }]));

  function restore() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return;
    }
    if (!saved || typeof saved !== "object") return;
    for (const category of catalog) {
      const entry = saved[category.name];
      if (!entry) continue;
      const main = category.mainstream.find((app) => app.id === entry.main);
      const alts = (Array.isArray(entry.alts) ? entry.alts : [])
        .map((id) => category.alternatives.find((app) => app.id === id))
        .filter(Boolean)
        .slice(0, MAX_ALTERNATIVES);
      state.set(category.name, { main: main || category.defaultMain, alts });
    }
  }

  function persist() {
    const data = {};
    for (const [name, entry] of state) {
      data[name] = { main: entry.main.id, alts: entry.alts.map((app) => app.id) };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage can be unavailable (private mode); picks then last for this visit.
    }
  }

  function pickedItems() {
    return catalog
      .map((category) => ({ category: category.name, ...state.get(category.name) }))
      .filter((item) => item.alts.length > 0);
  }

  // ---------- Elements ----------

  const grid = document.getElementById("category-grid");
  const template = document.getElementById("category-template");
  const filterInput = document.getElementById("filter-input");
  const filterEmpty = document.getElementById("filter-empty");
  const previewCanvas = document.getElementById("preview-canvas");
  const packCount = document.getElementById("pack-count");
  const feedback = document.getElementById("feedback");
  const resetButton = document.getElementById("reset-button");
  const shareButtons = [document.getElementById("share-button"), document.getElementById("share-button-mobile")];
  const downloadButtons = [document.getElementById("download-button"), document.getElementById("download-button-mobile")];

  const cards = new Map();

  function icon(name, className = "icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.appendChild(use);
    return svg;
  }

  /** A logo image that turns into a letter tile when the file is missing. */
  function logoElement(app, className = "logo") {
    const img = document.createElement("img");
    img.className = className;
    img.src = `assets/logos/${app.id}.jpg`;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const tile = document.createElement("span");
      tile.className = `${className} logo--fallback`;
      tile.textContent = app.name.trim().charAt(0).toUpperCase();
      img.replaceWith(tile);
    }, { once: true });
    return img;
  }

  // ---------- Category cards ----------

  function buildCards() {
    const fragment = document.createDocumentFragment();
    for (const category of catalog) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.category = category.name;
      card.querySelector(".category-card__title").textContent = category.name;
      const mainTrigger = card.querySelector('[data-kind="main"] .picker__trigger');
      const altTrigger = card.querySelector('[data-kind="alt"] .picker__trigger');
      mainTrigger.addEventListener("click", () => toggleMenu(category, "main", mainTrigger));
      altTrigger.addEventListener("click", () => toggleMenu(category, "alt", altTrigger));
      for (const trigger of [mainTrigger, altTrigger]) {
        trigger.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!menu.isOpenFor(trigger)) toggleMenu(category, trigger === mainTrigger ? "main" : "alt", trigger);
            menu.focusFirst();
          }
        });
      }
      cards.set(category.name, { card, mainTrigger, altTrigger });
      fragment.appendChild(card);
    }
    grid.appendChild(fragment);
  }

  function updateCard(category) {
    const { card, mainTrigger, altTrigger } = cards.get(category.name);
    const entry = state.get(category.name);

    const mainLogos = mainTrigger.querySelector(".picker__logos");
    mainLogos.replaceChildren(logoElement(entry.main));
    mainTrigger.querySelector(".picker__name").textContent = entry.main.name;
    mainTrigger.setAttribute("aria-label", `${category.name}: used before, ${entry.main.name}. Change app`);

    const altLogos = altTrigger.querySelector(".picker__logos");
    const altName = altTrigger.querySelector(".picker__name");
    altLogos.classList.toggle("is-empty", entry.alts.length === 0);
    altLogos.classList.toggle("is-multi", entry.alts.length > 1);
    if (entry.alts.length === 0) {
      altLogos.replaceChildren(icon("plus"));
      altName.textContent = "Pick";
    } else {
      altLogos.replaceChildren(...entry.alts.map((app) => logoElement(app)));
      altName.textContent = entry.alts.length === 1
        ? entry.alts[0].name
        : `${entry.alts[0].name} +${entry.alts.length - 1}`;
    }
    altName.classList.toggle("is-placeholder", entry.alts.length === 0);
    const names = entry.alts.map((app) => app.name).join(", ") || "none";
    altTrigger.setAttribute(
      "aria-label",
      `${category.name}: switched to ${names}, ${entry.alts.length} of ${MAX_ALTERNATIVES} picked. Change alternatives`,
    );

    card.classList.toggle("is-picked", entry.alts.length > 0);
    card.querySelector(".count-badge").textContent = `${entry.alts.length}/${MAX_ALTERNATIVES}`;
  }

  // ---------- Dropdown menu ----------

  const menu = (() => {
    const element = document.createElement("div");
    element.className = "menu";
    element.hidden = true;
    document.body.appendChild(element);

    let current = null; // { category, kind, trigger }

    function options() {
      return Array.from(element.querySelectorAll(".menu__option:not(:disabled)"));
    }

    function position() {
      if (!current) return;
      const rect = current.trigger.getBoundingClientRect();
      const width = Math.min(260, window.innerWidth - 24);
      element.style.width = `${width}px`;
      let left = current.kind === "alt" ? rect.right - width : rect.left;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = element.offsetHeight;
      const placeAbove = below < Math.min(height, 260) && above > below;
      element.style.left = `${left}px`;
      element.style.top = placeAbove
        ? `${Math.max(12, rect.top - 6 - height)}px`
        : `${rect.bottom + 6}px`;
      element.style.maxHeight = `${Math.min(380, (placeAbove ? above : below) - 6)}px`;
    }

    function render() {
      const { category, kind } = current;
      const entry = state.get(category.name);
      const isAlt = kind === "alt";
      const apps = isAlt ? category.alternatives : category.mainstream;
      const focusedId = document.activeElement?.closest?.(".menu__option")?.dataset.id;
      const scrollTop = element.querySelector(".menu__list")?.scrollTop ?? 0;

      const head = document.createElement("div");
      head.className = "menu__head";
      head.innerHTML = isAlt
        ? `<span>Alternatives</span><span>${entry.alts.length}/${MAX_ALTERNATIVES}</span>`
        : "<span>App you used before</span>";

      const list = document.createElement("ul");
      list.className = "menu__list";
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", `${category.name} ${isAlt ? "alternatives" : "mainstream apps"}`);
      if (isAlt) list.setAttribute("aria-multiselectable", "true");

      for (const app of apps) {
        const selected = isAlt ? entry.alts.some(({ id }) => id === app.id) : entry.main.id === app.id;
        const item = document.createElement("li");
        const option = document.createElement("button");
        option.type = "button";
        option.className = "menu__option";
        option.dataset.id = app.id;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(selected));
        option.disabled = isAlt && !selected && entry.alts.length >= MAX_ALTERNATIVES;

        const logo = document.createElement("span");
        logo.className = "menu__logo";
        logo.appendChild(logoElement(app));
        const label = document.createElement("span");
        label.className = "menu__label";
        label.textContent = app.name;
        const check = document.createElement("span");
        check.className = isAlt ? "menu__check" : "menu__check menu__check--radio";
        check.appendChild(icon("check"));

        option.append(logo, label, check);
        option.addEventListener("click", () => (isAlt ? toggleAlternative(category, app) : selectMain(category, app)));
        item.appendChild(option);
        list.appendChild(item);
      }

      const parts = [head, list];
      if (isAlt) {
        const foot = document.createElement("div");
        foot.className = "menu__foot";
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "menu__clear";
        clear.textContent = "Remove all";
        clear.disabled = entry.alts.length === 0;
        clear.addEventListener("click", () => clearAlternatives(category));
        foot.appendChild(clear);
        parts.push(foot);
      }

      element.replaceChildren(...parts);
      list.scrollTop = scrollTop;
      if (focusedId) element.querySelector(`.menu__option[data-id="${CSS.escape(focusedId)}"]`)?.focus();
    }

    function open(category, kind, trigger) {
      close(false);
      current = { category, kind, trigger };
      trigger.setAttribute("aria-expanded", "true");
      element.hidden = false;
      render();
      position();
    }

    function close(restoreFocus = true) {
      if (!current) return;
      current.trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) current.trigger.focus();
      current = null;
      element.hidden = true;
    }

    element.addEventListener("keydown", (event) => {
      const list = options();
      const index = list.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        list[(index + step + list.length) % list.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        list[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        list[list.length - 1]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        close();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (current && !element.contains(event.target) && !current.trigger.contains(event.target)) close(false);
    });
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, { passive: true });

    return {
      open,
      close,
      refresh() { if (current) { render(); position(); } },
      isOpenFor: (trigger) => current?.trigger === trigger,
      focusFirst() {
        const list = options();
        (list.find((option) => option.getAttribute("aria-selected") === "true") || list[0])?.focus();
      },
    };
  })();

  function toggleMenu(category, kind, trigger) {
    if (menu.isOpenFor(trigger)) menu.close();
    else menu.open(category, kind, trigger);
  }

  // ---------- Actions ----------

  function changed(category) {
    updateCard(category);
    persist();
    showFeedback("");
    scheduleRender();
  }

  function selectMain(category, app) {
    state.get(category.name).main = app;
    changed(category);
    menu.close();
  }

  function toggleAlternative(category, app) {
    const entry = state.get(category.name);
    if (entry.alts.some(({ id }) => id === app.id)) {
      entry.alts = entry.alts.filter(({ id }) => id !== app.id);
    } else if (entry.alts.length < MAX_ALTERNATIVES) {
      entry.alts = [...entry.alts, app];
    }
    changed(category);
    menu.refresh();
  }

  function clearAlternatives(category) {
    state.get(category.name).alts = [];
    changed(category);
    menu.close();
  }

  resetButton.addEventListener("click", () => {
    if (!window.confirm("Reset all picks? Your pack will be cleared.")) return;
    for (const category of catalog) {
      state.set(category.name, { main: category.defaultMain, alts: [] });
      updateCard(category);
    }
    persist();
    showFeedback("");
    scheduleRender();
  });

  // ---------- Filter ----------

  filterInput.addEventListener("input", () => {
    const query = filterInput.value.trim().toLowerCase();
    let visible = 0;
    for (const category of catalog) {
      const haystack = [category.name, ...category.mainstream.map((a) => a.name), ...category.alternatives.map((a) => a.name)]
        .join(" ")
        .toLowerCase();
      const match = !query || haystack.includes(query);
      cards.get(category.name).card.hidden = !match;
      if (match) visible += 1;
    }
    filterEmpty.hidden = visible > 0;
    menu.close(false);
  });

  // ---------- Preview and export ----------

  let renderTimer = 0;
  let renderVersion = 0;
  let prepared = null; // { version, promise }

  function scheduleRender() {
    renderVersion += 1;
    prepared = null;
    const items = pickedItems();
    const count = items.length;
    packCount.textContent = count === 1 ? "1 switch" : `${count} switches`;
    for (const button of [...shareButtons, ...downloadButtons]) button.disabled = count === 0;
    resetButton.disabled = count === 0 && catalog.every((c) => state.get(c.name).main.id === c.defaultMain.id);

    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const version = renderVersion;
      window.AlternativePackImage.render(previewCanvas, items, { pixelSize: 900 }).then(() => {
        // Prepare the full-size PNG ahead of time, so Share still runs inside the tap.
        if (version === renderVersion && items.length > 0) prepare();
      });
    }, 120);
  }

  function prepare() {
    if (!prepared || prepared.version !== renderVersion) {
      const promise = window.AlternativePackImage.toPngBlob(pickedItems());
      promise.catch(() => {});
      prepared = { version: renderVersion, promise, result: null };
      promise.then((result) => { if (prepared && prepared.promise === promise) prepared.result = result; });
    }
    return prepared;
  }

  function showFeedback(text, isError = false) {
    feedback.textContent = text;
    feedback.classList.toggle("is-error", isError);
  }

  function logoNotice(result) {
    return result.withLogos
      ? ""
      : " Logos were replaced by letters because the page was opened as a local file. Open it from a web server to include them.";
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILENAME;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function setBusy(buttons, busy) {
    for (const button of buttons) {
      button.classList.toggle("is-busy", busy);
      button.setAttribute("aria-busy", String(busy));
    }
  }

  async function handleDownload() {
    if (pickedItems().length === 0) return;
    setBusy(downloadButtons, true);
    try {
      const result = await prepare().promise;
      downloadBlob(result.blob);
      showFeedback(`Saved ${FILENAME}.${logoNotice(result)}`);
    } catch (error) {
      console.error(error);
      showFeedback("Export failed. Please try again.", true);
    } finally {
      setBusy(downloadButtons, false);
    }
  }

  async function handleShare() {
    if (pickedItems().length === 0) return;
    const ready = prepare();
    setBusy(shareButtons, true);
    try {
      // Use the prepared image synchronously when possible: share sheets need the tap's activation.
      const result = ready.result || await ready.promise;
      const file = new File([result.blob], FILENAME, { type: "image/png" });
      const data = { files: [file], title: "My Alternative Pack", text: "My Alternative Pack", url: SHARE_URL };
      let canShare = false;
      try {
        canShare = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      } catch {
        canShare = false;
      }
      if (canShare) {
        try {
          await navigator.share(data);
          showFeedback(logoNotice(result).trim());
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
        }
      }
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": result.blob })]);
          showFeedback(`Image copied to clipboard.${logoNotice(result)}`);
          return;
        } catch {
          // Fall through to download.
        }
      }
      downloadBlob(result.blob);
      showFeedback(`Sharing is unavailable here, so the PNG was downloaded.${logoNotice(result)}`);
    } catch (error) {
      console.error(error);
      showFeedback("Export failed. Please try again.", true);
    } finally {
      setBusy(shareButtons, false);
    }
  }

  shareButtons.forEach((button) => button.addEventListener("click", handleShare));
  downloadButtons.forEach((button) => button.addEventListener("click", handleDownload));

  // ---------- Start ----------

  restore();
  buildCards();
  catalog.forEach(updateCard);
  scheduleRender();
})();
