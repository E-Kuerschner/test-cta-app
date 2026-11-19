// Picks an Unsplash photo of Chicago that matches the current weather.
//
// Unsplash API guidelines this follows:
//   - Images are hotlinked from the URLs the API returns (images.unsplash.com).
//   - Every photo is credited to its photographer and Unsplash, with links
//     carrying utm_source / utm_medium=referral.
// Demo apps are limited to 50 requests an hour, so results are cached per
// search for an hour, both in memory and in Cloudflare's cache.

import type { Photo, WeatherKind } from "./transit";

const APP_NAME = "next_stop";
const CACHE_SECONDS = 3600;

const QUERIES: Record<WeatherKind, { day: string; night: string }> = {
	clear: { day: "chicago skyline sunny", night: "chicago skyline night" },
	partly: { day: "chicago skyline clouds", night: "chicago skyline night" },
	cloudy: { day: "chicago cloudy skyline", night: "chicago night cloudy" },
	fog: { day: "chicago fog", night: "chicago fog night" },
	rain: { day: "chicago rain street", night: "chicago rain night" },
	snow: { day: "chicago snow", night: "chicago snow night" },
	storm: { day: "chicago storm", night: "chicago lightning" },
};

type UnsplashResult = {
	id: string;
	alt_description: string | null;
	description: string | null;
	color: string | null;
	urls: { raw: string };
	links: { html: string };
	user: { name: string; links: { html: string } };
};

const memory = new Map<string, { at: number; results: UnsplashResult[] }>();

function withUtm(url: string): string {
	const u = new URL(url);
	u.searchParams.set("utm_source", APP_NAME);
	u.searchParams.set("utm_medium", "referral");
	return u.toString();
}

async function search(query: string, key: string): Promise<UnsplashResult[]> {
	const hit = memory.get(query);
	if (hit && Date.now() - hit.at < CACHE_SECONDS * 1000) return hit.results;

	const url =
		`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
		"&orientation=landscape&per_page=10&content_filter=high";
	const res = await fetch(url, {
		headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
		cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
	} as RequestInit);
	if (!res.ok) throw new Error(`Unsplash responded ${res.status}`);
	const data = (await res.json()) as { results: UnsplashResult[] };
	memory.set(query, { at: Date.now(), results: data.results });
	return data.results;
}

/** A photo for the given conditions, or null if there's no key or Unsplash has nothing. */
export async function weatherPhoto(key: string | undefined, kind: WeatherKind, isDay: boolean): Promise<Photo | null> {
	if (!key?.trim()) return null;
	const query = QUERIES[kind][isDay ? "day" : "night"];
	const results = await search(query, key.trim());
	if (!results.length) return null;

	// Same photo all day for the same conditions, a different one tomorrow.
	const day = Math.floor(Date.now() / 86_400_000);
	const p = results[day % results.length];
	const sep = p.urls.raw.includes("?") ? "&" : "?";
	return {
		src: `${p.urls.raw}${sep}w=1400&h=420&fit=crop&crop=entropy&auto=format&q=70`,
		srcSmall: `${p.urls.raw}${sep}w=700&h=260&fit=crop&crop=entropy&auto=format&q=70`,
		alt: p.alt_description ?? p.description ?? `Chicago, ${query.replace("chicago ", "")}`,
		color: p.color ?? "#E3E5E9",
		photographer: p.user.name,
		photographerUrl: withUtm(p.user.links.html),
		unsplashUrl: withUtm("https://unsplash.com/"),
	};
}
