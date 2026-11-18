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
let playing = !motionPreference.matches;
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

function updateTimeline() {
  const index = currentSlide();
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
}, {threshold: 0.2});
galleryObserver.observe(strip);
setInterval(() => {
  if (playing && galleryVisible && !document.hidden) scrollPhoto(1);
}, 2000);

const form = document.querySelector("#reply");
const rsvpUnavailable = document.querySelector("#rsvp-unavailable");
fetch(form.action, {method: "HEAD", cache: "no-store"})
  .then(response => {
    if (response.status !== 204) return;
    rsvpUnavailable.hidden = true;
    form.hidden = false;
  })
  .catch(() => { /* The static page keeps the RSVP availability message visible. */ });
const partyField = document.querySelector("#party-field");
const partySize = form.elements.party_size;
const feedback = document.querySelector("#feedback");
const submit = form.querySelector("button");
function updatePartyField() {
  const attending = form.elements.attendance.value === "yes";
  partyField.hidden = !attending;
  partySize.disabled = !attending;
  partySize.required = attending;
}
form.addEventListener("change", updatePartyField);
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
  ["正在提交…", "Sending your RSVP…"],
  ["回执已收到，谢谢你！", "We’ve received your RSVP. Thank you!"],
  ["暂时无法提交。请保留已填写的内容，稍后再试。", "We couldn’t send your RSVP. Your entries are still here. Please try again shortly."],
  ["请检查回执格式。", "Please check the information you entered."],
  ["请输入有效的姓名。", "Please enter your name."],
  ["请输入有效的电子邮箱。", "Please enter a valid email address."],
  ["请选择出席意向。", "Please select whether you expect to attend."],
  ["请输入 1 至 12 人。", "Please enter a whole number from 1 to 12."],
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
  for (const entry of attributeTranslations) entry.element.setAttribute(entry.attribute, entry[variant]);
  for (const button of languageButtons) button.setAttribute("aria-pressed", String(button.lang === language));
  showFeedback(currentMessage);
  updatePlaybackLabel();
  updateTimeline();
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
  attendance: "请选择出席意向。",
  party_size: "请输入 1 至 12 人。",
  note: "留言最多 1000 个字符。"
};
form.noValidate = true;
form.addEventListener("submit", async event => {
  event.preventDefault();
  const invalid = form.querySelector(":invalid:not(fieldset)");
  if (invalid) {
    showFeedback(validationMessages[invalid.name]);
    invalid.focus();
    return;
  }
  submit.disabled = true;
  showFeedback("正在提交…");
  try {
    const response = await fetch(form.action, {
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
    updatePartyField();
    showFeedback("回执已收到，谢谢你！");
  } catch {
    showFeedback(failed);
  } finally {
    submit.disabled = false;
  }
});
