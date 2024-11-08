// todo

// Imports
import "./style.css";
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
//import luck from "./luck.ts";

// Elements
// const app_title : HTMLHeadingElement = document.querySelector("#appTitle")!;
// const control_panel : HTMLDivElement = document.querySelector("#controlPanel")!;
const map_element: HTMLDivElement = document.querySelector("#map")!;
// const cache_detail_panel : HTMLDivElement = document.querySelector("#cacheDetailPanel")!;
// const inventory_element : HTMLDivElement = document.querySelector("#inventory")!;

// Interfaces
interface Cell {
  i: number;
  j: number;
}

interface Coin {
  serial: number;
}

interface Cache {
  cell: Cell;
  coins: Coin[];
}

// Events
// const cache_updated : Event = new CustomEvent("cache-updated");
// const player_moved : Event = new CustomEvent("player-moved");
// const player_inventory_changed : Event = new CustomEvent("player-inventory-changed");

// Top Functions
// function collect(inventory : Cache, cache : Cache, coin : Coin){

// }

// function deposit(inventory : Cache, cache : Cache, coin : Coin){

// }

// Set Up
// Credits: https://github.com/rndmcnlly/cmpm-121-demo-3/blob/main/src/example.ts
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

const GAMEPLAY_ZOOM_LEVEL = 19;
// const TILE_DEGREES = 1e-4;
// const NEIGHBORHOOD_SIZE = 8;
// const CACHE_SPAWN_PROBABILITY = 0.1;

const map = leaflet.map(map_element, {
  center: OAKES_CLASSROOM,
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

const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);
