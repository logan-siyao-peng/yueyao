const strip = document.querySelector(".photo-strip");
const slides = Array.from(strip.children);
const timeline = document.querySelector(".gallery-timeline");
const datePicker = document.querySelector("#gallery-date-picker");
const galleryMonth = document.querySelector("#gallery-month");
const years = document.querySelector(".gallery-years");
const slideDates = slides.map(slide => slide.querySelector("time"));
const firstYear = Number(slideDates[0].dateTime.slice(0, 4));
const slideMonths = slideDates.map(date => {
  const [year, month] = date.dateTime.split("-").map(Number);
  return (year - firstYear) * 12 + month - 1;
});
const lastMonth = slideMonths.at(-1);
const playback = document.querySelector("#gallery-playback");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const galleryCount = document.querySelector(".gallery-count");
let playing = false;
let galleryVisible = false;

function updatePlaybackLabel() {
  const english = document.documentElement.lang === "en";
  if (playing) {
    playback.textContent = english ? playback.dataset.pauseEn : playback.dataset.pauseZh;
  } else {
    playback.textContent = english ? playback.dataset.playEn : playback.dataset.playZh;
  }
}

function setPlayback(enabled) {
  playing = enabled;
  updatePlaybackLabel();
}

function currentSlide() {
  return Math.min(slides.length - 1, Math.max(0, Math.round(strip.scrollLeft / (strip.clientWidth || 1))));
}

let animatedSlide = null;

function animateStory(slide) {
  if (!galleryVisible || animatedSlide === slide) return;
  animatedSlide?.classList.remove("story-active");
  animatedSlide = slide;
  slide.classList.add("story-active");
}

function prepareStoryLines() {
  for (const slide of slides) {
    const caption = slide.querySelector("figcaption");
    const story = caption.querySelector(".story-copy");
    let delay = 0;
    if (!caption.classList.contains("story-has-context")) {
      for (const item of caption.querySelectorAll("time, h3")) {
        item.classList.add("story-line");
        item.style.setProperty("--story-delay", `${delay}s`);
        delay += 0.5;
      }
    }
    if (!story) continue;
    const bySentence = strip.dataset.storyEffect === "sentence";
    const lines = story.textContent.trim().split("\n").map((line, index) => {
      const span = document.createElement("span");
      span.className = "story-line";
      span.textContent = line;
      span.style.setProperty("--story-delay", `${delay}s`);
      if (!bySentence || index === 0 || /[。！？.!?]$/.test(line.trim())) delay += 0.5;
      return span;
    });
    story.replaceChildren(...lines.flatMap((line, index) =>
      index ? [document.createTextNode("\n"), line] : [line]
    ));
  }
}

if (new URLSearchParams(location.search).get("preview") === "story-effects") {
  const preview = document.querySelector("#story-effect-preview");
  const effect = document.querySelector("#story-effect");
  function replayEffect() {
    setPlayback(false);
    animatedSlide?.classList.remove("story-active");
    animatedSlide = null;
    // Commit the class removal so replaying the same effect restarts it.
    void strip.offsetWidth;
    animateStory(slides[currentSlide()]);
  }

  preview.hidden = false;
  effect.addEventListener("change", () => {
    strip.dataset.storyEffect = effect.value;
    prepareStoryLines();
    replayEffect();
  });
  document.querySelector("#story-effect-replay").addEventListener("click", replayEffect);
}

function updateTimeline() {
  const index = currentSlide();
  animateStory(slides[index]);
  galleryCount.textContent = `${index + 1} / ${slides.length}`;
  const month = slideDates[index].textContent;
  datePicker.value = slideMonths[index];
  if (galleryMonth.textContent !== month) {
    galleryMonth.textContent = month;
    datePicker.setAttribute("aria-valuetext", month);
  }
}

datePicker.max = lastMonth;
for (let month = 0; month <= lastMonth; month += 12) {
  const tick = document.createElement("span");
  tick.textContent = firstYear + month / 12;
  tick.style.left = `${lastMonth ? 100 * month / lastMonth : 0}%`;
  years.append(tick);
}
strip.classList.add("has-timeline");
timeline.hidden = false;
const storySection = strip.closest(".gallery");
const storyFrame = strip.querySelector(".story-image");
let storyFitFrame = 0;

function scheduleStoryFit() {
  if (storyFitFrame) return;
  storyFitFrame = requestAnimationFrame(() => {
    storyFitFrame = 0;
    if (!storySection.getClientRects().length) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const fixedHeight = timeline.getBoundingClientRect().bottom + window.scrollY
      - storyFrame.getBoundingClientRect().height;
    const available = `${Math.max(72, Math.floor(viewportHeight - fixedHeight - 8))}px`;
    if (storySection.style.getPropertyValue("--story-available-height") !== available) {
      storySection.style.setProperty("--story-available-height", available);
    }
  });
}

const storyFitObserver = new ResizeObserver(scheduleStoryFit);
storyFitObserver.observe(storySection);
storyFitObserver.observe(document.querySelector(".top"));
window.addEventListener("resize", scheduleStoryFit);
window.visualViewport?.addEventListener("resize", scheduleStoryFit);
scheduleStoryFit();
strip.addEventListener("scroll", updateTimeline, {passive: true});
datePicker.addEventListener("focus", () => setPlayback(false));
datePicker.addEventListener("input", () => {
  setPlayback(false);
  const month = Number(datePicker.value);
  let nearest = currentSlide();
  for (const [index, photoMonth] of slideMonths.entries()) {
    if (Math.abs(photoMonth - month) < Math.abs(slideMonths[nearest] - month)) {
      nearest = index;
    }
  }
  strip.scrollTo({left: nearest * strip.clientWidth, behavior: "instant"});
  updateTimeline();
});
datePicker.addEventListener("keydown", event => {
  const direction = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[event.key];
  if (!direction) return;
  event.preventDefault();
  const next = Math.min(slides.length - 1, Math.max(0, currentSlide() + direction));
  strip.scrollTo({left: next * strip.clientWidth, behavior: "instant"});
  updateTimeline();
});

function scrollPhoto(direction) {
  const width = strip.clientWidth;
  if (!width) return;
  const current = currentSlide();
  const next = (current + direction + slides.length) % slides.length;
  const wraps = Math.abs(next - current) > 1;
  if (playing) {
    slides[(next + 1) % slides.length].querySelector("img").loading = "eager";
  }
  strip.scrollTo({
    left: next * width,
    behavior: wraps || motionPreference.matches ? "instant" : "smooth"
  });
}

function navigateGallery(direction) {
  setPlayback(false);
  scrollPhoto(direction);
}

document.querySelector("#previous").addEventListener("click", () => navigateGallery(-1));
document.querySelector("#next").addEventListener("click", () => navigateGallery(1));
playback.addEventListener("click", () => setPlayback(!playing));
strip.addEventListener("pointerdown", () => setPlayback(false));
strip.addEventListener("wheel", event => {
  if (event.deltaX || event.shiftKey) setPlayback(false);
}, {passive: true});
strip.addEventListener("focus", () => setPlayback(false));
strip.addEventListener("keydown", event => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  navigateGallery(event.key === "ArrowLeft" ? -1 : 1);
});
motionPreference.addEventListener("change", event => {
  if (event.matches) setPlayback(false);
});
const galleryObserver = new IntersectionObserver(([entry]) => {
  galleryVisible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
  if (galleryVisible) animateStory(slides[currentSlide()]);
  else {
    animatedSlide?.classList.remove("story-active");
    animatedSlide = null;
  }
}, {threshold: 0.2});
galleryObserver.observe(strip);
setInterval(() => {
  if (playing && galleryVisible && !document.hidden) scrollPhoto(1);
}, 7000);

const form = document.querySelector("#reply");
const publicSites = new Set(["https://yueyao.de", "https://www.yueyao.de"]);
const rsvpEndpoint = publicSites.has(location.origin)
  ? "https://yueyao-rsvp.loganpeng1992.workers.dev/api/rsvp"
  : form.action;
const rsvpUnavailable = document.querySelector("#rsvp-unavailable");
const submit = form.querySelector("button[type=submit]");
let canSubmit = false;
fetch(rsvpEndpoint, {method: "HEAD", cache: "no-store"})
  .then(response => {
    if (response.status !== 204) return;
    rsvpUnavailable.hidden = true;
    canSubmit = true;
    submit.disabled = false;
  })
  .catch(() => { /* The form remains available as a preview. */ });
const partyField = document.querySelector("#party-field");
const stayField = document.querySelector("#stay-field");
const slider = document.querySelector("#attendance-slider");
const sliderPercent = document.querySelector("#attendance-percent");
const sliderDescription = document.querySelector("#attendance-description");
const attendanceOptions = [
  [0, "肯定不出席", "Definitely not attending"],
  [20, "大概不出席", "Unlikely to attend"],
  [40, "可能不出席", "Might not attend"],
  [50, "不确定", "Unsure"],
  [60, "可能会出席", "Might attend"],
  [80, "大概会出席", "Likely to attend"],
  [100, "肯定会出席", "Definitely attending"],
];
const adultNames = document.querySelector("#adult-names");
const adultGuests = [...adultNames.querySelectorAll(".adult-guest")];
const lodging = document.querySelector("#lodging-preference");
const stay = form.elements.stay_nights;
const probabilitySliders = [slider, ...adultNames.querySelectorAll("input[type=range]")];

function updateProbability(control, value) {
  const [percent, chinese, english] = attendanceOptions.reduce((nearest, option) =>
    Math.abs(option[0] - value) < Math.abs(nearest[0] - value) ? option : nearest
  );
  const description = document.documentElement.lang === "en" ? english : chinese;
  control.value = percent;
  control.setAttribute("aria-valuetext", `${percent}% · ${description}`);
  if (control === slider) {
    sliderPercent.textContent = `${percent}%`;
    sliderDescription.textContent = description;
    form.elements.attendance_probability.value = percent;
  } else {
    const guest = control.closest(".adult-guest");
    guest.querySelector("output").textContent = `${percent}% · ${description}`;
    guest.querySelector("input[type=hidden]").value = percent;
  }
}
const email = form.elements.email;
const emailError = document.querySelector("#rsvp-email-error");
const feedback = document.querySelector("#feedback");

function showEmailError(show) {
  emailError.hidden = !show;
  if (show) email.setAttribute("aria-invalid", "true");
  else email.removeAttribute("aria-invalid");
}
email.addEventListener("blur", () => showEmailError(email.value !== "" && !email.validity.valid));
email.addEventListener("input", () => {
  if (!emailError.hidden) showEmailError(!email.validity.valid);
});

function updatePartyField() {
  probabilitySliders.forEach(control => updateProbability(control, Number(control.value)));
  const planning = Number(slider.value) > 0;
  partyField.hidden = !planning;
  partyField.disabled = !planning;
  stayField.hidden = !planning;
  form.elements.stay_nights.disabled = !planning;
  const count = Number(form.elements.additional_adults.value);
  adultNames.hidden = !planning || count === 0;
  adultGuests.forEach((guest, index) => {
    const active = planning && index < count;
    guest.hidden = !active;
    guest.querySelectorAll("input").forEach(input => { input.disabled = !active; });
  });
  lodging.hidden = !planning || stay.value === "0";
  form.elements.lodging_preference.disabled = lodging.hidden;
}
for (const control of probabilitySliders) {
  control.addEventListener("input", updatePartyField);
  control.addEventListener("keydown", event => {
    const direction = {ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1}[event.key];
    if (!direction) return;
    event.preventDefault();
    const index = attendanceOptions.findIndex(([percent]) => percent === Number(control.value));
    control.value = attendanceOptions[Math.max(0, Math.min(attendanceOptions.length - 1, index + direction))][0];
    updatePartyField();
  });
}
stay.addEventListener("change", updatePartyField);
form.elements.additional_adults.addEventListener("change", updatePartyField);
updatePartyField();
const languageButtons = document.querySelectorAll(".languages button");
const translations = Array.from(document.querySelectorAll("[data-en]"), element => ({
  element, chinese: element.textContent, english: element.dataset.en
}));
const attributeTranslations = ["content", "aria-label", "alt"].flatMap(attribute =>
  Array.from(document.querySelectorAll(`[data-en-${attribute}]`), element => ({
    element, attribute, chinese: element.getAttribute(attribute),
    english: element.getAttribute(`data-en-${attribute}`)
  }))
);
const messages = new Map([
  ["正在寄出…", "Sending your note…"],
  ["收到你的信啦，谢谢你！", "We got your note. Thank you!"],
  ["暂时无法提交。请保留已填写的内容，稍后再试。", "We couldn’t send your RSVP. Your entries are still here. Please try again shortly."],
  ["请检查回执格式。", "Please check the information you entered."],
  ["请输入有效的姓名。", "Please enter your name."],
  ["请输入有效的电子邮箱。", "Please enter a valid email address."],
  ["请填写有效的同行人数。", "Enter valid guest counts."],
  ["请填写每位同行成人的法定姓名。", "Enter the legal name of each accompanying adult."],
  ["请选择出席意向。", "Please select whether you expect to attend."],
  ["请填写有效的同行人数及儿童年龄。", "Please enter valid guest counts and each child’s age."],
  ["请检查联系方式、同行姓名和住宿选项。", "Please check the contact, companion names and overnight stay option."],
  ["请输入 1 至 12 人。", "Please enter a whole number from 1 to 12."],
  ["请选择有效的住宿选项。", "Choose a valid lodging option."],
  ["请选择有效的饮食选项。", "Please select a valid dietary option."],
  ["留言最多 1000 个字符。", "Please keep your message to 1,000 characters or fewer."],
  ["页面不存在。", "This page could not be found."],
  ["请通过网页提交回执。", "Please use the RSVP form to reply."],
  ["无法读取回执，请检查后重试。", "We couldn’t read your RSVP. Please check your entries and try again."],
  ["暂时无法保存，请稍后重试。", "We couldn’t save your RSVP. Please try again shortly."]
]);
const failed = "暂时无法提交。请保留已填写的内容，稍后再试。";
let currentMessage = "";
function showFeedback(message) {
  currentMessage = message;
  feedback.textContent = document.documentElement.lang === "en"
    ? message && (messages.get(message) || messages.get(failed))
    : message;
}

function applyLanguage(language) {
  document.documentElement.lang = language;
  const variant = language === "en" ? "english" : "chinese";
  for (const entry of translations) entry.element.textContent = entry[variant];
  prepareStoryLines();
  for (const entry of attributeTranslations) entry.element.setAttribute(entry.attribute, entry[variant]);
  for (const button of languageButtons) button.setAttribute("aria-pressed", String(button.lang === language));
  showFeedback(currentMessage);
  updatePartyField();
  updatePlaybackLabel();
  updateTimeline();
  document.dispatchEvent(new Event("wedding-language-change"));
}

let initialLanguage = "zh-Hans";
try {
  if (localStorage.getItem("wedding-language") === "en") initialLanguage = "en";
} catch {
  // Language switching also works if browser storage is unavailable.
}
applyLanguage(initialLanguage);
for (const button of languageButtons) {
  button.addEventListener("click", () => {
    applyLanguage(button.lang);
    try {
      localStorage.setItem("wedding-language", button.lang);
    } catch {
      // The language remains selected for this page.
    }
  });
}

const validationMessages = {
  name: "请输入有效的姓名。",
  email: "请输入有效的电子邮箱。",
  dietary_preference: "请选择有效的饮食选项。",
  adult_name_1: "请填写每位同行成人的法定姓名。",
  adult_name_2: "请填写每位同行成人的法定姓名。",
  attendance: "请选择出席意向。",
  party_size: "请输入 1 至 12 人。",
  note: "留言最多 1000 个字符。"
};
form.noValidate = true;
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!canSubmit) return;
  const invalid = form.querySelector(":invalid:not(fieldset)");
  showEmailError(!email.validity.valid);
  if (invalid) {
    showFeedback(validationMessages[invalid.name] || "请填写有效的同行人数及儿童年龄。");
    invalid.focus();
    return;
  }
  submit.disabled = true;
  showFeedback("正在寄出…");
  try {
    const response = await fetch(rsvpEndpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const result = await response.json();
    if (!response.ok) {
      showFeedback(messages.has(result.error) ? result.error : failed);
      return;
    }
    form.reset();
    showEmailError(false);
    updatePartyField();
    showFeedback("收到你的信啦，谢谢你！");
  } catch {
    showFeedback(failed);
  } finally {
    submit.disabled = false;
  }
});

const weddingMapElement = document.querySelector("#wedding-map");
const weddingMapControls = document.querySelector(".map-controls");
let weddingMap;
let stationMarker;

function updateStationLabel() {
  if (!stationMarker) return;
  const link = document.querySelector('[data-map-point="station"]');
  const label = document.documentElement.lang === "en" ? link.dataset.markerEn : link.dataset.marker;
  stationMarker.setTooltipContent(label);
  stationMarker.options.title = label;
  stationMarker.options.alt = label;
  const icon = stationMarker.getElement();
  icon?.setAttribute("title", label);
  icon?.setAttribute("aria-label", label);
  stationMarker.closePopup();
}

function showWeddingMap() {
  if (!window.L) return;
  if (weddingMap) {
    weddingMap.invalidateSize({pan: false});
    return;
  }
  weddingMapElement.hidden = false;
  weddingMapControls.hidden = false;
  weddingMap = L.map(weddingMapElement, {scrollWheelZoom: false});
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(weddingMap);

  const regionalPoints = [];
  const localPoints = [];
  const hotelLabels = {
    "Hotel Kristall": ["right", [12, -18]],
    "ALPtyrol Appartements": ["right", [12, 2]],
    "Haus Pepi Eiter": ["left", [-12, 5]],
    "Skihotel Galzig": ["top", [0, -12]],
    "Hotel Garni Rundeck": ["right", [12, 16]],
    "Hotel Montana": ["left", [-12, -12]]
  };
  for (const link of document.querySelectorAll("[data-map-point]")) {
    const coordinates = link.dataset.coordinates.split(",").map(Number);
    const kind = link.dataset.mapPoint;
    const label = link.dataset.marker || link.textContent.trim().split(" · ")[0];
    regionalPoints.push(coordinates);
    if (kind !== "airport") localPoints.push(coordinates);
    const marker = L.marker(coordinates, {
      title: label,
      alt: label,
      zIndexOffset: kind === "venue" ? 100 : 0,
      icon: L.divIcon({
        className: `wedding-map-pin wedding-map-pin-${kind}`,
        iconSize: [17, 17]
      })
    }).addTo(weddingMap);
    if (kind === "station") stationMarker = marker;
    const [direction, offset] = kind === "station" ? ["bottom", [0, 10]]
      : hotelLabels[label] || ["top", [0, -10]];
    marker.bindTooltip(label, {
      permanent: true,
      direction,
      offset,
      className: `wedding-map-label wedding-map-label-${kind}`
    });
    marker.bindPopup(() => {
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = kind === "venue" ? label : kind === "station" ? marker.options.title : link.textContent.trim();
      popup.append(title);
      const distance = link.closest("article, li")?.querySelector(".map-distance");
      if (distance) {
        const summary = document.createElement("div");
        summary.textContent = distance.textContent;
        popup.append(summary);
      }
      const directions = document.createElement("a");
      directions.href = link.href;
      directions.textContent = kind === "venue" ? "Google Maps ↗"
        : document.documentElement.lang === "en" ? "Directions on Google Maps ↗" : "Google Maps 路线 ↗";
      popup.append(document.createElement("br"), directions);
      return popup;
    });
  }

  const viewButtons = weddingMapControls.querySelectorAll("button");
  function setView(view) {
    weddingMap.closePopup();
    weddingMap.fitBounds(view === "local" ? localPoints : regionalPoints, {
      padding: [30, 30],
      maxZoom: 17
    });
    for (const button of viewButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.mapView === view));
    }
  }
  for (const button of viewButtons) {
    button.addEventListener("click", () => setView(button.dataset.mapView));
  }
  function updateMapLabels() {
    weddingMapElement.classList.toggle("map-show-hotel-labels", weddingMap.getZoom() >= 14);
  }
  weddingMap.on("zoomend", updateMapLabels);
  setView("regional");
  updateMapLabels();
  updateStationLabel();
}

document.addEventListener("wedding-language-change", updateStationLabel);

const sitePages = new Map(
  Array.from(document.querySelector("#wedding-pages").children, page => [`#${page.id}`, page])
);
const siteTabs = document.querySelectorAll(".site-tabs a");
const siteFooter = document.querySelector("body > footer");

function showSitePage() {
  const current = sitePages.has(location.hash) ? location.hash : "#home";
  for (const [hash, page] of sitePages) page.hidden = hash !== current;
  siteFooter.hidden = current === "#home";
  if (current === "#details") showWeddingMap();
  for (const tab of siteTabs) {
    if (tab.hash === current) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

showSitePage();
window.addEventListener("hashchange", () => {
  showSitePage();
  window.scrollTo(0, 0);
});
document.addEventListener("click", event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || !sitePages.has(link.hash) || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, "", link.hash);
  showSitePage();
  window.scrollTo(0, 0);
});
