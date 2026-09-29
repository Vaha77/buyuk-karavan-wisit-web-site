// Builds the BKLead dashboard maps from Natural Earth admin-1 boundaries (public domain, naturalearthdata.com).
//
//   curl -L -o ne_admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//   node scripts/build-region-maps.mjs ne_admin1.geojson
//
// Output: lib/dashboard/maps/{all,uz,kz,kg,tj,tm,af}.json — pre-projected SVG paths, so the browser needs no geo library.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { geoArea, geoConicEqualArea, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";
import { feature, merge } from "topojson-client";

const source = process.argv[2];
if (!source) { console.error("Usage: node scripts/build-region-maps.mjs <ne_10m_admin_1_states_provinces.geojson>"); process.exit(1); }
const OUT = new URL("../lib/dashboard/maps/", import.meta.url);
const COUNTRIES = ["UZ", "KZ", "KG", "TJ", "TM", "AF"];
// "Tadzhikistan Territories" has the placeholder ISO code "TJ-X01~" and becomes TJ-RR.
// Natural Earth reuses one ISO code for two areas in a few places; adm1_code tells them apart.
const CODE_OVERRIDES = { "KAZ-4829": "KZ-ALM", "AFG-1769": "AF-PAN", "AFG-1753": "AF-DAY" };
// Cities without their own polygon in Natural Earth: drawn as a point with a callout.
const CITY_POINTS = [{ code: "KZ-SHY", country: "KZ", lonLat: [69.59, 42.32] }];

const all = JSON.parse(readFileSync(source, "utf8"));
const features = all.features.filter(f => COUNTRIES.includes(f.properties.iso_a2)).map(f => {
  const p = f.properties;
  const code = CODE_OVERRIDES[p.adm1_code] || (p.iso_3166_2.includes("~") ? "TJ-RR" : p.iso_3166_2);
  return { type: "Feature", properties: { code, country: p.iso_a2 }, geometry: f.geometry };
});
const codes = features.map(f => f.properties.code);
const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
if (duplicates.length) { console.error("Duplicate region codes:", duplicates); process.exit(1); }

// Simplify on the shared topology so neighbouring regions keep common borders.
let topo = topology({ regions: { type: "FeatureCollection", features } }, 1e5);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.12));

// Country outlines: enclaves (e.g. Astana inside Aqmola) must not leave holes after dissolving.
const withoutHoles = shape => ({ ...shape, coordinates: shape.coordinates.map(polygon => [polygon[0]]) });
const round = d => d?.replace(/(\d+\.\d)\d+/g, "$1") ?? "";
function build(view, pick, width = 640) {
  const geoms = topo.objects.regions.geometries.filter(pick);
  const collection = feature(topo, { type: "GeometryCollection", geometries: geoms });
  const projection = geoConicEqualArea().parallels([36, 48]).rotate([-66, 0]);
  projection.fitWidth(width - 24, collection);
  const bounds = geoPath(projection).bounds(collection);
  const height = Math.ceil(bounds[1][1] - bounds[0][1] + 24);
  projection.translate([projection.translate()[0] - bounds[0][0] + 12, projection.translate()[1] - bounds[0][1] + 12]);
  const path = geoPath(projection);
  const areas = view === "all"
    ? COUNTRIES.map(country => { const shape = withoutHoles(merge(topo, geoms.filter(g => g.properties.country === country))); return { code: country, d: round(path(shape)), centroid: path.centroid(shape), area: geoArea(shape) }; })
    : collection.features.map(f => ({ code: f.properties.code, d: round(path(f)), centroid: path.centroid(f), area: geoArea(f) }));
  const regions = areas.map(({ code, d, centroid, area }) => ({ code, d, x: +centroid[0].toFixed(1), y: +centroid[1].toFixed(1), small: view !== "all" && area < 2e-5 }));
  for (const city of CITY_POINTS.filter(point => view === point.country.toLowerCase())) {
    const [x, y] = projection(city.lonLat);
    regions.push({ code: city.code, d: "", x: +x.toFixed(1), y: +y.toFixed(1), small: true, point: true });
  }
  const outlines = view === "all" ? "" : round(path(merge(topo, geoms)));
  return { view, viewBox: `0 0 ${width} ${height}`, outline: outlines, regions, credit: "Natural Earth" };
}

mkdirSync(OUT, { recursive: true });
const views = { all: () => true, ...Object.fromEntries(COUNTRIES.map(country => [country.toLowerCase(), g => g.properties.country === country])) };
for (const [view, pick] of Object.entries(views)) {
  const json = JSON.stringify(build(view, pick));
  writeFileSync(new URL(`${view}.json`, OUT), json);
  console.log(view.padEnd(4), `${(json.length / 1024).toFixed(1)} KB`);
}
