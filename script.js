const carouselInner = document.querySelector(".carousel-inner");
const carouselRoot = document.querySelector("#bookmarksCarousel");
const prevButton = document.querySelector(".carousel-control-prev");
const nextButton = document.querySelector(".carousel-control-next");
const bgImage = document.querySelector(".bg-image");
const bgVideo = document.querySelector(".bg-video");
const bgManager = document.querySelector(".bg-manager");
const bgList = document.querySelector(".bg-manager-list");
const bgNameInput = document.querySelector(".bg-name-input");
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

const preloadCache = new Map();
const recentlyUsed = [];
const MAX_CACHE_SIZE = 3;

const getMediaKind = (value) => {
  const lower = value.toLowerCase();
  if (lower.startsWith("data:video/")) return "video";
  if (lower.startsWith("data:image/")) return "image";
  if (/(\.mp4|\.webm|\.ogg|\.mov)(\?|#|$)/.test(lower)) return "video";
  return "image";
};

const preloadBackground = (src, kind) => {
  if (preloadCache.has(src)) return;
  
  if (kind === "video") {
    const video = document.createElement("video");
    video.src = src;
    video.preload = "auto";
    video.muted = true;
    video.load();
    preloadCache.set(src, video);
  } else {
    const img = new Image();
    img.src = src;
    preloadCache.set(src, img);
  }
};

const cleanupOldCache = () => {
  if (preloadCache.size <= MAX_CACHE_SIZE) return;
  
  const toKeep = new Set(recentlyUsed);
  const toDelete = [];
  
  for (const [src] of preloadCache) {
    if (!toKeep.has(src)) {
      toDelete.push(src);
    }
  }
  
  toDelete.forEach(src => {
    const cached = preloadCache.get(src);
    if (cached && cached.tagName === "VIDEO") {
      cached.pause();
      cached.removeAttribute("src");
      cached.load();
    }
    preloadCache.delete(src);
  });
};

const toggleFavorite = (index) => {
  const sources = getStoredSources();
  if (sources[index]) {
    sources[index].favorite = !sources[index].favorite;
    setStoredSources(sources);
    renderBackgroundList(sources);
    preloadFavorites(sources);
  }
};

const preloadFavorites = (sources) => {
  sources.forEach(source => {
    if (source.favorite) {
      const kind = source.mediaType || getMediaKind(source.value);
      preloadBackground(source.value, kind);
    }
  });
};

const showImageBackground = (src) => {
  if (bgVideo && bgVideo.classList.contains("is-active")) {
    bgVideo.classList.remove("is-active");
    if (!bgVideo.paused) bgVideo.pause();
    setTimeout(() => {
      if (bgVideo.src) {
        bgVideo.removeAttribute("src");
        bgVideo.load();
      }
    }, 300);
  }
  if (bgImage) {
    bgImage.decoding = "async";
    bgImage.classList.add("is-active");
    bgImage.src = src;
  }
};

const showVideoBackground = (src) => {
  if (bgImage && bgImage.classList.contains("is-active")) {
    bgImage.classList.remove("is-active");
  }
  if (bgVideo) {
    bgVideo.src = src;
    bgVideo.preload = "auto";
    bgVideo.load();
    bgVideo.classList.add("is-active");
    if (document.visibilityState === "visible") {
      const playPromise = bgVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }
  }
};

const setBackground = (index, sources) => {
  if (!sources.length) return;
  const total = sources.length;
  const normalized = ((index % total) + total) % total;
  const source = sources[normalized];
  const kind = source.mediaType || getMediaKind(source.value);
  
  // Update recently used list
  recentlyUsed.unshift(source.value);
  if (recentlyUsed.length > MAX_CACHE_SIZE) {
    recentlyUsed.pop();
  }
  
  // Show the background
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
  
  // Preload next background
  const nextIndex = (normalized + 1) % total;
  if (sources[nextIndex]) {
    const nextSource = sources[nextIndex];
    const nextKind = nextSource.mediaType || getMediaKind(nextSource.value);
    preloadBackground(nextSource.value, nextKind);
  }
  
  // Preload previous background
  const prevIndex = (normalized - 1 + total) % total;
  if (sources[prevIndex] && sources[prevIndex] !== sources[nextIndex]) {
    const prevSource = sources[prevIndex];
    const prevKind = prevSource.mediaType || getMediaKind(prevSource.value);
    preloadBackground(prevSource.value, prevKind);
  }
  
  // Preload all favorites
  preloadFavorites(sources);
  
  // Cleanup old cache after a delay
  setTimeout(cleanupOldCache, 5000);
};

const renderBackgroundList = (sources) => {
  if (!bgList) return;
  bgList.innerHTML = "";

  if (!sources.length) {
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

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "bg-favorite" + (source.favorite ? " is-favorite" : "");
    favoriteButton.setAttribute("aria-label", source.favorite ? "Unfavorite" : "Favorite");
    favoriteButton.textContent = "★";
    favoriteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(index);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "bg-remove";
    removeButton.setAttribute("aria-label", "Remove background");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const updated = getStoredSources().filter((_, i) => i !== index);
      if (updated.length === 0) {
        setStoredSources(DEFAULT_BG_SOURCES);
        setActiveIndex(0);
        renderBackgroundList(DEFAULT_BG_SOURCES);
        return;
      }
      setStoredSources(updated);
      const activeIndex = getActiveIndex();
      const nextIndex = activeIndex > index ? activeIndex - 1 : activeIndex;
      setActiveIndex(Math.max(0, Math.min(nextIndex, updated.length - 1)));
      renderBackgroundList(updated);
    });

    button.appendChild(thumb);
    button.appendChild(label);
    button.appendChild(favoriteButton);
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

    const name = bgNameInput?.value.trim();

    if (/^data:|^https?:/i.test(value)) {
      addSource({
        type: "url",
        value,
        label: name || value,
        mediaType: getMediaKind(value),
      });
      bgUrlInput.value = "";
      if (bgNameInput) bgNameInput.value = "";
    }
  });
}

if (bgFileInput) {
  bgFileInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const name = bgNameInput?.value.trim();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const mediaType = file.type.startsWith("video/") ? "video" : "image";
        addSource({
          type: "data",
          value: reader.result,
          label: name || file.name,
          mediaType,
        });
        if (bgNameInput) bgNameInput.value = "";
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });
}

document.addEventListener("visibilitychange", () => {
  if (!bgVideo) return;
  if (document.visibilityState === "hidden") {
    if (!bgVideo.paused) bgVideo.pause();
  } else if (bgVideo.classList.contains("is-active")) {
    const playPromise = bgVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  }
});

if (bgVideo) {
  bgVideo.addEventListener("error", () => {
    console.error("Video failed to load:", bgVideo.src);
    const sources = getStoredSources();
    if (sources.length > 1) {
      const currentIndex = getActiveIndex();
      const nextIndex = (currentIndex + 1) % sources.length;
      setBackground(nextIndex, sources);
    }
  });

  bgVideo.addEventListener("loadstart", () => {
    bgVideo.classList.add("loading");
  });

  bgVideo.addEventListener("canplay", () => {
    bgVideo.classList.remove("loading");
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
      const name = bgNameInput?.value.trim();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const mediaType = file.type.startsWith("video/") ? "video" : "image";
          addSource({
            type: "data",
            value: reader.result,
            label: name || file.name,
            mediaType,
          });
          if (bgNameInput) bgNameInput.value = "";
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
          const name = bgNameInput?.value.trim();
          addSource({
            type: "url",
            value,
            label: name || value,
            mediaType: getMediaKind(value),
          });
          if (bgNameInput) bgNameInput.value = "";
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
