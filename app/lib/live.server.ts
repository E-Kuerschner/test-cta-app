// Live data for the Nearby and Alerts pages.
//
// Sources (all public):
//   - Nearby 'L' stations and bus stops: bundled in app/data/, from the City of
//     Chicago data portal (refresh with `npm run update-stops`)
//   - Train arrivals: CTA Train Tracker      (needs CTA_TRAIN_TRACKER_KEY)
//   - Bus arrivals:   CTA Bus Tracker v3     (needs CTA_BUS_TRACKER_KEY)
//   - Service alerts and line status: CTA Customer Alerts API (no key)
//   - Weather: Open-Meteo (no key)

import {
	CTA_LINE_CODES,
	LINES,
	type AlertSeverity,
	type Arrival,
	type LineId,
	type LineStatus,
	type LiveState,
	type Place,
	type ServiceAlert,
	type Stop,
	type StatusTone,
	type Weather,
	type WeatherKind,
} from "./transit";
import stationData from "~/data/l-stations.json";
import busStopData from "~/data/bus-stops.json";

export type LiveEnv = { CTA_TRAIN_TRACKER_KEY?: string; CTA_BUS_TRACKER_KEY?: string };

const TZ = "America/Chicago";
const DEFAULT_PLACE: Place = { lat: 41.8857, lon: -87.6309, label: "Clark St & Lake St, The Loop", isDefault: true };

const MAX_TRAIN_STATIONS = 3;
const MAX_BUS_CORNERS = 3;
const TRAIN_RADIUS_M = 1000;
const BUS_RADIUS_M = 400;
const WALK_M_PER_MIN = 80;

// ---------- helpers ----------

async function getJson<T>(url: string, cacheSeconds = 0): Promise<T> {
	const init = cacheSeconds > 0 ? ({ cf: { cacheTtl: cacheSeconds, cacheEverything: true } } as RequestInit) : undefined;
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
	return (await res.json()) as T;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
	return x == null ? [] : Array.isArray(x) ? x : [x];
}

function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const r = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
	return 2 * r * Math.asin(Math.sqrt(h));
}

function formatDistance(m: number): string {
	const mi = m / 1609.34;
	return mi < 0.1 ? "<0.1 mi" : `${mi.toFixed(1)} mi`;
}

/** "2026-11-19T12:56:53" (Chicago local, no offset) → minutes since epoch, comparable with each other. */
function localMinutes(s: string): number {
	const [d, t = "00:00"] = s.split("T");
	const [y, mo, da] = d.split("-").map(Number);
	const [h, mi, se = 0] = t.split(":").map(Number);
	return Date.UTC(y, mo - 1, da, h, mi, se) / 60000;
}

function nowLocalMinutes(): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: TZ,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(new Date())
			.map((p) => [p.type, p.value]),
	);
	return localMinutes(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
}

/** Formats a Chicago-local timestamp string without shifting it through the server's time zone. */
function formatLocal(s: string, withTime: boolean): string {
	const d = new Date(localMinutes(s) * 60000);
	const date = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
	if (!withTime || !s.includes("T")) return date;
	const time = d.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
	return `${date}, ${time}`;
}

function hourLabel(s: string): string {
	return new Date(localMinutes(s) * 60000).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric" });
}

export function parsePlace(url: URL): Place {
	const lat = Number(url.searchParams.get("lat"));
	const lon = Number(url.searchParams.get("lon"));
	// Only accept coordinates in and around Chicago; anything else falls back to the Loop.
	if (url.searchParams.has("lat") && lat > 41.6 && lat < 42.1 && lon > -88.0 && lon < -87.5) {
		return { lat, lon, label: "Your location", isDefault: false };
	}
	return DEFAULT_PLACE;
}

// ---------- nearby stops ----------

type StationRow = { id: string; name: string; lat: number; lon: number; lines: LineId[]; ada: boolean };
/** [stopId, name, direction, lat, lon, "route,route"] */
type BusStopRow = [string, string, string, number, number, string];

type Station = { id: string; name: string; meters: number; lines: LineId[]; ada: boolean };
type Corner = { id: string; name: string; meters: number; stops: { id: string; dir: string }[]; routes: string[] };

const STATIONS = stationData as StationRow[];
const BUS_STOPS = busStopData as BusStopRow[];

function nearbyStations(place: Place): Station[] {
	return STATIONS.map((s) => ({ id: s.id, name: s.name, lines: s.lines, ada: s.ada, meters: metersBetween(place.lat, place.lon, s.lat, s.lon) }))
		.filter((s) => s.meters <= TRAIN_RADIUS_M)
		.sort((a, b) => a.meters - b.meters)
		.slice(0, MAX_TRAIN_STATIONS);
}

function nearbyCorners(place: Place): Corner[] {
	const byName = new Map<string, Corner>();
	for (const [id, name, dir, lat, lon, routes] of BUS_STOPS) {
		// Cheap bounding-box check before the exact distance.
		if (Math.abs(lat - place.lat) > 0.005 || Math.abs(lon - place.lon) > 0.007) continue;
		const meters = metersBetween(place.lat, place.lon, lat, lon);
		if (meters > BUS_RADIUS_M) continue;
		const c = byName.get(name) ?? { id: `bus-${id}`, name, meters, stops: [], routes: [] };
		c.meters = Math.min(c.meters, meters);
		c.stops.push({ id, dir });
		for (const rt of routes.split(",").map((x) => x.trim()).filter(Boolean)) if (!c.routes.includes(rt)) c.routes.push(rt);
		byName.set(name, c);
	}
	return [...byName.values()].sort((a, b) => a.meters - b.meters).slice(0, MAX_BUS_CORNERS);
}

// ---------- arrivals ----------

type TrainEta = {
	staId: string;
	stpDe: string;
	rt: string;
	destNm: string;
	prdt: string;
	arrT: string;
	isApp: string;
	isSch: string;
	isDly: string;
};

async function trainArrivals(stationId: string, key: string): Promise<{ state: LiveState; groups: Map<string, Arrival[]> }> {
	const data = await getJson<{ ctatt: { errCd: string; errNm: string | null; eta?: TrainEta | TrainEta[] } }>(
		`https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${encodeURIComponent(key)}&mapid=${stationId}&max=16&outputType=JSON`,
	);
	// CTA rejects the IDs of stations that are closed (e.g. during a rebuild).
	if (/invalid mapid/i.test(data.ctatt.errNm ?? "")) return { state: "closed", groups: new Map() };
	if (data.ctatt.errCd !== "0") throw new Error(`Train Tracker: ${data.ctatt.errNm}`);
	const groups = new Map<string, Arrival[]>();
	for (const e of asArray(data.ctatt.eta)) {
		const line = CTA_LINE_CODES[e.rt] ?? "red";
		const minutes = Math.max(0, Math.round(localMinutes(e.arrT) - localMinutes(e.prdt)));
		const status = e.isDly === "1" ? "delayed" : e.isApp === "1" || minutes === 0 ? "due" : e.isSch === "1" ? "scheduled" : "live";
		const list = groups.get(e.stpDe) ?? [];
		list.push({ line, destination: e.destNm, minutes, status });
		groups.set(e.stpDe, list);
	}
	return { state: groups.size ? "ok" : "empty", groups };
}

type BusPrd = { stpid: string; rt: string; rtdir: string; des: string; prdctdn: string; dly: boolean };

async function busArrivals(stopIds: string[], key: string): Promise<Map<string, Arrival[]>> {
	const byStop = new Map<string, Arrival[]>();
	for (let i = 0; i < stopIds.length; i += 10) {
		const ids = stopIds.slice(i, i + 10).join(",");
		const data = await getJson<{ "bustime-response": { prd?: BusPrd[]; error?: { msg: string; stpid?: string }[] } }>(
			`https://www.ctabustracker.com/bustime/api/v3/getpredictions?key=${encodeURIComponent(key)}&stpid=${ids}&format=json`,
		);
		const resp = data["bustime-response"];
		const fatal = asArray(resp.error).find((e) => !e.stpid);
		if (fatal && !resp.prd) throw new Error(`Bus Tracker: ${fatal.msg}`);
		for (const p of asArray(resp.prd)) {
			const due = p.prdctdn === "DUE";
			const delayed = p.prdctdn === "DLY" || p.dly;
			const minutes = due || p.prdctdn === "DLY" ? 0 : Number(p.prdctdn) || 0;
			const list = byStop.get(p.stpid) ?? [];
			list.push({ line: "bus", route: p.rt, destination: p.des, minutes, status: delayed ? "delayed" : due ? "due" : "live" });
			byStop.set(p.stpid, list);
		}
	}
	return byStop;
}

const DIR_NAMES: Record<string, string> = { NB: "Northbound", SB: "Southbound", EB: "Eastbound", WB: "Westbound" };

// ---------- alerts and line status ----------

type RawService = { ServiceType: string; ServiceId: string; ServiceName?: string };
type RawAlert = {
	AlertId: string;
	Headline: string;
	ShortDescription: string;
	SeverityCSS: string;
	SeverityScore: string;
	MajorAlert: string;
	Impact: string;
	EventStart: string;
	EventEnd: string | null;
	AlertURL?: { "#cdata-section"?: string };
	ImpactedService: { Service: RawService | RawService[] };
};

type Nearby = { lines: Set<LineId>; routes: Set<string>; stations: Set<string> };

function severityOf(a: RawAlert): AlertSeverity {
	if (a.MajorAlert === "1" || a.SeverityCSS === "major") return "major";
	if (a.SeverityCSS === "minor") return "minor";
	if (a.SeverityCSS === "planned") return "planned";
	return "notice";
}

function whenText(a: RawAlert): string {
	const now = nowLocalMinutes();
	if (localMinutes(a.EventStart) > now) return `Starts ${formatLocal(a.EventStart, true)}`;
	if (a.EventEnd) return `Until ${formatLocal(a.EventEnd, a.EventEnd.includes("T"))}`;
	const ageDays = (now - localMinutes(a.EventStart)) / 1440;
	return `Since ${formatLocal(a.EventStart, ageDays < 1)}`;
}

async function rawAlerts(): Promise<RawAlert[]> {
	const data = await getJson<{ CTAAlerts: { Alert?: RawAlert | RawAlert[] } }>(
		"https://www.transitchicago.com/api/1.0/alerts.aspx?activeonly=true&outputType=JSON",
		60,
	);
	return asArray(data.CTAAlerts.Alert);
}

function toAlerts(raw: RawAlert[], near: Nearby): ServiceAlert[] {
	const order: Record<AlertSeverity, number> = { major: 0, minor: 1, planned: 2, notice: 3 };
	return raw
		.map((a) => {
			const services = asArray(a.ImpactedService?.Service);
			const affects: ServiceAlert["affects"] = [];
			let nearYou = false;
			for (const s of services) {
				if (s.ServiceType === "R") {
					const line = CTA_LINE_CODES[s.ServiceId];
					if (!line) continue;
					if (near.lines.has(line)) nearYou = true;
					if (!affects.some((x) => x.line === line)) affects.push({ line, label: `${LINES[line].name} Line` });
				} else if (s.ServiceType === "B") {
					if (near.routes.has(s.ServiceId)) nearYou = true;
					affects.push({ line: "bus", label: `#${s.ServiceId}` });
				} else if (s.ServiceType === "T" && near.stations.has(s.ServiceId)) {
					nearYou = true;
				}
			}
			const alert: ServiceAlert = {
				id: a.AlertId,
				severity: severityOf(a),
				affects: affects.slice(0, 4),
				title: a.Headline,
				body: a.ShortDescription,
				when: whenText(a),
				nearYou,
				url: a.AlertURL?.["#cdata-section"]?.replace(/^http:/, "https:") ?? null,
			};
			return { alert, score: Number(a.SeverityScore) || 0 };
		})
		.sort(
			(x, y) =>
				Number(y.alert.nearYou) - Number(x.alert.nearYou) ||
				order[x.alert.severity] - order[y.alert.severity] ||
				y.score - x.score,
		)
		.map((x) => x.alert);
}

function toneOf(status: string): StatusTone {
	const s = status.toLowerCase();
	if (s.includes("normal")) return "good";
	if (s.includes("delay") || s.includes("suspend")) return "delay";
	return "planned";
}

async function railStatus(): Promise<LineStatus[]> {
	const data = await getJson<{ CTARoutes: { RouteInfo: { Route: string; ServiceId: string; RouteStatus: string }[] } }>(
		"https://www.transitchicago.com/api/1.0/routes.aspx?type=rail&outputType=JSON",
		60,
	);
	const out: LineStatus[] = [];
	for (const r of asArray(data.CTARoutes.RouteInfo)) {
		const line = CTA_LINE_CODES[r.ServiceId];
		if (!line || out.some((x) => x.line === line)) continue;
		out.push({ line, label: r.Route, status: r.RouteStatus, tone: toneOf(r.RouteStatus) });
	}
	return out;
}

function busStatus(routes: string[], alerts: ServiceAlert[]): LineStatus[] {
	return routes.map((rt) => {
		const hits = alerts.filter((a) => a.affects.some((x) => x.line === "bus" && x.label === `#${rt}`));
		const worst = hits.find((a) => a.severity === "major" || a.severity === "minor") ?? hits.find((a) => a.severity === "planned");
		if (worst?.severity === "major" || worst?.severity === "minor") return { line: "bus", label: `#${rt}`, status: "Delays", tone: "delay" };
		if (worst) return { line: "bus", label: `#${rt}`, status: "Reroute or stop change", tone: "planned" };
		return { line: "bus", label: `#${rt}`, status: "Normal service", tone: "good" };
	});
}

// ---------- weather ----------

const KIND_LABEL: Record<WeatherKind, string> = {
	clear: "Clear",
	partly: "Partly cloudy",
	cloudy: "Cloudy",
	fog: "Fog",
	rain: "Rain",
	snow: "Snow",
	storm: "Thunderstorms",
};

function kindOf(code: number): WeatherKind {
	if (code === 0) return "clear";
	if (code <= 2) return "partly";
	if (code === 3) return "cloudy";
	if (code === 45 || code === 48) return "fog";
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
	if (code >= 95) return "storm";
	if (code >= 51 && code <= 82) return "rain";
	return "cloudy";
}

const WET: WeatherKind[] = ["rain", "snow", "storm"];

function compass(deg: number): string {
	return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

type MeteoResponse = {
	current: {
		time: string;
		temperature_2m: number;
		apparent_temperature: number;
		weather_code: number;
		wind_speed_10m: number;
		wind_direction_10m: number;
		is_day: number;
	};
	hourly: {
		time: string[];
		temperature_2m: number[];
		weather_code: number[];
		precipitation_probability: number[];
		is_day: number[];
	};
};

async function weatherAt(place: Place): Promise<Weather> {
	const lat = place.lat.toFixed(2);
	const lon = place.lon.toFixed(2);
	const d = await getJson<MeteoResponse>(
		`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
			"&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
			"&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
			"&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_hours=8",
		300,
	);
	const c = d.current;
	const kind = kindOf(c.weather_code);
	const isDay = c.is_day === 1;
	const now = {
		label: "Now",
		tempF: Math.round(c.temperature_2m),
		kind,
		isDay,
		note: KIND_LABEL[kind],
		prob: WET.includes(kind) ? 100 : 0,
	};
	const later = d.hourly.time
		.map((t, i) => {
			const k = kindOf(d.hourly.weather_code[i]);
			const prob = d.hourly.precipitation_probability[i] ?? 0;
			return {
				label: hourLabel(t),
				tempF: Math.round(d.hourly.temperature_2m[i]),
				kind: k,
				isDay: d.hourly.is_day[i] === 1,
				note: WET.includes(k) ? `${KIND_LABEL[k]} ${prob}%` : KIND_LABEL[k],
				prob,
				time: t,
			};
		})
		.filter((h) => localMinutes(h.time) > localMinutes(c.time))
		.slice(0, 4);
	const hours = [now, ...later];

	const wet = hours.find((h) => WET.includes(h.kind) && (h === now || h.prob >= 40));
	const last = hours[hours.length - 1];
	const diff = last.tempF - now.tempF;
	const trend = Math.abs(diff) < 2 ? "holding near" : diff < 0 ? "falling to" : "rising to";

	let headline: string;
	if (wet === now) headline = `${KIND_LABEL[kind]} right now`;
	else if (wet) headline = `${KIND_LABEL[wet.kind]} likely around ${wet.label}`;
	else
		headline = {
			clear: isDay ? "Clear skies for your trip" : "Clear night for your trip",
			partly: "Partly cloudy and dry",
			cloudy: "Cloudy but dry",
			fog: "Foggy, so watch your step",
			rain: "",
			snow: "",
			storm: "",
		}[kind];

	let summary = `${now.tempF}° and ${KIND_LABEL[kind].toLowerCase()} now, ${trend} ${last.tempF}° by ${last.label}.`;
	const tipKind = wet?.kind;
	if (tipKind === "snow") summary += " Platforms and stairs may be slick, so allow extra time.";
	else if (tipKind === "rain") summary += " Bring an umbrella and allow a little extra time.";
	else if (tipKind === "storm") summary += " Storms can slow service, so allow extra time.";

	return {
		tempF: now.tempF,
		feelsLikeF: Math.round(c.apparent_temperature),
		kind,
		isDay,
		condition: KIND_LABEL[kind],
		headline,
		summary,
		advisory: `Feels like ${Math.round(c.apparent_temperature)}°. Wind ${compass(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} mph.`,
		illustration: wet ? { kind: wet.kind, isDay: wet.isDay } : { kind, isDay },
		hourly: hours.map(({ label, tempF, kind, isDay, note }) => ({ label, tempF, kind, isDay, note })),
	};
}

// ---------- the page data ----------

export type Dashboard = {
	now: string;
	place: Place;
	stops: Stop[];
	alerts: ServiceAlert[];
	lineStatus: LineStatus[];
	busStatus: LineStatus[];
	weather: Weather | null;
	/** Plain-language notes about data that couldn't be loaded. */
	problems: string[];
	keys: { train: boolean; bus: boolean };
};

async function settle<T>(p: Promise<T>, problems: string[], what: string): Promise<T | null> {
	try {
		return await p;
	} catch (err) {
		console.error(`[live] ${what}:`, err);
		problems.push(what);
		return null;
	}
}

export async function getDashboard(env: LiveEnv, place: Place, opts: { arrivals: boolean }): Promise<Dashboard> {
	const problems: string[] = [];
	const trainKey = env.CTA_TRAIN_TRACKER_KEY?.trim();
	const busKey = env.CTA_BUS_TRACKER_KEY?.trim();

	const stations = nearbyStations(place);
	const corners = nearbyCorners(place);
	const [raw, rail, weather] = await Promise.all([
		settle(rawAlerts(), problems, "service alerts"),
		settle(railStatus(), problems, "line status"),
		settle(weatherAt(place), problems, "weather"),
	]);

	const near: Nearby = {
		lines: new Set((stations ?? []).flatMap((s) => s.lines)),
		routes: new Set((corners ?? []).flatMap((c) => c.routes)),
		stations: new Set((stations ?? []).map((s) => s.id)),
	};
	const alerts = toAlerts(raw ?? [], near);

	// Elevator outages reported for a nearby station.
	const elevatorOut = new Set(
		(raw ?? [])
			.filter((a) => /elevator/i.test(a.Impact) || /elevator/i.test(a.Headline))
			.flatMap((a) => asArray(a.ImpactedService?.Service))
			.filter((s) => s.ServiceType === "T")
			.map((s) => s.ServiceId),
	);

	const trainStops: Promise<Stop>[] = (stations ?? []).map(async (s): Promise<Stop> => {
		let live: LiveState = trainKey ? "empty" : "no-key";
		let platforms: Stop["platforms"] = [];
		if (opts.arrivals && trainKey) {
			try {
				const r = await trainArrivals(s.id, trainKey);
				live = r.state;
				platforms = [...r.groups].map(([title, arrivals]) => ({
					title,
					arrivals: arrivals.sort((a, b) => a.minutes - b.minutes),
				}));
			} catch (err) {
				console.error("[live] train arrivals:", err);
				live = "error";
			}
		}
		const lineNames = s.lines.map((l) => LINES[l].name);
		return {
			id: s.id,
			kind: "train",
			name: s.name,
			subtitle: `${lineNames.join(", ")} ${lineNames.length === 1 ? "Line" : "lines"}`,
			distance: formatDistance(s.meters),
			walkMinutes: Math.max(1, Math.round(s.meters / WALK_M_PER_MIN)),
			serves: s.lines.map((l) => ({ line: l, label: LINES[l].name })),
			access: elevatorOut.has(s.id)
				? { text: "Elevator out of service", ok: false }
				: s.ada
					? { text: "Accessible station", ok: true }
					: { text: "Not step-free", ok: false },
			platforms,
			live,
		};
	});

	let busByStop: Map<string, Arrival[]> | null = null;
	let busLive: LiveState = busKey ? "empty" : "no-key";
	if (opts.arrivals && busKey && corners?.length) {
		try {
			busByStop = await busArrivals(
				corners.flatMap((c) => c.stops.map((s) => s.id)),
				busKey,
			);
		} catch (err) {
			console.error("[live] bus arrivals:", err);
			busLive = "error";
		}
	}

	const busStops: Stop[] = (corners ?? []).map((c) => {
		const platforms = busByStop
			? c.stops
					.map((s) => ({
						title: DIR_NAMES[s.dir] ?? s.dir,
						arrivals: (busByStop!.get(s.id) ?? []).sort((a, b) => a.minutes - b.minutes),
					}))
					.filter((p) => p.arrivals.length)
			: [];
		return {
			id: c.id,
			kind: "bus",
			name: c.name,
			subtitle: `Bus stop · ${c.stops.map((s) => s.dir).join(", ")}`,
			distance: formatDistance(c.meters),
			walkMinutes: Math.max(1, Math.round(c.meters / WALK_M_PER_MIN)),
			serves: c.routes.map((r) => ({ line: "bus" as const, label: r })),
			access: null,
			platforms,
			live: busByStop ? (platforms.length ? "ok" : "empty") : busLive,
		};
	});

	const stops = [...(await Promise.all(trainStops)), ...busStops];
	const meters = new Map([...(stations ?? []), ...(corners ?? [])].map((s) => [s.id, s.meters]));
	stops.sort((a, b) => (meters.get(a.id) ?? 0) - (meters.get(b.id) ?? 0));

	const nearest = stops[0];
	const shownPlace: Place = place.isDefault || !nearest ? place : { ...place, label: `Near ${nearest.name}` };

	return {
		now: new Date().toISOString(),
		place: shownPlace,
		stops,
		alerts,
		lineStatus: rail ?? [],
		busStatus: busStatus([...near.routes].slice(0, 8), alerts),
		weather,
		problems,
		keys: { train: !!trainKey, bus: !!busKey },
	};
}
