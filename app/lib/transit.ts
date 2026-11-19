// Shared types and display helpers for transit and weather data.
// The live data itself is fetched in `live.server.ts`.

export type LineId = "red" | "blue" | "brown" | "green" | "orange" | "purple" | "pink" | "yellow" | "bus";

export const LINES: Record<LineId, { name: string; short: string; bg: string; fg: string }> = {
	red: { name: "Red", short: "Red", bg: "#C60C30", fg: "#FFFFFF" },
	blue: { name: "Blue", short: "Blue", bg: "#00A1DE", fg: "#0B1A22" },
	brown: { name: "Brown", short: "Brn", bg: "#62361B", fg: "#FFFFFF" },
	green: { name: "Green", short: "Grn", bg: "#009B3A", fg: "#08160D" },
	orange: { name: "Orange", short: "Org", bg: "#F9461C", fg: "#1E0A04" },
	purple: { name: "Purple", short: "Prp", bg: "#522398", fg: "#FFFFFF" },
	pink: { name: "Pink", short: "Pink", bg: "#E27EA6", fg: "#1E0C14" },
	yellow: { name: "Yellow", short: "Yel", bg: "#F9E300", fg: "#1E1B00" },
	bus: { name: "Bus", short: "Bus", bg: "#2F353C", fg: "#FFFFFF" },
};

/** CTA's own codes for rail lines (Train Tracker `rt`, alerts and routes `ServiceId`). */
export const CTA_LINE_CODES: Record<string, LineId> = {
	Red: "red",
	Blue: "blue",
	Brn: "brown",
	G: "green",
	Org: "orange",
	P: "purple",
	Pexp: "purple",
	Pink: "pink",
	Y: "yellow",
};

export type ArrivalStatus = "live" | "due" | "delayed" | "scheduled";

export type Arrival = {
	line: LineId;
	/** Route number for buses, e.g. "22". */
	route?: string;
	destination: string;
	/** Minutes from the time the prediction was made. */
	minutes: number;
	status: ArrivalStatus;
};

export type Platform = { title: string; arrivals: Arrival[] };

/**
 * ok: live arrivals loaded · empty: no arrivals predicted right now ·
 * no-key: the tracker key isn't configured · error: the tracker didn't answer ·
 * closed: CTA doesn't report arrivals for this station (usually closed).
 */
export type LiveState = "ok" | "empty" | "no-key" | "error" | "closed";

export type Stop = {
	id: string;
	kind: "train" | "bus";
	name: string;
	subtitle: string;
	distance: string;
	walkMinutes: number;
	serves: { line: LineId; label: string }[];
	access: { text: string; ok: boolean } | null;
	platforms: Platform[];
	live: LiveState;
};

export type AlertSeverity = "major" | "minor" | "planned" | "notice";

export type ServiceAlert = {
	id: string;
	severity: AlertSeverity;
	affects: { line: LineId; label: string }[];
	title: string;
	body: string;
	when: string;
	nearYou: boolean;
	url: string | null;
};

export type StatusTone = "good" | "delay" | "planned";

export type LineStatus = { line: LineId; label: string; status: string; tone: StatusTone };

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

export type HourForecast = {
	label: string;
	tempF: number;
	kind: WeatherKind;
	isDay: boolean;
	note: string;
};

export type Weather = {
	tempF: number;
	feelsLikeF: number;
	kind: WeatherKind;
	isDay: boolean;
	condition: string;
	headline: string;
	summary: string;
	advisory: string;
	/** What the illustration should show: upcoming rain/snow if any, else current conditions. */
	illustration: { kind: WeatherKind; isDay: boolean };
	hourly: HourForecast[];
};

export type Place = { lat: number; lon: number; label: string; isDefault: boolean };

/** An Unsplash photo plus the credit Unsplash requires. */
export type Photo = {
	src: string;
	srcSmall: string;
	alt: string;
	/** Average color, shown while the image loads. */
	color: string;
	photographer: string;
	photographerUrl: string;
	unsplashUrl: string;
};

export function arrivalLabel(a: Arrival): string {
	return a.route ?? LINES[a.line].short;
}

export function statusText(a: Arrival): string {
	switch (a.status) {
		case "due":
			return "Approaching";
		case "delayed":
			return "Delayed";
		case "scheduled":
			return "Scheduled";
		default:
			return "Live";
	}
}

export function minutesText(a: Pick<Arrival, "minutes" | "status">): string {
	if (a.status === "delayed" && a.minutes <= 0) return "Delayed";
	return a.minutes <= 0 || a.status === "due" ? "Due" : `${a.minutes} min`;
}

/** Query string that keeps the chosen location when moving between pages. */
export function placeQuery(place: Place, extra: Record<string, string | undefined> = {}): string {
	const p = new URLSearchParams();
	if (!place.isDefault) {
		p.set("lat", place.lat.toFixed(4));
		p.set("lon", place.lon.toFixed(4));
	}
	for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
	const qs = p.toString();
	return qs ? `?${qs}` : "";
}
