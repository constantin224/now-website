interface Props {
  labels: {
    title: string;
    stage: string;
    standing: string;
    legendStandard: string;
    legendVip: string;
    note: string;
  };
}

// Saalplan-Parodie: Nachbau der Konzern-Saalplan-Optik mit exakt EINER
// Kategorie. Erd-Palette, ruhige Flächen — Server-Komponente, statisches SVG.
const TERRACOTTA = "#a07352";
const SAND = "#d4cbbe";

export function HallPlan({ labels }: Props) {
  return (
    <div>
      <svg
        viewBox="0 0 400 250"
        className="w-full h-auto"
        role="img"
        aria-label={labels.title}
      >
        {/* Bühne */}
        <rect
          x="110"
          y="18"
          width="180"
          height="34"
          rx="3"
          fill={SAND}
          fillOpacity="0.14"
          stroke={SAND}
          strokeOpacity="0.25"
        />
        <text
          x="200"
          y="40"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.6"
          fontSize="12"
          letterSpacing="3"
        >
          {labels.stage}
        </text>
        {/* Die eine und einzige Fläche */}
        <polygon
          points="70,78 330,78 352,222 48,222"
          fill={TERRACOTTA}
          fillOpacity="0.18"
          stroke={TERRACOTTA}
          strokeOpacity="0.55"
        />
        <text
          x="200"
          y="156"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.85"
          fontSize="13"
          letterSpacing="2"
        >
          {labels.standing}
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs md:text-sm text-sand/60">
        <span className="flex items-center gap-2">
          <span
            className="rounded-full inline-block shrink-0"
            style={{ backgroundColor: TERRACOTTA, width: 10, height: 10 }}
          />
          {labels.legendStandard}
        </span>
        <span className="flex items-center gap-2">
          {/* VIP „gibt es nicht" — leerer, geghosteter Ring */}
          <span
            className="rounded-full inline-block shrink-0 border border-sand-38"
            style={{ width: 10, height: 10 }}
          />
          {labels.legendVip}
        </span>
      </div>
      <p className="text-xs md:text-sm text-sand-38 mt-2">{labels.note}</p>
    </div>
  );
}
