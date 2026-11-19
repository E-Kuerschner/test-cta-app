import type { WeatherKind } from "~/lib/transit";

const LABEL: Record<WeatherKind, string> = {
	clear: "Clear",
	partly: "Partly cloudy",
	cloudy: "Cloudy",
	fog: "Fog",
	rain: "Rain",
	snow: "Snow",
	storm: "Thunderstorms",
};

const SUN = "#B54708";
const INK = "#33404F";
const WATER = "#1F4FB8";

/** Small 24px condition icon (hourly forecast, header). Decorative: the condition is always written next to it. */
export function WeatherIcon({ kind, isDay, size = 24 }: { kind: WeatherKind; isDay: boolean; size?: number }) {
	const cloud = "M7 16h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 16z";
	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{kind === "clear" &&
				(isDay ? (
					<g stroke={SUN}>
						<circle cx="12" cy="12" r="4" />
						<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
					</g>
				) : (
					<path stroke={INK} d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" />
				))}
			{kind === "partly" && (
				<>
					{isDay ? (
						<g stroke={SUN}>
							<circle cx="8" cy="8" r="3" />
							<path d="M8 2.5v1M2.5 8h1M4.1 4.1l.7.7M11.9 4.1l-.7.7" />
						</g>
					) : (
						<path stroke={INK} d="M11 9.5A4.5 4.5 0 1 1 6 3.6a3.5 3.5 0 0 0 5 5.9z" />
					)}
					<path stroke={INK} d="M9 19h8a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.4 1.4A2.8 2.8 0 0 0 9 19z" />
				</>
			)}
			{kind === "cloudy" && <path stroke={INK} d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18z" />}
			{kind === "fog" && (
				<>
					<path stroke={INK} d={cloud} />
					<path stroke={INK} d="M5 19.5h14M7 22h10" />
				</>
			)}
			{kind === "rain" && (
				<>
					<path stroke={INK} d={cloud} />
					<path stroke={WATER} d="M9 18.5l-1 2.5M13 18.5l-1 2.5M17 18.5l-1 2.5" />
				</>
			)}
			{kind === "snow" && (
				<>
					<path stroke={INK} d={cloud} />
					<path stroke={WATER} d="M9 19.5v.01M12 21v.01M15 19.5v.01" strokeWidth={2.4} />
				</>
			)}
			{kind === "storm" && (
				<>
					<path stroke={INK} d={cloud} />
					<path stroke={SUN} d="M12.5 16.5 10.5 20h3l-2 3" />
				</>
			)}
		</svg>
	);
}

/** Larger illustration of the overall weather, shown above the hourly forecast. */
export function WeatherIllustration({ kind, isDay }: { kind: WeatherKind; isDay: boolean }) {
	const bigCloud = "M48 66h70a20 20 0 0 0 2.5-39.8A30 30 0 0 0 64 35a17 17 0 0 0-16 31z";
	const sunOrMoon = (cx: number, cy: number, r: number) =>
		isDay ? (
			<g stroke={SUN} strokeWidth="2.5">
				<circle cx={cx} cy={cy} r={r} />
				<path
					d={`M${cx} ${cy - r - 8}v4M${cx} ${cy + r + 4}v4M${cx - r - 8} ${cy}h4M${cx + r + 4} ${cy}h4M${cx - r - 4} ${cy - r - 4}l2.8 2.8M${cx + r + 4} ${cy - r - 4}l-2.8 2.8M${cx - r - 4} ${cy + r + 4}l2.8-2.8M${cx + r + 4} ${cy + r + 4}l-2.8-2.8`}
				/>
			</g>
		) : (
			<path
				stroke={INK}
				strokeWidth="2.5"
				d={`M${cx + r} ${cy + r * 0.3}A${r} ${r} 0 1 1 ${cx - r * 0.3} ${cy - r}a${r * 0.8} ${r * 0.8} 0 0 0 ${r * 1.3} ${r * 1.3}z`}
			/>
		);
	const label = `${LABEL[kind]}${kind === "clear" ? (isDay ? " skies" : " night") : ""}`;
	return (
		<svg
			role="img"
			aria-label={label}
			width="160"
			height="96"
			viewBox="0 0 160 96"
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{kind === "clear" && sunOrMoon(80, 48, 20)}
			{kind !== "clear" && (kind === "partly" || kind === "snow" || kind === "rain") && sunOrMoon(40, 30, 14)}
			{kind === "cloudy" && (
				<path d="M30 52h40a14 14 0 0 0 1.5-27.8A20 20 0 0 0 34 30a11 11 0 0 0-4 22z" fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />
			)}
			{kind !== "clear" && <path d={bigCloud} fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />}
			{kind === "snow" && (
				<g stroke={WATER} strokeWidth="2.2">
					<path d="M66 78v10M61 83h10M63.5 80.5l5 5M68.5 80.5l-5 5" />
					<path d="M90 76v10M85 81h10M87.5 78.5l5 5M92.5 78.5l-5 5" />
					<path d="M114 78v10M109 83h10M111.5 80.5l5 5M116.5 80.5l-5 5" />
				</g>
			)}
			{kind === "rain" && (
				<g stroke={WATER} strokeWidth="2.5">
					<path d="M64 76l-4 10M80 76l-4 10M96 76l-4 10M112 76l-4 10" />
				</g>
			)}
			{kind === "storm" && <path d="M88 70 78 84h12l-8 12" stroke={SUN} strokeWidth="3" />}
			{kind === "fog" && (
				<g stroke={INK} strokeWidth="2.5">
					<path d="M40 78h84M52 88h64" />
				</g>
			)}
		</svg>
	);
}
