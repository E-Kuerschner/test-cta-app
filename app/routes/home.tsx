import { Link } from "react-router";
import type { Route } from "./+types/home";
import { AppHeader, LinePill, ProblemNotice, chipClass, formatClock, useAutoRefresh, useNow } from "~/components/ui";
import { WarningIcon } from "~/components/icons";
import { WeatherIcon, WeatherIllustration } from "~/components/weather-art";
import { getDashboard, parsePlace, type LiveEnv } from "~/lib/live.server";
import { weatherPhoto } from "~/lib/unsplash.server";
import {
	arrivalLabel,
	minutesText,
	placeQuery,
	statusText,
	type Arrival,
	type Photo,
	type Stop,
	type Weather,
} from "~/lib/transit";

const FILTERS = [
	{ id: "all", label: "All" },
	{ id: "train", label: "Trains" },
	{ id: "bus", label: "Buses" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const TRACKER_SIGNUP = "https://www.transitchicago.com/developers/";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Nearby stops · Next Stop" },
		{ name: "description", content: "Live CTA train and bus arrivals near you, with weather and delays." },
	];
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const typeParam = url.searchParams.get("type");
	const filter: Filter = typeParam === "train" || typeParam === "bus" ? typeParam : "all";

	const env = context.cloudflare.env as LiveEnv & { UNSPLASH_ACCESS_KEY?: string };
	const d = await getDashboard(env, parsePlace(url), { arrivals: true });

	let photo: Photo | null = null;
	if (d.weather) {
		try {
			photo = await weatherPhoto(env.UNSPLASH_ACCESS_KEY, d.weather.illustration.kind, d.weather.illustration.isDay);
		} catch (err) {
			// The photo is decoration: leave it out rather than show an error.
			console.error("[unsplash]", err);
		}
	}

	const shown = d.stops.filter((s) => filter === "all" || s.kind === filter);
	const requested = url.searchParams.get("stop");
	const selected = shown.find((s) => s.id === requested) ?? shown[0] ?? null;
	const topAlert = d.alerts.find((a) => a.nearYou && (a.severity === "major" || a.severity === "minor")) ?? null;

	return {
		now: d.now,
		place: d.place,
		filter,
		stops: shown,
		selected,
		topAlert,
		nearbyAlertCount: d.alerts.filter((a) => a.nearYou).length,
		weather: d.weather,
		photo,
		problems: d.problems,
	};
}

function statusColor(a: Arrival) {
	if (a.status === "delayed") return "text-late";
	if (a.status === "scheduled") return "text-muted";
	return "text-ok";
}

export default function Home({ loaderData }: Route.ComponentProps) {
	const { place, filter, stops, selected, topAlert, nearbyAlertCount, weather, photo, problems } = loaderData;
	const now = useNow(loaderData.now);
	useAutoRefresh(30);
	const query = placeQuery(place);
	const hrefFor = (f: Filter, stopId?: string) => `/${placeQuery(place, { type: f === "all" ? undefined : f, stop: stopId })}`;

	return (
		<div className="min-h-screen">
			<AppHeader now={now} weather={weather} place={place} query={query} alertCount={nearbyAlertCount} />

			<div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-5 pb-10 sm:px-8">
				<ProblemNotice problems={problems} />

				{topAlert && (
					<Link
						to={`/alerts${query}`}
						className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[14px] border border-warn-border bg-warn-bg px-[18px] py-3.5 text-warn-ink no-underline"
					>
						<WarningIcon size={22} className="text-late" />
						<span className="text-[15px] font-semibold">{topAlert.title}</span>
						<span className="flex-[1_1_240px] text-sm">{topAlert.body}</span>
						<span className="text-sm font-semibold underline">
							See {nearbyAlertCount} {nearbyAlertCount === 1 ? "alert" : "alerts"} near you
						</span>
					</Link>
				)}

				<div className="flex flex-wrap items-start gap-5">
					<aside aria-label="Nearby stops" className="flex max-w-[440px] flex-[1_1_360px] flex-col gap-3">
						<div className="flex items-center justify-between gap-3">
							<h1 className="font-display text-2xl font-bold">Stops near you</h1>
							<span className="text-xs text-muted">Updated {formatClock(new Date(loaderData.now))}</span>
						</div>
						<div role="group" aria-label="Filter stops" className="flex gap-2">
							{FILTERS.map((f) => (
								<Link
									key={f.id}
									to={hrefFor(f.id)}
									preventScrollReset
									aria-current={filter === f.id ? "true" : undefined}
									className={chipClass(filter === f.id)}
								>
									{f.label}
								</Link>
							))}
						</div>
						{stops.length === 0 && (
							<p className="rounded-2xl border border-line bg-white px-4 py-6 text-sm text-body">
								No {filter === "bus" ? "bus stops" : filter === "train" ? "train stations" : "stops"} within a short walk.
							</p>
						)}
						{stops.map((stop) => (
							<StopCard key={stop.id} stop={stop} active={stop.id === selected?.id} href={hrefFor(filter, stop.id)} />
						))}
					</aside>

					<main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
						{selected && <Departures stop={selected} now={now} query={query} />}
						<WeatherPanel weather={weather} photo={photo} />
					</main>
				</div>
			</div>
		</div>
	);
}

function StopCard({ stop, active, href }: { stop: Stop; active: boolean; href: string }) {
	const peek = stop.platforms
		.flatMap((p) => p.arrivals)
		.sort((a, b) => a.minutes - b.minutes)
		.slice(0, 3);
	return (
		<Link
			to={href}
			preventScrollReset
			aria-current={active ? "true" : undefined}
			className={`flex flex-col gap-1 rounded-2xl bg-white px-4 py-3.5 text-ink no-underline ${
				active ? "border-2 border-accent shadow-[0_2px_8px_rgba(31,79,184,0.12)]" : "my-px border border-line hover:border-chip"
			}`}
		>
			<span className="flex items-baseline justify-between gap-2.5">
				<span className="font-display text-lg font-semibold">{stop.name}</span>
				<span className="shrink-0 text-xs text-muted">{stop.walkMinutes} min walk</span>
			</span>
			<span className="text-xs text-muted">
				{stop.kind === "train" ? "Train" : "Bus"} · {stop.distance} · {stop.subtitle}
			</span>
			<span className="mt-1 flex flex-wrap gap-1.5">
				{peek.length > 0
					? peek.map((a, i) => (
							<LinePill
								key={i}
								line={a.line}
								label={`${arrivalLabel(a)} ${minutesText(a)}`}
								className={a.status === "delayed" ? "outline-2 outline-offset-1 outline-late" : ""}
							/>
						))
					: stop.serves.slice(0, 6).map((s) => <LinePill key={s.label} line={s.line} label={s.label} />)}
			</span>
		</Link>
	);
}

function LiveMessage({ stop, query }: { stop: Stop; query: string }) {
	const tracker = stop.kind === "train" ? "Train Tracker" : "Bus Tracker";
	if (stop.live === "no-key")
		return (
			<p className="rounded-xl bg-ground px-4 py-3 text-sm text-body">
				Live arrival times need a CTA {tracker} API key.{" "}
				<a href={TRACKER_SIGNUP} target="_blank" rel="noreferrer">
					Get a free key from CTA
				</a>
				, then set it as <code className="text-[13px]">{stop.kind === "train" ? "CTA_TRAIN_TRACKER_KEY" : "CTA_BUS_TRACKER_KEY"}</code>.
			</p>
		);
	if (stop.live === "closed")
		return (
			<p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
				CTA isn't reporting arrivals for this station right now, so it may be closed.{" "}
				<Link to={`/alerts${query}`} className="font-semibold text-warn-ink">
					Check alerts near you
				</Link>
				.
			</p>
		);
	if (stop.live === "error")
		return <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">Couldn't reach CTA {tracker}. Trying again shortly.</p>;
	return <p className="rounded-xl bg-ground px-4 py-3 text-sm text-body">No arrivals predicted here right now.</p>;
}

function Departures({ stop, now, query }: { stop: Stop; now: Date; query: string }) {
	return (
		<section aria-labelledby="dep-title" className="flex flex-col gap-[18px] rounded-[18px] border border-line bg-white p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1.5">
					<h2 id="dep-title" className="font-display text-[34px] font-bold tracking-tight">
						{stop.name}
					</h2>
					<span className="text-sm text-muted">
						{stop.kind === "train" ? "Train station" : stop.subtitle} · {stop.distance} · {stop.walkMinutes} min walk
					</span>
					<div className="mt-1 flex flex-wrap gap-1.5">
						{stop.serves.map((s) => (
							<LinePill key={s.label} line={s.line} label={s.label} />
						))}
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{stop.access && (
						<span
							className={`flex items-center rounded-[10px] px-3 py-2 text-[13px] font-medium ${
								stop.access.ok ? "bg-ok-soft text-ok" : "bg-warn-bg text-warn-ink"
							}`}
						>
							{stop.access.text}
						</span>
					)}
					<button
						type="button"
						className="min-h-10 rounded-[10px] border border-chip bg-white px-3.5 text-sm font-semibold hover:border-ink"
					>
						Save stop
					</button>
					<button
						type="button"
						className="min-h-10 rounded-[10px] bg-accent px-3.5 text-sm font-semibold text-white hover:bg-accent-strong"
					>
						Notify me when to leave
					</button>
				</div>
			</div>

			{stop.live !== "ok" ? (
				<LiveMessage stop={stop} query={query} />
			) : (
				<div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[18px]">
					{stop.platforms.map((p) => (
						<div key={p.title} className="flex flex-col gap-2">
							<h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{p.title}</h3>
							<table className="w-full border-collapse text-sm">
								<thead>
									<tr className="text-left text-xs text-muted">
										<th scope="col" className="py-1.5 pr-2 font-medium">
											Line
										</th>
										<th scope="col" className="px-2 py-1.5 font-medium">
											To
										</th>
										<th scope="col" className="px-2 py-1.5 font-medium">
											Status
										</th>
										<th scope="col" className="py-1.5 pl-2 text-right font-medium">
											Arrives
										</th>
									</tr>
								</thead>
								<tbody>
									{p.arrivals.map((a, i) => (
										<tr key={i} className="border-t border-divider">
											<td className="py-3 pr-2">
												<LinePill line={a.line} label={arrivalLabel(a)} />
											</td>
											<td className="px-2 py-3 font-semibold">{a.destination}</td>
											<td className={`px-2 py-3 text-[13px] font-medium ${statusColor(a)}`}>{statusText(a)}</td>
											<td className="py-3 pl-2 text-right whitespace-nowrap">
												<span className="font-display text-xl font-bold">{minutesText(a)}</span>
												<span className="block text-xs text-muted">
													{formatClock(new Date(now.getTime() + a.minutes * 60_000))}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function WeatherPanel({ weather, photo }: { weather: Weather | null; photo: Photo | null }) {
	return (
		<section aria-labelledby="wx-title" className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-white px-6 py-5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="wx-title" className="text-base font-semibold">
					Weather for your trip
				</h2>
				{weather && <span className="text-[13px] text-body">{weather.advisory}</span>}
			</div>
			{!weather ? (
				<p className="text-sm text-body">Weather isn't available right now.</p>
			) : (
				<>
					{photo ? (
						<WeatherPhotoBanner weather={weather} photo={photo} />
					) : (
						<div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[14px] bg-accent-soft px-5 py-4">
							<WeatherIllustration kind={weather.illustration.kind} isDay={weather.illustration.isDay} />
							<div className="flex flex-[1_1_260px] flex-col gap-1">
								<span className="font-display text-2xl font-bold tracking-tight">{weather.headline}</span>
								<span className="text-sm leading-relaxed text-body">{weather.summary}</span>
							</div>
						</div>
					)}
					<ol className="grid grid-cols-5 gap-2.5">
						{weather.hourly.map((h, i) => (
							<li
								key={h.label}
								className={`flex flex-col items-start gap-1 rounded-xl p-3 ${i === 0 ? "bg-accent-soft" : "bg-ground"}`}
							>
								<span className="text-xs font-semibold text-muted">{h.label}</span>
								<WeatherIcon kind={h.kind} isDay={h.isDay} />
								<span className="font-display text-xl font-semibold">{h.tempF}°</span>
								<span className="text-xs text-muted">{h.note}</span>
							</li>
						))}
					</ol>
				</>
			)}
		</section>
	);
}

/** The weather headline over an Unsplash photo, credited as Unsplash requires. */
function WeatherPhotoBanner({ weather, photo }: { weather: Weather; photo: Photo }) {
	return (
		<figure className="relative m-0 flex min-h-[220px] flex-col justify-end overflow-hidden rounded-[14px]" style={{ background: photo.color }}>
			<img
				src={photo.src}
				srcSet={`${photo.srcSmall} 700w, ${photo.src} 1400w`}
				sizes="(min-width: 1000px) 860px, 100vw"
				alt={photo.alt}
				width={1400}
				height={420}
				className="absolute inset-0 size-full object-cover"
			/>
			{/* Darkens the photo behind the text so it stays readable on any image. */}
			<div
				aria-hidden="true"
				className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,12,16,0.82)_0%,rgba(10,12,16,0.55)_45%,rgba(10,12,16,0.15)_100%)]"
			/>
			<div className="relative flex flex-col gap-1 px-5 pt-10 pb-3 text-white sm:px-6">
				<span className="font-display text-[28px] leading-tight font-bold tracking-tight">{weather.headline}</span>
				<span className="max-w-[60ch] text-sm leading-relaxed text-white/90">{weather.summary}</span>
				<figcaption className="mt-3 text-[11px] text-white/80">
					Photo by{" "}
					<a href={photo.photographerUrl} target="_blank" rel="noreferrer" className="text-white/90 underline hover:text-white">
						{photo.photographer}
					</a>{" "}
					on{" "}
					<a href={photo.unsplashUrl} target="_blank" rel="noreferrer" className="text-white/90 underline hover:text-white">
						Unsplash
					</a>
				</figcaption>
			</div>
		</figure>
	);
}
