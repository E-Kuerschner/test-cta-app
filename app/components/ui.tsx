import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useRevalidator } from "react-router";
import { LINES, type LineId, type Place, type Weather } from "~/lib/transit";
import { LocateIcon, PinIcon } from "./icons";
import { WeatherIcon } from "./weather-art";

const TIME_ZONE = "America/Chicago";

export function formatClock(date: Date): string {
	return date.toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

export function formatDay(date: Date): string {
	return date.toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
}

/** Current time, starting from the server's timestamp so SSR and hydration agree, then ticking every 15 s. */
export function useNow(initialIso: string): Date {
	const [now, setNow] = useState(() => new Date(initialIso));
	useEffect(() => {
		setNow(new Date());
		const id = setInterval(() => setNow(new Date()), 15_000);
		return () => clearInterval(id);
	}, [initialIso]);
	return now;
}

/** Reloads the page's data every `seconds` while the tab is visible. */
export function useAutoRefresh(seconds: number) {
	const { revalidate, state } = useRevalidator();
	useEffect(() => {
		const id = setInterval(() => {
			if (document.visibilityState === "visible" && state === "idle") revalidate();
		}, seconds * 1000);
		return () => clearInterval(id);
	}, [seconds, revalidate, state]);
}

export function LinePill({ line, label, className = "" }: { line: LineId; label: string; className?: string }) {
	const c = LINES[line];
	return (
		<span
			className={`inline-flex h-[26px] min-w-11 items-center justify-center rounded-lg px-2 text-xs font-bold whitespace-nowrap ${className}`}
			style={{ background: c.bg, color: c.fg }}
		>
			{label}
		</span>
	);
}

export function chipClass(active: boolean): string {
	return `inline-flex min-h-9 items-center rounded-full border px-4 text-[13px] font-semibold no-underline ${
		active ? "border-ink bg-ink text-white" : "border-chip bg-white text-ink hover:border-ink"
	}`;
}

const navBase = "flex min-h-10 items-center gap-2 rounded-[10px] px-3.5 text-sm no-underline";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
	return (
		<NavLink
			to={to}
			end
			className={({ isActive }) =>
				`${navBase} ${isActive ? "bg-accent-soft font-semibold text-accent" : "font-medium text-body hover:bg-ground"}`
			}
		>
			{children}
		</NavLink>
	);
}

/** Asks the browser for the visitor's position and reloads the page for it. */
function LocateButton() {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const [state, setState] = useState<"idle" | "busy" | "denied" | "far">("idle");

	function locate() {
		if (!("geolocation" in navigator)) return setState("denied");
		setState("busy");
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const { latitude: lat, longitude: lon } = pos.coords;
				if (lat < 41.6 || lat > 42.1 || lon < -88 || lon > -87.5) return setState("far");
				setState("idle");
				navigate(`${pathname}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
			},
			() => setState("denied"),
			{ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
		);
	}

	return (
		<>
			<button
				type="button"
				onClick={locate}
				aria-label="Use my current location"
				aria-busy={state === "busy"}
				className="flex size-[42px] shrink-0 items-center justify-center rounded-xl border border-chip bg-white hover:border-ink disabled:opacity-60"
				disabled={state === "busy"}
			>
				<LocateIcon size={18} className={state === "busy" ? "animate-pulse" : ""} />
			</button>
			<span role="status" className="text-xs text-late">
				{state === "denied" && "Location is off. Allow it in your browser to see stops near you."}
				{state === "far" && "You're outside Chicago, so this shows the Loop."}
			</span>
		</>
	);
}

export function AppHeader({
	now,
	weather,
	place,
	query,
	alertCount,
	showLocation = true,
}: {
	now: Date;
	weather: Weather | null;
	place: Place;
	query: string;
	alertCount: number;
	showLocation?: boolean;
}) {
	return (
		<header className="border-b border-line bg-white">
			<div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-7 gap-y-4 px-4 py-3.5 sm:px-8">
				<span className="font-display text-[22px] font-bold tracking-tight">Next Stop</span>
				<nav aria-label="Main" className={`flex flex-wrap gap-1 ${showLocation ? "" : "flex-1"}`}>
					<NavItem to={`/${query}`}>Nearby</NavItem>
					<NavItem to={`/alerts${query}`}>
						Alerts
						{alertCount > 0 && (
							<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-late px-1 text-[11px] font-bold text-white">
								<span className="sr-only">, </span>
								{alertCount}
								<span className="sr-only"> near you</span>
							</span>
						)}
					</NavItem>
					<span aria-disabled="true" title="Coming soon" className={`${navBase} cursor-default font-medium text-muted`}>
						Map
					</span>
					<span aria-disabled="true" title="Coming soon" className={`${navBase} cursor-default font-medium text-muted`}>
						Saved
					</span>
				</nav>
				{showLocation && (
					<div className="flex min-w-0 flex-[1_1_280px] flex-wrap items-center gap-2">
						<div className="flex h-[42px] max-w-[420px] min-w-0 flex-[1_1_200px] items-center gap-2 rounded-xl border border-chip bg-white px-3">
							<PinIcon size={18} className="shrink-0 text-accent" />
							<span className="sr-only">Showing stops for </span>
							<span className="truncate text-sm">{place.label}</span>
						</div>
						<LocateButton />
					</div>
				)}
				<div className="flex items-center gap-[18px]">
					<div className="flex flex-col items-end">
						<time dateTime={now.toISOString()} className="font-display text-xl font-semibold">
							{formatClock(now)}
						</time>
						<span className="text-xs text-muted">{formatDay(now)}</span>
					</div>
					{weather && (
						<div className="flex items-center gap-2 border-l border-line pl-[18px]">
							<WeatherIcon kind={weather.kind} isDay={weather.isDay} size={26} />
							<div className="flex flex-col">
								<span className="font-display text-xl font-semibold">{weather.tempF}°F</span>
								<span className="text-xs text-muted">
									{weather.condition} · feels {weather.feelsLikeF}°
								</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}

/** Small notice listing data sources that didn't load. */
export function ProblemNotice({ problems }: { problems: string[] }) {
	if (!problems.length) return null;
	return (
		<p role="status" className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-body">
			Couldn't load {problems.join(", ")} right now. Showing what's available; it will retry shortly.
		</p>
	);
}
