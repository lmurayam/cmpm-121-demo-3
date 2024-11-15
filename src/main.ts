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
  getCellFromPoint(point: leaflet.LatLng): Cell;
  getCellsNearPoint(point: leaflet.LatLng): Cell[];
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

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

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
    getCellFromPoint(point: leaflet.LatLng) {
      const i = Math.floor(point.lat / this.tile_width);
      const j = Math.floor(point.lng / this.tile_width);
      return this.getCell(i, j);
    },
    getCellsNearPoint(point: leaflet.LatLng) {
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

// Credits: https://github.com/rndmcnlly/cmpm-121-demo-3/blob/main/src/example.ts
function createMap(loc: leaflet.LatLng) {
  const map = leaflet.map(map_element, {
    center: loc,
    zoom: GAMEPLAY_ZOOM_LEVEL,
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
    .addTo(map);
  return map;
}

function createMarker(loc: leaflet.LatLng, text: string, map: leaflet.Map) {
  const marker = leaflet.marker(loc);
  marker.bindTooltip(text);
  marker.addTo(map);
  clear_layer.addLayer(marker);
  return marker;
}

function coordToLatLng(i: number, j: number) {
  return leaflet.latLng(
    i * TILE_DEGREES,
    j * TILE_DEGREES,
  );
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

function placeCache(cache: Cache) {
  const position = coordToLatLng(cache.cell.i, cache.cell.j);
  const marker = leaflet.marker(position);
  marker.addTo(map);
  clear_layer.addLayer(marker);
  // Change Marker Color: https://stackoverflow.com/a/61982880
  const iconElement = marker.getElement();
  if (iconElement) {
    iconElement.style.filter = "hue-rotate(120deg)";
  }

  const cache_updated: Event = new CustomEvent(
    `cache-updated-${cache.cell.i}-${cache.cell.j}`,
  );
  addEventListener(`cache-updated-${cache.cell.i}-${cache.cell.j}`, () => {
    marker.setPopupContent(updateCachePopup(cache, cache_updated));
  });
  marker.addEventListener("click", () => {
    marker.bindPopup(updateCachePopup(cache, cache_updated));
  });
}
function updateCachePopup(cache: Cache, cache_updated: Event) {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `<div>Cache ${cache.cell.i}:${cache.cell.j}</div>`;

  const coin_list: HTMLUListElement = document.createElement("ul");

  for (let i = 0; i < cache.coins.length; i++) {
    const coin_element: HTMLLIElement = document.createElement("li");
    coin_element.innerHTML =
      `Coin ID: ${(cache.coins[i].cell.i)}:${(cache.coins[i].cell.j)}#${
        cache.coins[i].serial
      } <button id="coin${i}">collect</button>`;
    coin_list.appendChild(coin_element);
  }
  popupDiv.appendChild(coin_list);

  for (let i = 0; i < cache.coins.length; i++) {
    const button: HTMLButtonElement = popupDiv.querySelector<HTMLButtonElement>(
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
      transfer(inventory, cache, inventory.coins[inventory.coins.length - 1]);
      dispatchEvent(player_inventory_changed);
      dispatchEvent(cache_updated);
    });

    leaflet.DomEvent.on(button, "click", function (e) {
      leaflet.DomEvent.stopPropagation(e);
    });

    popupDiv.append(button);
  }

  return popupDiv;
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

function createControlPanel() {
  const pos_button: HTMLButtonElement = document.createElement("button");
  pos_button.innerHTML = "🌐";
  pos_button.id = "emojiButton";
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
      origin = leaflet.latLng(origin.lat + dir.lat, origin.lng + dir.lng);
      dispatchEvent(player_moved);
    });
    control_panel.appendChild(button);
  }
}

function showNearbyCaches(pos: leaflet.LatLng) {
  const cells = board.getCellsNearPoint(pos);

  cells.forEach((cell) => {
    const chance: number = luck([cell.i, cell.j].toString());
    if (chance < CACHE_SPAWN_PROBABILITY) {
      if (!momentos.has([cell.i, cell.j].toString())) {
        const num_coins: number = Math.floor(chance * 30) + 1;
        placeCache(createCache(cell.i, cell.j, num_coins));
      } else {
        const momento = momentos.get([cell.i, cell.j].toString())!;
        const cache = createCache(cell.i, cell.j, 0);
        cache.fromMomento(momento);
        placeCache(cache);
      }
    }
  });
}

function saveData() {
  localStorage.setItem("data", JSON.stringify(Array.from(momentos.entries())));
}
function loadData() {
  const data_string = localStorage.getItem("data");
  if (!data_string) {
    return;
  }
  const data_array = JSON.parse(data_string);
  data_array.forEach((key: string, value: string) => {
    momentos.set(key, value);
  });
}
function clearData() {
  const confirmation = prompt("If you want to clear data, type: DELETE", "");
  if (confirmation === "DELETE") {
    localStorage.clear();
    location.reload();
  }
}

globalThis.addEventListener("beforeunload", () => {
  saveData();
});

let origin = OAKES_CLASSROOM;
const map = createMap(origin);
const clear_layer: leaflet.LayerGroup = new leaflet.LayerGroup().addTo(map);
const board: Board = createBoard();

// Listeners
addEventListener("player-inventory-changed", () => {
  updateInventory();
});

addEventListener("player-moved", () => {
  clear_layer.clearLayers();
  map.setView(origin, GAMEPLAY_ZOOM_LEVEL);
  createMarker(origin, "That's You!", map);
  showNearbyCaches(origin);
});

loadData();

createControlPanel();
updateInventory();
createMarker(origin, "That's You!", map);
showNearbyCaches(origin);
