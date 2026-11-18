const navigation = document.querySelector(".tabs");
const links = Array.from(navigation.querySelectorAll("a"));
const panels = new Map(links.map(link => [link.hash, document.querySelector(link.hash)]));
const mapElement = document.querySelector("#venue-map");
const mapStatus = document.querySelector("#venue-map-status");
let map;

function showMap() {
  if (!window.L) {
    mapStatus.textContent = "互动地图暂时无法加载。下方的地点链接仍可使用。";
    return;
  }
  if (map) {
    map.invalidateSize({pan: false});
    return;
  }

  mapElement.hidden = false;
  map = L.map(mapElement, {scrollWheelZoom: false, zoomSnap: 0.25});
  let tileLoaded = false;
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  tiles.on("tileload", () => {
    tileLoaded = true;
    mapStatus.hidden = true;
  });
  tiles.on("tileerror", () => {
    if (tileLoaded) return;
    mapStatus.textContent = "底图暂时无法加载。仍可点选地图标记或下方链接。";
  });
  tiles.addTo(map);

  const points = [];
  for (const link of document.querySelectorAll(".map-key a[data-coordinates]")) {
    const location = link.dataset.coordinates.split(",").map(Number);
    points.push(location);
    const isAirport = !link.hash;
    const icon = L.divIcon({
      className: isAirport ? "map-point map-point-airport" : "map-point",
      iconSize: [15, 15]
    });
    const marker = L.marker(location, {icon, title: link.textContent, alt: link.textContent}).addTo(map);
    const popup = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = link.textContent;
    const detail = document.createElement("a");
    detail.href = link.getAttribute("href");
    detail.textContent = isAirport ? "机场官网 ↗" : "查看场地详情 ↗";
    popup.append(heading, document.createElement("br"), detail);
    const labelDirection = link.hash === "#speckbacherhof" ? "bottom"
      : link.dataset.marker === "INN" ? "top" : "right";
    marker.bindPopup(popup).bindTooltip(link.dataset.marker, {
      permanent: true,
      direction: labelDirection,
      offset: labelDirection === "right" ? [9, 0] : [0, labelDirection === "top" ? -9 : 9],
      className: "venue-map-label"
    });
  }
  map.fitBounds(points, {padding: [32, 38]});
}

function showPanel() {
  const selected = panels.has(location.hash) ? location.hash : "#compare";
  for (const [hash, panel] of panels) panel.hidden = hash !== selected;
  for (const link of links) {
    if (link.hash === selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (selected === "#compare") showMap();
}

showPanel();
window.addEventListener("hashchange", showPanel);
document.addEventListener("click", event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link || !panels.has(link.hash)) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, "", link.hash);
  showPanel();
  if (!navigation.contains(link)) navigation.scrollIntoView({block: "start"});
});
