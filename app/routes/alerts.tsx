import { Link } from "react-router";
import type { Route } from "./+types/alerts";
import { AppHeader, LinePill, ProblemNotice, chipClass, useAutoRefresh, useNow } from "~/components/ui";
import { getDashboard, parsePlace, type LiveEnv } from "~/lib/live.server";
import { LINES, placeQuery, type AlertSeverity, type LineStatus, type ServiceAlert } from "~/lib/transit";

const SEVERITY: Record<AlertSeverity, { label: string; bg: string; fg: string }> = {
	major: { label: "Major delay", bg: "#FDE7E2", fg: "#A1260D" },
	minor: { label: "Minor delay", bg: "#FFF3E3", fg: "#8A4100" },
	planned: { label: "Planned work", bg: "#E8EEFB", fg: "#1F4FB8" },
	notice: { label: "Notice", bg: "#EEF0F2", fg: "#33404F" },
};

const TONE: Record<LineStatus["tone"], string> = {
	good: "text-ok",
	delay: "text-late",
	planned: "text-accent",
};

export function meta({}: Route.MetaArgs) {
	return [{ title: "Service alerts · Next Stop" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
	const d = await getDashboard(context.cloudflare.env as LiveEnv, parsePlace(url), { arrivals: false });
	return {
		now: d.now,
		place: d.place,
		scope,
		alerts: d.alerts.filter((a) => scope === "all" || a.nearYou),
		nearbyAlertCount: d.alerts.filter((a) => a.nearYou).length,
		lineStatus: d.lineStatus,
		busStatus: d.busStatus,
		weather: d.weather,
		problems: d.problems,
	} as const;
}

export default function Alerts({ loaderData }: Route.ComponentProps) {
	const { place, scope, alerts, nearbyAlertCount, lineStatus, busStatus, weather, problems } = loaderData;
	const now = useNow(loaderData.now);
	useAutoRefresh(60);
	const query = placeQuery(place);

	return (
		<div className="min-h-screen">
			<AppHeader now={now} weather={weather} place={place} query={query} alertCount={nearbyAlertCount} showLocation={false} />

			<div className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-6 px-4 pt-6 pb-10 sm:px-8">
				<main className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5">
					<ProblemNotice problems={problems} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-col gap-1">
							<h1 className="font-display text-3xl font-bold tracking-tight">Service alerts</h1>
							<span className="text-[13px] text-muted">
								{scope === "mine" ? `For lines and stops near ${place.isDefault ? place.label : "you"}` : "Every active CTA alert"}
							</span>
						</div>
						<div role="group" aria-label="Filter alerts" className="flex gap-2">
							<Link to={`/alerts${query}`} aria-current={scope === "mine" ? "true" : undefined} className={chipClass(scope === "mine")}>
								Near me
							</Link>
							<Link
								to={`/alerts${placeQuery(place, { scope: "all" })}`}
								aria-current={scope === "all" ? "true" : undefined}
								className={chipClass(scope === "all")}
							>
								All lines
							</Link>
						</div>
					</div>

					{alerts.length === 0 && (
						<p className="rounded-2xl border border-line bg-white px-5 py-6 text-[15px] text-body">
							{scope === "mine" ? "No alerts for the lines and stops near you. " : "No active alerts. "}
							{scope === "mine" && <Link to={`/alerts${placeQuery(place, { scope: "all" })}`}>See all lines</Link>}
						</p>
					)}
					{alerts.map((a) => (
						<AlertCard key={a.id} alert={a} />
					))}
				</main>

				<aside
					aria-labelledby="status-title"
					className="flex max-w-[400px] flex-[1_1_320px] flex-col gap-1.5 rounded-[18px] border border-line bg-white p-5"
				>
					<h2 id="status-title" className="mb-1.5 text-base font-semibold">
						Line status
					</h2>
					<ul>
						{lineStatus.map((l) => (
							<li key={l.line} className="flex items-center justify-between gap-3 border-t border-divider py-[11px]">
								<span className="flex items-center gap-2.5 text-sm font-semibold">
									<span aria-hidden="true" className="size-3.5 rounded-full" style={{ background: LINES[l.line].bg }} />
									{l.label}
								</span>
								<span className={`text-right text-[13px] font-semibold ${TONE[l.tone]}`}>{l.status}</span>
							</li>
						))}
					</ul>
					{busStatus.length > 0 && (
						<>
							<h3 className="mt-3 mb-1 text-xs font-semibold tracking-wider text-muted uppercase">Buses near you</h3>
							<ul>
								{busStatus.map((b) => (
									<li key={b.label} className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
										<LinePill line="bus" label={b.label} />
										<span className={`text-right text-[13px] font-semibold ${TONE[b.tone]}`}>{b.status}</span>
									</li>
								))}
							</ul>
						</>
					)}
				</aside>
			</div>
		</div>
	);
}

function AlertCard({ alert }: { alert: ServiceAlert }) {
	const sev = SEVERITY[alert.severity];
	return (
		<article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 rounded-2xl border border-line bg-white px-5 py-[18px]">
			<div className="flex flex-wrap items-center gap-2">
				<span className="inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-bold" style={{ background: sev.bg, color: sev.fg }}>
					{sev.label}
				</span>
				{alert.affects.map((x) => (
					<LinePill key={x.label} line={x.line} label={x.label} />
				))}
				{alert.nearYou && <span className="text-xs font-semibold text-accent">Near you</span>}
			</div>
			<span className="text-right text-[13px] text-muted">{alert.when}</span>
			<div className="col-span-full flex flex-col gap-1.5">
				<h2 className="text-lg leading-snug font-semibold">{alert.title}</h2>
				<p className="max-w-[72ch] text-[15px] leading-relaxed text-body">{alert.body}</p>
				{alert.url && (
					<a href={alert.url} target="_blank" rel="noreferrer" className="text-sm font-semibold">
						Details on transitchicago.com
					</a>
				)}
			</div>
		</article>
	);
}
