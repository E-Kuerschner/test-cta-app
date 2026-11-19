type IconProps = { size?: number; className?: string };

function Svg({
	size = 20,
	className,
	children,
	strokeWidth = 2,
}: IconProps & { children: React.ReactNode; strokeWidth?: number }) {
	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			{children}
		</svg>
	);
}

export function PinIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
			<circle cx="12" cy="9.5" r="2.5" />
		</Svg>
	);
}

export function LocateIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
		</Svg>
	);
}

export function WarningIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 3 2 20h20L12 3z" />
			<path d="M12 10v4M12 17.5v.01" />
		</Svg>
	);
}

