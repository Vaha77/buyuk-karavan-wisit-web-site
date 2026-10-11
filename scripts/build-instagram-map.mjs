// Builds the Instagram statistics country map from world-atlas (Natural Earth, public domain; world-atlas is ISC).
//
//   curl -L -o countries-50m.json https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
//   node scripts/build-instagram-map.mjs countries-50m.json
//
// Output: lib/instagram/world-map.json — pre-projected SVG paths (azimuthal equal-area centred on 64°E 43°N) for the
// coloured countries and the grey neighbours, plus a label point per country. The browser needs no geo library.
import { readFileSync, writeFileSync } from "node:fs";
import { geoAzimuthalEqualArea, geoCentroid, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const source = process.argv[2];
if (!source) { console.error("Usage: node scripts/build-instagram-map.mjs <countries-50m.json>"); process.exit(1); }

// ISO 3166-1 numeric (world-atlas ids) → alpha-2 (Instagram demographics keys) and Uzbek name.
const FOCUS = { "860": ["UZ", "O‘zbekiston"], "398": ["KZ", "Qozog‘iston"], "417": ["KG", "Qirg‘iziston"], "762": ["TJ", "Tojikiston"], "795": ["TM", "Turkmaniston"], "004": ["AF", "Afg‘oniston"], "643": ["RU", "Rossiya"] };
const NEIGHBOURS = { "156": ["CN", "Xitoy"], "364": ["IR", "Eron"], "586": ["PK", "Pokiston"], "496": ["MN", "Mo‘g‘uliston"], "031": ["AZ", "Ozarbayjon"], "051": ["AM", "Armaniston"], "268": ["GE", "Gruziya"], "356": ["IN", "Hindiston"], "792": ["TR", "Turkiya"] };
// Where the label of a big / oddly shaped country goes (lon, lat).
const LABEL_AT = { RU: [62, 56], KZ: [67, 48.5], AF: [66, 33.8], TM: [59, 39.3], UZ: [64, 41.6], KG: [74.8, 41.5], TJ: [71, 38.7] };
const WIDTH = 640, HEIGHT = 440;

const topo = JSON.parse(readFileSync(source, "utf8"));
const countries = feature(topo, topo.objects.countries).features;
const pick = ids => countries.filter(item => ids[String(item.id).padStart(3, "0")]);
const focus = pick(FOCUS), neighbours = pick(NEIGHBOURS);
if (focus.length !== Object.keys(FOCUS).length) { console.error("Missing focus countries", focus.map(item => item.id)); process.exit(1); }

// Fit Central Asia + Afghanistan (Russia is large, so it is clipped at the frame).
const core = { type: "FeatureCollection", features: focus.filter(item => String(item.id) !== "643") };
const projection = geoAzimuthalEqualArea().rotate([-64, -43]).fitExtent([[60, 90], [WIDTH - 60, HEIGHT - 30]], core).clipExtent([[0, 0], [WIDTH, HEIGHT]]);
const path = geoPath(projection);
const round = d => (d ?? "").replace(/(\d+\.\d)\d+/g, "$1");
const shape = (item, names) => {
  const [code, name] = names[String(item.id).padStart(3, "0")];
  const at = projection(LABEL_AT[code] ?? geoCentroid(item));
  return { code, name, d: round(path(item)), label: at ? [Math.round(at[0]), Math.round(at[1])] : null };
};
const out = { width: WIDTH, height: HEIGHT, source: "Natural Earth via world-atlas 2.0.2 (countries-50m)", countries: focus.map(item => shape(item, FOCUS)), neighbours: neighbours.map(item => shape(item, NEIGHBOURS)).filter(item => item.d) };
writeFileSync(new URL("../lib/instagram/world-map.json", import.meta.url), JSON.stringify(out));
console.log("world-map.json:", out.countries.length, "countries,", out.neighbours.length, "neighbours,", Math.round(JSON.stringify(out).length / 1024), "KB");
