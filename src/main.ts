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
const _control_panel: HTMLDivElement = document.querySelector("#controlPanel")!;
const map_element: HTMLDivElement = document.querySelector("#map")!;
const inventory_element: HTMLDivElement = document.querySelector("#inventory")!;

// Interfaces
interface Cell {
  i: number;
  j: number;
}

interface Coin {
  serial: string;
}

interface Cache {
  cell: Cell;
  coins: Coin[];
  latLng(origin: leaflet.LatLng): leaflet.LatLng;
}

// Events
const _player_moved: Event = new CustomEvent("player-moved");
const player_inventory_changed: Event = new CustomEvent(
  "player-inventory-changed",
);

// Const
const OAKES_CLASSROOM: leaflet.LatLng = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);
const inventory: Cache = {
  cell: { i: 0, j: 0 },
  coins: [],
  latLng(origin: leaflet.LatLng) {
    return origin;
  },
};

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Transfer a coin from cache a to cache b
function transfer(a: Cache, b: Cache, coin: Coin) {
  const index = a.coins.indexOf(coin);
  if (index < 0) {
    return;
  }
  a.coins.splice(index, 1);
  b.coins.push(coin);
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
}

function coordToLatLng(i: number, j: number, origin: leaflet.LatLng) {
  return leaflet.latLng(
    origin.lat + i * TILE_DEGREES,
    origin.lng + j * TILE_DEGREES,
  );
}

function createCache(i: number, j: number): Cache {
  const cache: Cache = {
    cell: { i: i, j: j },
    coins: [],
    latLng(origin: leaflet.LatLng) {
      return coordToLatLng(i, j, origin);
    },
  };
  const chance: number = luck([i + j].toString());
  const num_coins: number = Math.floor(chance * 3) + 1;
  for (let k = 0; k < num_coins; k++) {
    cache.coins.push({ serial: `(${i},${j}):${k.toFixed(0)}` });
  }
  return cache;
}

function placeCache(cache: Cache, origin: leaflet.LatLng) {
  const position = cache.latLng(origin);
  const marker = leaflet.marker(position);
  marker.addTo(map);

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
  popupDiv.innerHTML = `<div>Cache (${cache.cell.i},${cache.cell.j})</div>`;

  const coin_list: HTMLUListElement = document.createElement("ul");

  for (let i = 0; i < cache.coins.length; i++) {
    const coin_element: HTMLLIElement = document.createElement("li");
    coin_element.innerHTML = `Coin ID: ${
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
    // Credet ChatGPT to prevent popup close
    leaflet.DomEvent.on(button, "click", function (e) {
      leaflet.DomEvent.stopPropagation(e);
    });
  }

  if (inventory.coins.length > 0) {
    const button = document.createElement("button");
    button.innerHTML = "Transfer";

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
  console.log(inventory.coins.length);
  inventory_element.innerHTML = "Inventory: ";
  const coin_list: HTMLUListElement = document.createElement("ul");
  for (let i = 0; i < inventory.coins.length; i++) {
    const coin_element: HTMLLIElement = document.createElement("li");
    coin_element.innerHTML = `Coin ID: ${inventory.coins[i].serial}`;
    coin_list.appendChild(coin_element);
  }
  inventory_element.appendChild(coin_list);
}

// Listeners
addEventListener("player-inventory-changed", () => {
  updateInventory();
});

const origin = OAKES_CLASSROOM;
const map = createMap(origin);
updateInventory();

createMarker(origin, "That's You!", map);

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    const chance: number = luck([i, j].toString());
    if (chance < CACHE_SPAWN_PROBABILITY) {
      const cache: Cache = createCache(i, j);
      placeCache(cache, origin);
    }
  }
}
