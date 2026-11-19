// Refreshes the bundled 'L' station and bus stop locations from the City of
// Chicago data portal. Run with: npm run update-stops
//
// The app looks up nearby stops from these files instead of calling the data
// portal on every request.

import { writeFile, mkdir } from "node:fs/promises";

const OUT = new URL("../app/data/", import.meta.url);

async function getAll(dataset) {
	const rows = [];
	for (let offset = 0; ; offset += 50000) {
		const res = await fetch(`https://data.cityofchicago.org/resource/${dataset}.json?$limit=50000&$offset=${offset}`);
		if (!res.ok) throw new Error(`${dataset}: ${res.status}`);
		const page = await res.json();
		rows.push(...page);
		if (page.length < 50000) return rows;
	}
}

const LINE_FLAGS = [
	["red", "red"],
	["blue", "blue"],
	["brn", "brown"],
	["g", "green"],
	["o", "orange"],
	["p", "purple"],
	["pexp", "purple"],
	["pnk", "pink"],
	["y", "yellow"],
];

const round = (n) => Math.round(Number(n) * 1e5) / 1e5;

// 'L' stations: one entry per station (map_id), merging its platforms.
const stations = new Map();
for (const r of await getAll("8pix-ypme")) {
	const s = stations.get(r.map_id) ?? {
		id: r.map_id,
		name: r.station_name,
		lat: round(r.location.latitude),
		lon: round(r.location.longitude),
		lines: [],
		ada: false,
	};
	s.ada ||= r.ada === true;
	for (const [flag, line] of LINE_FLAGS) if (r[flag] === true && !s.lines.includes(line)) s.lines.push(line);
	stations.set(r.map_id, s);
}

// Bus stops, compact: [stopId, name, direction, lat, lon, "route,route"]
const busStops = (await getAll("qs84-j7wh"))
	.filter((r) => r.the_geom?.coordinates)
	.map((r) => [
		r.systemstop.replace(/\.0$/, ""),
		r.public_nam,
		r.dir,
		round(r.the_geom.coordinates[1]),
		round(r.the_geom.coordinates[0]),
		r.routesstpg ?? "",
	]);

await mkdir(OUT, { recursive: true });
await writeFile(new URL("l-stations.json", OUT), JSON.stringify([...stations.values()]));
await writeFile(new URL("bus-stops.json", OUT), JSON.stringify(busStops));
console.log(`Wrote ${stations.size} stations and ${busStops.length} bus stops to app/data/`);
