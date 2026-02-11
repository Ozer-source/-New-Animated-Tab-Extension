const carouselInner = document.querySelector(".carousel-inner");
const carouselRoot = document.querySelector("#bookmarksCarousel");
const prevButton = document.querySelector(".carousel-control-prev");
const nextButton = document.querySelector(".carousel-control-next");
const bgImage = document.querySelector(".bg-image");
const bgVideo = document.querySelector(".bg-video");
const bgManager = document.querySelector(".bg-manager");
const bgList = document.querySelector(".bg-manager-list");
const bgUrlInput = document.querySelector(".bg-url-input");
const bgAddUrlButton = document.querySelector(".bg-add-url");
const bgFileInput = document.querySelector(".bg-file-input");

const flattenBookmarks = (nodes, acc = []) => {
  for (const node of nodes) {
    if (node.url) {
      acc.push({ title: node.title || node.url, url: node.url });
    }
    if (node.children) {
      flattenBookmarks(node.children, acc);
    }
  }
  return acc;
};

const renderBookmarks = (items) => {
  if (!carouselInner) return;
  carouselInner.innerHTML = "";

  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));

  for (let page = 0; page < pages; page += 1) {
    const slide = document.createElement("div");
    slide.className = `carousel-item${page === 0 ? " active" : ""}`;

    const grid = document.createElement("div");
    grid.className = "BookMarks";

    const start = page * pageSize;
    const end = start + pageSize;
    const slice = items.slice(start, end);

    for (const item of slice) {
      const link = document.createElement("a");
      link.href = item.url;
      link.rel = "noreferrer";
      link.title = item.title;

      const icon = document.createElement("img");
      icon.alt = item.title;
      icon.src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
        item.url
      )}`;

      link.appendChild(icon);
      grid.appendChild(link);
    }

    slide.appendChild(grid);
    carouselInner.appendChild(slide);
  }

  initCarouselControls();
};

const setActiveSlide = (index) => {
  if (!carouselInner) return;
  const slides = Array.from(carouselInner.querySelectorAll(".carousel-item"));
  if (!slides.length) return;

  const total = slides.length;
  const normalized = ((index % total) + total) % total;

  slides.forEach((slide, i) => {
    slide.classList.toggle("active", i === normalized);
  });

  if (prevButton) prevButton.disabled = total <= 1;
  if (nextButton) nextButton.disabled = total <= 1;
}

const initCarouselControls = () => {
  if (!carouselRoot || !prevButton || !nextButton || !carouselInner) return;

  const slides = Array.from(carouselInner.querySelectorAll(".carousel-item"));
  if (!slides.length) return;

  const currentIndex = () =>
    Math.max(0, slides.findIndex((slide) => slide.classList.contains("active")));

  prevButton.onclick = (event) => {
    event.preventDefault();
    setActiveSlide(currentIndex() - 1);
  };

  nextButton.onclick = (event) => {
    event.preventDefault();
    setActiveSlide(currentIndex() + 1);
  };

  setActiveSlide(currentIndex());
};

if (chrome?.bookmarks?.getTree) {
  chrome.bookmarks.getTree((tree) => {
    const items = flattenBookmarks(tree);
    renderBookmarks(items);
  });
} else {
  console.warn("Bookmarks API not available.");
}

const BG_SOURCES_KEY = "bgSources";
const BG_ACTIVE_KEY = "bgActiveIndex";
const BG_DEFAULTS_VERSION = "bgDefaultsVersion";
const CURRENT_DEFAULTS_VERSION = "1";
const DEFAULT_BG_SOURCES = [
  { type: "url", value: "video.gif", label: "Default" },
  {
    type: "url",
    value: "https://i.redd.it/ywi6jvge3sra1.gif",
    label: "Surreal Fantasy",
  }
];

const getStoredSources = () => {
  try {
    const raw = localStorage.getItem(BG_SOURCES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const setStoredSources = (sources) => {
  localStorage.setItem(BG_SOURCES_KEY, JSON.stringify(sources));
};

const getActiveIndex = () => {
  const value = Number(localStorage.getItem(BG_ACTIVE_KEY));
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

const setActiveIndex = (index) => {
  localStorage.setItem(BG_ACTIVE_KEY, String(index));
};

const getLabelFromSource = (source) => {
  if (source.label) return source.label;
  if (source.type === "data") return "Uploaded image";
  try {
    const url = new URL(source.value);
    return url.hostname;
  } catch {
    return source.value;
  }
};

const getMediaKind = (value) => {
  const lower = value.toLowerCase();
  if (lower.startsWith("data:video/")) return "video";
  if (lower.startsWith("data:image/")) return "image";
  if (/(\.mp4|\.webm|\.ogg|\.mov)(\?|#|$)/.test(lower)) return "video";
  return "image";
};

const showImageBackground = (src) => {
  if (bgVideo) {
    bgVideo.classList.remove("is-active");
    bgVideo.pause();
    bgVideo.removeAttribute("src");
    bgVideo.load();
  }
  if (bgImage) {
    bgImage.src = src;
    bgImage.classList.add("is-active");
  }
};

const showVideoBackground = (src) => {
  if (bgImage) {
    bgImage.classList.remove("is-active");
  }
  if (bgVideo) {
    bgVideo.src = src;
    bgVideo.classList.add("is-active");
    bgVideo.load();
    bgVideo.play().catch(() => {});
  }
};

const setBackground = (index, sources) => {
  if (!sources.length) return;
  const total = sources.length;
  const normalized = ((index % total) + total) % total;
  const source = sources[normalized];
  const kind = source.mediaType || getMediaKind(source.value);
  if (kind === "video") {
    showVideoBackground(source.value);
  } else {
    showImageBackground(source.value);
  }
  setActiveIndex(normalized);

  if (bgList) {
    const items = Array.from(bgList.querySelectorAll(".bg-item"));
    items.forEach((item, i) => item.classList.toggle("active", i === normalized));
  }
};

const renderBackgroundList = (sources) => {
  if (!bgList) return;
  bgList.innerHTML = "";

  if (!sources.length) {
    if (bgImage) bgImage.src = "";
    return;
  }

  sources.forEach((source, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bg-item";
    button.setAttribute("role", "option");

    const kind = source.mediaType || getMediaKind(source.value);
    let thumb;
    if (kind === "video") {
      thumb = document.createElement("div");
      thumb.className = "bg-thumb bg-thumb-video";
      thumb.textContent = "VIDEO";
    } else {
      thumb = document.createElement("img");
      thumb.className = "bg-thumb";
      thumb.src = source.value;
      thumb.alt = getLabelFromSource(source);
    }

    const label = document.createElement("span");
    label.className = "bg-label";
    label.textContent = getLabelFromSource(source);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "bg-remove";
    removeButton.setAttribute("aria-label", "Remove background");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const updated = getStoredSources().filter((_, i) => i !== index);
      setStoredSources(updated);
      const activeIndex = getActiveIndex();
      const nextIndex = activeIndex > index ? activeIndex - 1 : activeIndex;
      setActiveIndex(Math.max(0, Math.min(nextIndex, updated.length - 1)));
      renderBackgroundList(updated);
    });

    button.appendChild(thumb);
    button.appendChild(label);
    button.appendChild(removeButton);
    button.addEventListener("click", () => setBackground(index, sources));

    bgList.appendChild(button);
  });

  const activeIndex = Math.min(getActiveIndex(), sources.length - 1);
  setBackground(activeIndex, sources);
};

const addSource = (source) => {
  const sources = getStoredSources();
  sources.push(source);
  setStoredSources(sources);
  renderBackgroundList(sources);
  setBackground(sources.length - 1, sources);
};

const ensureDefaultSource = () => {
  const storedSources = getStoredSources();
  const storedVersion = localStorage.getItem(BG_DEFAULTS_VERSION);

  if (!storedSources.length) {
    setStoredSources(DEFAULT_BG_SOURCES);
    localStorage.setItem(BG_DEFAULTS_VERSION, CURRENT_DEFAULTS_VERSION);
    renderBackgroundList(DEFAULT_BG_SOURCES);
    return;
  }

  if (storedVersion !== CURRENT_DEFAULTS_VERSION) {
    const existing = new Set(storedSources.map((source) => source.value));
    const merged = [...storedSources];
    DEFAULT_BG_SOURCES.forEach((source) => {
      if (!existing.has(source.value)) {
        merged.push(source);
      }
    });
    setStoredSources(merged);
    localStorage.setItem(BG_DEFAULTS_VERSION, CURRENT_DEFAULTS_VERSION);
    renderBackgroundList(merged);
    return;
  }

  renderBackgroundList(storedSources);
};

if (bgAddUrlButton && bgUrlInput) {
  bgAddUrlButton.addEventListener("click", () => {
    const value = bgUrlInput.value.trim();
    if (!value) return;

    if (/^data:|^https?:/i.test(value)) {
      addSource({ type: "url", value, label: value, mediaType: getMediaKind(value) });
      bgUrlInput.value = "";
    }
  });
}

if (bgFileInput) {
  bgFileInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const mediaType = file.type.startsWith("video/") ? "video" : "image";
        addSource({ type: "data", value: reader.result, label: file.name, mediaType });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });
}

const handlePaste = async (event) => {
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    return;
  }

  const items = event.clipboardData?.items;
  if (!items || !items.length) return;

  for (const item of items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const mediaType = file.type.startsWith("video/") ? "video" : "image";
          addSource({ type: "data", value: reader.result, label: file.name, mediaType });
        }
      };
      reader.readAsDataURL(file);
      event.preventDefault();
      return;
    }
  }

  for (const item of items) {
    if (item.kind === "string") {
      item.getAsString((text) => {
        const value = text.trim();
        if (/^https?:\/\//i.test(value)) {
          addSource({ type: "url", value, label: value, mediaType: getMediaKind(value) });
        }
      });
      event.preventDefault();
      return;
    }
  }
};

if (bgManager) {
  bgManager.addEventListener("paste", handlePaste);
}

window.addEventListener("paste", handlePaste);

ensureDefaultSource();
