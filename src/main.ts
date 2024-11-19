// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Elements
const _app_title: HTMLHeadingElement = document.querySelector("#appTitle")!;
const control_panel: HTMLDivElement = document.querySelector("#controlPanel")!;
const map_element: HTMLDivElement = document.querySelector("#map")!;
const inventory_element: HTMLDivElement = document.querySelector("#inventory")!;

// Interfaces
interface Cell {
  i: number;
  j: number;
}

interface latlng {
  lat: number;
  lng: number;
}

interface Coin {
  cell: Cell;
  serial: number;
}

interface Cache {
  cell: Cell;
  coins: Coin[];
  toMomento(): string;
  fromMomento(momento: string): void;
  toString(): string;
}

interface Board {
  tile_width: number;
  tile_visible_radius: number;
  known_cells: Map<string, Cell>;
  getCell(i: number, j: number): Cell;
  getCellFromPoint(point: latlng): Cell;
  getCellsNearPoint(point: latlng): Cell[];
}

interface MapService {
  initialize(parentElement: HTMLElement, center: latlng, zoom: number): void;
  setView(coord: latlng, zoom: number): void;
  addMarker(coord: latlng, text: string): void;
  addCache(cache: Cache): void;
  refresh(callback: () => void): void;
  addControlPanelFunc(): void;
  calculateDistance(a: latlng, b: latlng): number;
  drawPath(path: latlng[][]): void;
}

class LeafletMapService implements MapService {
  private map: leaflet.Map;
  private clearLayer: leaflet.LayerGroup;
  constructor(parentElement: HTMLElement, center: latlng, zoom: number) {
    this.map = this.initialize(parentElement, center, zoom);
    this.clearLayer = new leaflet.LayerGroup().addTo(this.map);
  }
  initialize(parentElement: HTMLElement, center: latlng, zoom: number) {
    this.map = leaflet.map(parentElement, {
      center: leaflet.latLng(center),
      zoom: zoom,
      minZoom: GAMEPLAY_ZOOM_LEVEL,
      maxZoom: GAMEPLAY_ZOOM_LEVEL,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    leaflet
      .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
      .addTo(this.map);

    return this.map;
  }
  setView(coord: latlng, zoom: number): void {
    this.map.setView(leaflet.latLng(coord), zoom);
  }
  addMarker(coord: { lat: number; lng: number }, text: string): void {
    const marker = leaflet.marker(leaflet.latLng(coord));
    marker.bindTooltip(text);
    marker.addTo(this.map);
    this.clearLayer.addLayer(marker);
  }
  addCache(cache: Cache): void {
    const marker = leaflet.marker({
      lat: cache.cell.i * TILE_DEGREES,
      lng: cache.cell.j * TILE_DEGREES,
    });
    marker.addTo(this.map);
    this.clearLayer.addLayer(marker);

    const iconElement = marker.getElement();
    if (iconElement) {
      iconElement.style.filter = "hue-rotate(120deg)";
    }
    const cache_updated: Event = new CustomEvent(
      `cache-updated-${cache.cell.i}-${cache.cell.j}`,
    );

    addEventListener(`cache-updated-${cache.cell.i}-${cache.cell.j}`, () => {
      marker.setPopupContent(updateCachePopup());
    });
    marker.addEventListener("click", () => {
      marker.bindPopup(updateCachePopup());
    });

    function updateCachePopup() {
      const popup = document.createElement("div");
      popup.innerHTML = `<div>Cache ${cache.cell.i}:${cache.cell.j}</div>`;

      const coinList: HTMLUListElement = document.createElement("ul");

      for (let i = 0; i < cache.coins.length; i++) {
        const coinElement: HTMLLIElement = document.createElement("li");
        coinElement.innerHTML =
          `Coin ID: ${(cache.coins[i].cell.i)}:${(cache.coins[i].cell.j)}#${
            cache.coins[i].serial
          } <button id="coin${i}">collect</button>`;
        coinList.appendChild(coinElement);
      }
      popup.appendChild(coinList);

      for (let i = 0; i < cache.coins.length; i++) {
        const button: HTMLButtonElement = popup.querySelector<
          HTMLButtonElement
        >(
          `#coin${i}`,
        )!;
        button.addEventListener("click", () => {
          transfer(cache, inventory, cache.coins[i]);
          dispatchEvent(player_inventory_changed);
          dispatchEvent(cache_updated);
        });
        // Credit ChatGPT to prevent popup close
        leaflet.DomEvent.on(button, "click", function (e) {
          leaflet.DomEvent.stopPropagation(e);
        });
      }

      if (inventory.coins.length > 0) {
        const button = document.createElement("button");
        button.innerHTML = "deposit";

        button.addEventListener("click", () => {
          transfer(
            inventory,
            cache,
            inventory.coins[inventory.coins.length - 1],
          );
          dispatchEvent(player_inventory_changed);
          dispatchEvent(cache_updated);
        });

        leaflet.DomEvent.on(button, "click", function (e) {
          leaflet.DomEvent.stopPropagation(e);
        });

        popup.append(button);
      }

      return popup;
    }
  }
  refresh(callback: () => void): void {
    this.clearLayer.clearLayers();
    this.map.setView(origin, GAMEPLAY_ZOOM_LEVEL);
    callback();
  }
  addControlPanelFunc(): void {
    const pos_button: HTMLButtonElement = document.createElement("button");
    pos_button.innerHTML = "🌐";
    pos_button.id = "emojiButton";
    pos_button.addEventListener("click", () => {
      toggleGeolocation();
    });

    control_panel.appendChild(pos_button);

    createMovementButton("⬆️", leaflet.latLng(TILE_DEGREES, 0));
    createMovementButton("⬇️", leaflet.latLng(-TILE_DEGREES, 0));
    createMovementButton("⬅️", leaflet.latLng(0, -TILE_DEGREES));
    createMovementButton("➡️", leaflet.latLng(0, TILE_DEGREES));

    const trash_button: HTMLButtonElement = document.createElement("button");
    trash_button.innerHTML = "🚮";
    trash_button.id = "emojiButton";
    trash_button.addEventListener("click", () => {
      clearData();
    });
    control_panel.appendChild(trash_button);

    function createMovementButton(icon: string, dir: leaflet.LatLng) {
      const button: HTMLButtonElement = document.createElement("button");
      button.innerHTML = icon;
      button.id = "emojiButton";
      button.addEventListener("click", () => {
        if (geoloc) {
          alert("Turn off geolocation");
          return;
        }
        origin = leaflet.latLng(origin.lat + dir.lat, origin.lng + dir.lng);
        dispatchEvent(player_moved);
      });
      control_panel.appendChild(button);
    }
  }
  calculateDistance(a: latlng, b: latlng): number {
    const la = leaflet.latLng(a);
    const lb = leaflet.latLng(b);
    return la.distanceTo(lb);
  }
  drawPath(path: latlng[][]): void {
    const polyline = leaflet.polyline(path, { color: "blue" });
    polyline.addTo(this.map);
    this.map.addLayer(polyline);
  }
}

// Events
const player_moved: Event = new CustomEvent("player-moved");
const player_inventory_changed: Event = new CustomEvent(
  "player-inventory-changed",
);

// Const
const OAKES_CLASSROOM: leaflet.LatLng = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);

const inventory: Cache = createCache(0, 0, 0);
inventory.toString = () => {
  return "inventory";
};
const momentos: Map<string, string> = new Map<string, string>();

const locHistory: latlng[][] = [];

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const HISTORY_UPDATE_DISTANCE = 20;

const mapService = new LeafletMapService(
  map_element,
  OAKES_CLASSROOM,
  GAMEPLAY_ZOOM_LEVEL,
);

function createBoard() {
  const board: Board = {
    tile_width: TILE_DEGREES,
    tile_visible_radius: NEIGHBORHOOD_SIZE,
    known_cells: new Map<string, Cell>(),
    getCell(i: number, j: number) {
      const key = [i, j].toString();
      if (!this.known_cells.has(key)) {
        this.known_cells.set(key, { i: i, j: j });
      }
      return this.known_cells.get(key)!;
    },
    getCellFromPoint(point: latlng) {
      const i = Math.floor(point.lat / this.tile_width);
      const j = Math.floor(point.lng / this.tile_width);
      return this.getCell(i, j);
    },
    getCellsNearPoint(point: latlng) {
      const cells: Cell[] = [];
      const origin: Cell = this.getCellFromPoint(point);

      for (
        let i = -this.tile_visible_radius;
        i < this.tile_visible_radius;
        i++
      ) {
        for (
          let j = -this.tile_visible_radius;
          j < this.tile_visible_radius;
          j++
        ) {
          cells.push(this.getCell(i + origin.i, j + origin.j));
        }
      }

      return cells;
    },
  };

  return board;
}

// Transfer a coin from cache a to cache b
function transfer(a: Cache, b: Cache, coin: Coin) {
  const index = a.coins.indexOf(coin);
  if (index < 0) {
    return;
  }
  a.coins.splice(index, 1);
  b.coins.push(coin);
  momentos.set(a.toString(), a.toMomento());
  momentos.set(b.toString(), b.toMomento());
}

function createCache(i: number, j: number, num_coins: number): Cache {
  const cache: Cache = {
    cell: { i: i, j: j },
    coins: [],
    toMomento() {
      return JSON.stringify(this.coins);
    },
    fromMomento(momento: string) {
      this.coins = JSON.parse(momento);
    },
    toString() {
      return [i, j].toString();
    },
  };
  for (let k = 0; k < num_coins; k++) {
    cache.coins.push({
      cell: cache.cell,
      serial: k,
    });
  }

  return cache;
}

function updateInventory() {
  inventory_element.innerHTML = "Inventory: ";
  const coin_list: HTMLUListElement = document.createElement("ul");
  for (let i = 0; i < inventory.coins.length; i++) {
    const coin_element: HTMLLIElement = document.createElement("li");
    coin_element.innerHTML =
      `Coin ID: ${(inventory.coins[i].cell.i)}:${(inventory.coins[i].cell.j)}#${
        inventory.coins[i].serial
      }`;
    coin_list.appendChild(coin_element);
  }
  inventory_element.appendChild(coin_list);
}

let geoloc: boolean = false;

let watchID: number;
function toggleGeolocation() {
  geoloc = !geoloc;
  if (geoloc) {
    if (navigator.geolocation) {
      watchID = navigator.geolocation.watchPosition((position) => {
        const realPos = leaflet.latLng(
          position.coords.latitude,
          position.coords.longitude,
        );
        origin = realPos;
        dispatchEvent(player_moved);
      }, () => {
        alert("Geolocation failed");
        geoloc = false;
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      });
    } else {
      alert("Geolocation not supported");
      geoloc = false;
    }
  } else {
    navigator.geolocation.clearWatch(watchID);
  }
}

function updateLocationHistory() {
  //if there is no history, add the current location
  if (locHistory.length == 0) {
    locHistory.push([origin]);
  } else {
    const lastPos = locHistory[locHistory.length - 1];
    //if the distance from the last recorded position is within HISTORY_UPDATE_DISTANCE, add it to the current line, else make a new line
    if (
      mapService.calculateDistance(origin, lastPos[lastPos.length - 1]) <
        HISTORY_UPDATE_DISTANCE
    ) {
      lastPos.push(origin);
    } else {
      locHistory.push([origin]);
    }
  }
}

function showNearbyCaches(coord: latlng) {
  const cells = board.getCellsNearPoint(coord);

  cells.forEach((cell) => {
    const chance: number = luck([cell.i, cell.j].toString());
    if (chance < CACHE_SPAWN_PROBABILITY) {
      if (!momentos.has([cell.i, cell.j].toString())) {
        const num_coins: number = Math.floor(chance * 30) + 1;
        mapService.addCache(createCache(cell.i, cell.j, num_coins));
      } else {
        const momento = momentos.get([cell.i, cell.j].toString())!;
        const cache = createCache(cell.i, cell.j, 0);
        cache.fromMomento(momento);
        mapService.addCache(cache);
      }
    }
  });
}

function refreshMap() {
  mapService.refresh(() => {
    showNearbyCaches(origin);
    updateLocationHistory();
    mapService.addMarker(origin, "That's You!");
    mapService.drawPath(locHistory);
  });
  console.log("refresh");
}

function saveData() {
  localStorage.setItem("data", JSON.stringify(Array.from(momentos.entries())));
  localStorage.setItem("loc", JSON.stringify([origin.lat, origin.lng]));
  localStorage.setItem("hist", JSON.stringify(locHistory));
}
function loadData() {
  const data_string = localStorage.getItem("data");
  if (!data_string) {
    return;
  }
  const data_array: [string, string][] = JSON.parse(data_string);
  data_array.forEach(([key, value]) => {
    momentos.set(key, value);
  });
  const inv = momentos.get("inventory");
  if (inv) {
    inventory.fromMomento(inv);
  }
  const loc_string = localStorage.getItem("loc");
  if (loc_string) {
    const loc = JSON.parse(loc_string);
    origin = leaflet.latLng(loc[0], loc[1]);
  }
  const hist_string = localStorage.getItem("hist");
  if (hist_string) {
    const temp = JSON.parse(hist_string);
    temp.forEach((element: []) => {
      locHistory.push(element);
    });
  }
}
function clearData() {
  const confirmation = prompt("If you want to clear data, type: DELETE", "");
  if (confirmation === "DELETE") {
    localStorage.clear();
    console.log(localStorage.getItem("data"));
    globalThis.removeEventListener("beforeunload", saveData);
    location.reload();
  }
}

globalThis.addEventListener("beforeunload", saveData);
let origin: latlng = OAKES_CLASSROOM;
loadData();
const board: Board = createBoard();
mapService.addControlPanelFunc();

// Listeners
addEventListener("player-inventory-changed", () => {
  updateInventory();
});

addEventListener("player-moved", refreshMap);
updateInventory();
refreshMap();
