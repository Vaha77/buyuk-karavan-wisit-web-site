// Builds the BKLead dashboard maps from Natural Earth admin-1 boundaries (public domain, naturalearthdata.com).
//
//   curl -L -o ne_admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//   node scripts/build-region-maps.mjs ne_admin1.geojson [geoboundaries-dir]
// Optional geoBoundaries dir (geoboundaries.org, ODbL) with UZB.geojson, KAZ.geojson, TJK.geojson (ADM1) and KAZ2.geojson (ADM2):
// city polygons for the "ca" map (Shymkent has none in Natural Earth, the others are coarse there).
//
// Output: lib/dashboard/maps/{all,uz,kz,kg,tj,tm,af,ca}.json (ca = the 5 customer countries, regions + country borders) — pre-projected SVG paths, so the browser needs no geo library.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { geoArea, geoConicEqualArea, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";
import { feature, merge } from "topojson-client";

const source = process.argv[2], gbDir = process.argv[3];
const GB_CITIES = [["KAZ", "Almaty", "KZ-ALM"], ["KAZ", "Astana", "KZ-AST"], ["TJK", "Dushanbe", "TJ-DU"], ["KAZ2", "Shymkent", "KZ-SHY"]];
if (!source) { console.error("Usage: node scripts/build-region-maps.mjs <ne_10m_admin_1_states_provinces.geojson>"); process.exit(1); }
const OUT = new URL("../lib/dashboard/maps/", import.meta.url);
const COUNTRIES = ["UZ", "KZ", "KG", "TJ", "TM", "AF"];
const CA = ["UZ", "KZ", "KG", "TJ", "TM"];
// "Tadzhikistan Territories" has the placeholder ISO code "TJ-X01~" and becomes TJ-RR.
// Natural Earth reuses one ISO code for two areas in a few places; adm1_code tells them apart.
const CODE_OVERRIDES = { "KAZ-4829": "KZ-ALM", "AFG-1769": "AF-PAN", "AFG-1753": "AF-DAY" };
// Cities without their own polygon in Natural Earth: drawn as a point with a callout.
// Also regions newer than Natural Earth (KZ 2022: Abay, Jetisu, Ulytau), placed at their administrative centre.
const CITY_POINTS = [
  { code: "KZ-SHY", country: "KZ", lonLat: [69.59, 42.32] }, { code: "KZ-ABA", country: "KZ", lonLat: [80.23, 50.41] },
  { code: "KZ-ZHT", country: "KZ", lonLat: [78.37, 45.02] }, { code: "KZ-ULY", country: "KZ", lonLat: [67.71, 47.8] },
  { code: "KG-GO", country: "KG", lonLat: [72.8, 40.53] }, { code: "TM-S", country: "TM", lonLat: [58.38, 37.95] },
];

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
  // ca: "small" by on-screen size, since its scale differs from the country views.
  const isSmall = (area, f) => view === "ca" ? path.area(f) < 700 : view !== "all" && area < 2e-5;
  // size: largest side in viewBox units, so the page can draw a tiny city as a min-size dot.
  const sizeOf = f => { const [[x0, y0], [x1, y1]] = path.bounds(f); return +Math.max(x1 - x0, y1 - y0).toFixed(1); };
  const regions = areas.map(({ code, d, centroid, area }, index) => ({ code, d, x: +centroid[0].toFixed(1), y: +centroid[1].toFixed(1), small: isSmall(area, collection.features[index]), ...(view === "ca" && { size: sizeOf(collection.features[index]) }) }));
  const cities = view !== "ca" || !gbDir ? [] : GB_CITIES.map(([file, name, code]) => {
    const f = JSON.parse(readFileSync(`${gbDir}/${file}.geojson`, "utf8")).features.find(item => item.properties.shapeName === name);
    // geoBoundaries rings wind the other way than d3 expects; reversed, the polygon is the city, not the rest of the globe.
    if (geoArea(f) > 2 * Math.PI) f.geometry.coordinates = f.geometry.type === "Polygon" ? f.geometry.coordinates.map(ring => ring.reverse()) : f.geometry.coordinates.map(polygon => polygon.map(ring => ring.reverse()));
    // Full-resolution source: keep about 40 points per city.
    let t = presimplify(topology({ c: f }, 1e5));
    const points = t.arcs.reduce((sum, arc) => sum + arc.length, 0);
    t = simplify(t, quantile(t, Math.min(1, 40 / points))); // p = share of points kept
    const shape = feature(t, t.objects.c), [x, y] = path.centroid(shape);
    return { code, d: round(path(shape)), x: +x.toFixed(1), y: +y.toFixed(1), small: true, size: sizeOf(shape) };
  });
  for (const city of cities) { const index = regions.findIndex(item => item.code === city.code); if (index >= 0) regions[index] = city; else regions.push(city); }
  for (const city of CITY_POINTS.filter(point => (view === point.country.toLowerCase() || view === "ca") && !cities.some(item => item.code === point.code))) {
    const [x, y] = projection(city.lonLat);
    regions.push({ code: city.code, d: "", x: +x.toFixed(1), y: +y.toFixed(1), small: true, point: true });
  }
  // Customer map: Tashkent city is part of one "Toshkent" area (UZ-TO).
  if (view === "ca") {
    const shape = merge(topo, geoms.filter(g => g.properties.code === "UZ-TO" || g.properties.code === "UZ-TK")), [x, y] = path.centroid(shape);
    regions.splice(regions.findIndex(item => item.code === "UZ-TK"), 1);
    Object.assign(regions.find(item => item.code === "UZ-TO"), { d: round(path(shape)), x: +x.toFixed(1), y: +y.toFixed(1), size: sizeOf(shape) });
  }
  // Cities are drawn over their parent region.
  regions.sort((a, b) => a.small - b.small);
  const outlines = view === "all" ? "" : round(path(merge(topo, geoms)));
  const countries = view !== "ca" ? undefined : CA.map(country => { const shape = withoutHoles(merge(topo, geoms.filter(g => g.properties.country === country))); const [x, y] = path.centroid(shape); return { code: country, d: round(path(shape)), x: +x.toFixed(1), y: +y.toFixed(1) }; });
  return { view, viewBox: `0 0 ${width} ${height}`, outline: outlines, regions, ...(countries && { countries }), credit: cities.length ? "Natural Earth, geoBoundaries" : "Natural Earth" };
}

mkdirSync(OUT, { recursive: true });
const views = { all: () => true, ...Object.fromEntries(COUNTRIES.map(country => [country.toLowerCase(), g => g.properties.country === country])), ca: g => CA.includes(g.properties.country) };
for (const [view, pick] of Object.entries(views)) {
  const json = JSON.stringify(build(view, pick, view === "ca" ? 1000 : 640));
  writeFileSync(new URL(`${view}.json`, OUT), json);
  console.log(view.padEnd(4), `${(json.length / 1024).toFixed(1)} KB`);
}
