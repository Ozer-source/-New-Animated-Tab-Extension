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
const bgFilterButton = document.querySelector(".bg-filter-button");
const bgPreloadButton = document.querySelector(".bg-preload-button");

let showOnlyFavorites = false;
let sourcesCache = null;
let cleanupTimeout = null;
let isPreloading = false;
let isSwitching = false;
let carouselSlides = [];
const MAX_FAVORITE_PRELOADS = 5;

// Safe idle callback fallback
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));

// Helper: wrap index for circular arrays
const wrapIndex = (i, total) => (i % total + total) % total;

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

const createBookmarkLink = (item) => {
  const link = document.createElement("a");
  link.href = item.url;
  link.rel = "noreferrer";
  link.title = item.title;

  const icon = document.createElement("img");
  icon.alt = item.title;
  icon.loading = "lazy";
  icon.src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
    item.url
  )}`;

  link.appendChild(icon);
  return link;
};

const renderBookmarks = (items) => {
  if (!carouselInner) return;
  carouselInner.innerHTML = "";

  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const fragment = document.createDocumentFragment();

  for (let page = 0; page < pages; page += 1) {
    const slide = document.createElement("div");
    slide.className = `carousel-item${page === 0 ? " active" : ""}`;

    const grid = document.createElement("div");
    grid.className = "BookMarks";

    const start = page * pageSize;
    const end = start + pageSize;
    const slice = items.slice(start, end);

    const gridFragment = document.createDocumentFragment();
    for (const item of slice) {
      gridFragment.appendChild(createBookmarkLink(item));
    }
    grid.appendChild(gridFragment);
    slide.appendChild(grid);
    fragment.appendChild(slide);
  }

  carouselInner.appendChild(fragment);
  carouselSlides = Array.from(carouselInner.children);
  initCarouselControls();
};

const setActiveSlide = (index) => {
  if (!carouselInner) return;
  const slides = carouselSlides.length ? carouselSlides : Array.from(carouselInner.querySelectorAll(".carousel-item"));
  if (!slides.length) return;

  const total = slides.length;
  const normalized = wrapIndex(index, total);

  slides.forEach((slide, i) => {
    slide.classList.toggle("active", i === normalized);
  });

  if (prevButton) prevButton.disabled = total <= 1;
  if (nextButton) nextButton.disabled = total <= 1;
}

const initCarouselControls = () => {
  if (!carouselRoot || !prevButton || !nextButton || !carouselInner) return;

  const slides = carouselSlides.length ? carouselSlides : Array.from(carouselInner.querySelectorAll(".carousel-item"));
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

const loadBookmarks = () => {
  if (chrome?.bookmarks?.getTree) {
    chrome.bookmarks.getTree((tree) => {
      const items = flattenBookmarks(tree);
      renderBookmarks(items);
    });
  } else {
    console.warn("Bookmarks API not available.");
  }
};

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

const loadSources = () => {
  if (sourcesCache !== null) return sourcesCache;
  try {
    const raw = localStorage.getItem(BG_SOURCES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    sourcesCache = Array.isArray(parsed) ? parsed : [];
    return sourcesCache;
  } catch {
    sourcesCache = [];
    return sourcesCache;
  }
};

const saveSources = () => {
  if (sourcesCache === null) return;
  localStorage.setItem(BG_SOURCES_KEY, JSON.stringify(sourcesCache));
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
  const favoriteSources = sourcesCache?.filter(s => s.favorite).map(s => s.value) || [];
  const toKeep = new Set([...recentlyUsed, ...favoriteSources]);
  
  if (preloadCache.size <= MAX_CACHE_SIZE + toKeep.size) return;
  
  const toDelete = [];
  
  for (const [src] of preloadCache) {
    if (!toKeep.has(src)) {
      toDelete.push(src);
    }
  }
  
  toDelete.forEach(src => {
    const cached = preloadCache.get(src);
    if (cached?.tagName === "VIDEO") {
      cached.pause();
      cached.removeAttribute("src");
      cached.load();
    }
    preloadCache.delete(src);
  });
};

const scheduleCleanup = () => {
  clearTimeout(cleanupTimeout);
  cleanupTimeout = setTimeout(cleanupOldCache, 5000);
};

const toggleFavorite = (index) => {
  if (sourcesCache && sourcesCache[index]) {
    sourcesCache[index].favorite = !sourcesCache[index].favorite;
    saveSources();
    renderBackgroundList(false);
    preloadFavorites();
  }
};

const preloadFavorites = () => {
  if (!sourcesCache) return;
  const favorites = sourcesCache.filter(s => s.favorite).slice(0, MAX_FAVORITE_PRELOADS);
  favorites.forEach(source => {
    const kind = source.mediaType;
    preloadBackground(source.value, kind);
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

const setBackground = (index) => {
  if (isSwitching) return;
  isSwitching = true;
  setTimeout(() => {
    isSwitching = false;
  }, 250);
  if (!sourcesCache || !sourcesCache.length) return;
  const total = sourcesCache.length;
  const normalized = wrapIndex(index, total);
  const source = sourcesCache[normalized];
  const kind = source.mediaType;
  
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

  updateActiveItems();
  
  // Preload next background
  const nextIndex = wrapIndex(normalized + 1, total);
  const nextSource = sourcesCache[nextIndex];
  if (nextSource) {
    preloadBackground(nextSource.value, nextSource.mediaType);
  }
  
  // Preload previous background
  const prevIndex = wrapIndex(normalized - 1, total);
  const prevSource = sourcesCache[prevIndex];
  if (prevSource && prevSource !== nextSource) {
    preloadBackground(prevSource.value, prevSource.mediaType);
  }
  
  // Preload favorites
  preloadFavorites();
  
  // Cleanup old cache
  scheduleCleanup();
};

const updateActiveItems = () => {
  const activeIndex = getActiveIndex();
  const items = bgList?.querySelectorAll(".bg-item");
  items?.forEach((item, i) => {
    const index = Number(item.dataset.index);
    item.classList.toggle("active", index === activeIndex);
  });
};

const createBgItem = (source, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bg-item";
  button.setAttribute("role", "option");
  button.dataset.index = index;

  const kind = source.mediaType;
  let thumb;
  if (kind === "video") {
    thumb = document.createElement("div");
    thumb.className = "bg-thumb bg-thumb-video";
    thumb.textContent = "VIDEO";
  } else {
    thumb = document.createElement("img");
    thumb.className = "bg-thumb";
    thumb.loading = "lazy";
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

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "bg-remove";
  removeButton.setAttribute("aria-label", "Remove background");
  removeButton.textContent = "×";

  button.appendChild(thumb);
  button.appendChild(label);
  button.appendChild(favoriteButton);
  button.appendChild(removeButton);

  return button;
};

const renderBackgroundList = (shouldSetBackground = true) => {
  if (!bgList) return;

  if (!sourcesCache || !sourcesCache.length) {
    bgList.innerHTML = "";
    return;
  }

  const displaySources = showOnlyFavorites
    ? sourcesCache.map((s, i) => ({ s, i })).filter((x) => x.s.favorite)
    : sourcesCache.map((s, i) => ({ s, i }));

  if (displaySources.length === 0 && showOnlyFavorites) {
    const message = document.createElement("div");
    message.className = "bg-empty-message";
    message.textContent = "No favorites yet";
    bgList.replaceChildren(message);
    return;
  }

  const fragment = document.createDocumentFragment();
  displaySources.forEach(({ s, i }) => {
    fragment.appendChild(createBgItem(s, i));
  });
  
  bgList.replaceChildren(fragment);

  if (shouldSetBackground) {
    const activeIndex = Math.min(getActiveIndex(), sourcesCache.length - 1);
    // Just set the background, defer preloading
    const source = sourcesCache[activeIndex];
    const kind = source.mediaType;
    
    recentlyUsed.unshift(source.value);
    if (recentlyUsed.length > MAX_CACHE_SIZE) {
      recentlyUsed.pop();
    }
    
    if (kind === "video") {
      showVideoBackground(source.value);
    } else {
      showImageBackground(source.value);
    }
    setActiveIndex(activeIndex);
    updateActiveItems();
    
    // Defer preloading until page is loaded
    idle(() => {
      const total = sourcesCache.length;
      const nextIndex = wrapIndex(activeIndex + 1, total);
      const nextSource = sourcesCache[nextIndex];
      if (nextSource) {
        preloadBackground(nextSource.value, nextSource.mediaType);
      }
      
      const prevIndex = wrapIndex(activeIndex - 1, total);
      const prevSource = sourcesCache[prevIndex];
      if (prevSource && prevSource !== nextSource) {
        preloadBackground(prevSource.value, prevSource.mediaType);
      }
      
      preloadFavorites();
    });
  } else {
    updateActiveItems();
  }
};

const removeSource = (index) => {
  if (!sourcesCache) return;
  
  sourcesCache.splice(index, 1);
  
  if (sourcesCache.length === 0) {
    sourcesCache = [...DEFAULT_BG_SOURCES];
    setActiveIndex(0);
  } else {
    const activeIndex = getActiveIndex();
    const nextIndex = activeIndex > index ? activeIndex - 1 : activeIndex;
    setActiveIndex(Math.max(0, Math.min(nextIndex, sourcesCache.length - 1)));
  }
  
  saveSources();
  renderBackgroundList();
};

if (bgList) {
  bgList.addEventListener("click", (e) => {
    const item = e.target.closest(".bg-item");
    if (!item) return;

    const index = Number(item.dataset.index);

    if (e.target.closest(".bg-remove")) {
      e.stopPropagation();
      removeSource(index);
    } else if (e.target.closest(".bg-favorite")) {
      e.stopPropagation();
      toggleFavorite(index);
    } else {
      setBackground(index);
    }
  });
}

const addSource = (source) => {
  if (!sourcesCache) sourcesCache = [];
  if (sourcesCache.some((s) => s.value === source.value)) return;
  source.mediaType ??= getMediaKind(source.value);
  sourcesCache.push(source);
  saveSources();
  renderBackgroundList();
  setBackground(sourcesCache.length - 1);
};

const ensureDefaultSource = () => {
  loadSources();
  const storedVersion = localStorage.getItem(BG_DEFAULTS_VERSION);

  if (!sourcesCache.length) {
    sourcesCache = DEFAULT_BG_SOURCES.map(s => ({
      ...s,
      mediaType: s.mediaType ?? getMediaKind(s.value)
    }));
    saveSources();
    localStorage.setItem(BG_DEFAULTS_VERSION, CURRENT_DEFAULTS_VERSION);
    renderBackgroundList();
    return;
  }

  if (storedVersion !== CURRENT_DEFAULTS_VERSION) {
    const existing = new Set(sourcesCache.map((source) => source.value));
    DEFAULT_BG_SOURCES.forEach((source) => {
      if (!existing.has(source.value)) {
        sourcesCache.push({
          ...source,
          mediaType: source.mediaType ?? getMediaKind(source.value)
        });
      }
    });
    saveSources();
    localStorage.setItem(BG_DEFAULTS_VERSION, CURRENT_DEFAULTS_VERSION);
  }

  // Ensure all sources have mediaType computed
  sourcesCache.forEach(s => {
    s.mediaType ??= getMediaKind(s.value);
  });
  saveSources();
  
  renderBackgroundList();
};

if (bgFilterButton) {
  bgFilterButton.addEventListener("click", () => {
    showOnlyFavorites = !showOnlyFavorites;
    const icon = bgFilterButton.querySelector(".filter-icon");
    const text = bgFilterButton.querySelector(".filter-text");
    
    if (showOnlyFavorites) {
      icon.textContent = "★";
      text.textContent = "Favorites";
      bgFilterButton.classList.add("active");
    } else {
      icon.textContent = "☆";
      text.textContent = "All";
      bgFilterButton.classList.remove("active");
    }
    
    renderBackgroundList(false);
  });
}

if (bgPreloadButton) {
  bgPreloadButton.addEventListener("click", async () => {
    if (isPreloading || !sourcesCache) return;
    
    isPreloading = true;
    bgPreloadButton.classList.add("loading");
    const text = bgPreloadButton.querySelector(".preload-text");
    const originalText = text.textContent;
    
    let loaded = 0;
    const total = sourcesCache.length;
    
    text.textContent = `Loading ${loaded}/${total}`;
    
    for (const source of sourcesCache) {
      if (preloadCache.has(source.value)) {
        loaded++;
        text.textContent = `Loading ${loaded}/${total}`;
        continue;
      }
      
      const kind = source.mediaType;
      preloadBackground(source.value, kind);
      
      // Small delay to prevent blocking UI
      await new Promise(resolve => setTimeout(resolve, 50));
      
      loaded++;
      text.textContent = `Loading ${loaded}/${total}`;
    }
    
    bgPreloadButton.classList.remove("loading");
    bgPreloadButton.classList.add("loaded");
    text.textContent = "✓ All Loaded";
    
    setTimeout(() => {
      bgPreloadButton.classList.remove("loaded");
      text.textContent = originalText;
      isPreloading = false;
    }, 2000);
  });
}

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
    if (sourcesCache && sourcesCache.length > 1) {
      const currentIndex = getActiveIndex();
      const nextIndex = wrapIndex(currentIndex + 1, sourcesCache.length);
      setBackground(nextIndex);
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

window.addEventListener("paste", handlePaste);

// Load background first (critical)
ensureDefaultSource();

// Defer non-critical operations
if (document.readyState === "complete") {
  idle(loadBookmarks);
} else {
  window.addEventListener("load", () => {
    idle(loadBookmarks);
  });
}
