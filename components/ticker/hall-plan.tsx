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

// Saalplan-Parodie in der Erd-Palette der Now.-Seite (identisch zu price-chart.tsx):
// Terracotta = die EINE Fläche (Stehparkett), Sand = Bühne, Basis-Dunkel = Text
// auf der Fläche. Nachbau der Ticketmaster-Saalplan-Optik mit genau einer Kategorie.
// Server-Komponente — statisches SVG, kein Client-JS.
const TERRACOTTA = "#a07352";
const SAND = "#d4cbbe";
const BASE = "#0e0e0e";

export function HallPlan({ labels }: Props) {
  return (
    <section>
      <h2 className="font-light text-lg md:text-xl text-sand/70 mb-6">
        {labels.title}
      </h2>
      <svg
        viewBox="0 0 400 260"
        className="w-full max-w-lg h-auto"
        role="img"
        aria-label={labels.title}
      >
        {/* Bühne — gedämpfte Sand-Leiste */}
        <rect x="120" y="16" width="160" height="36" rx="4" fill={SAND} opacity="0.25" />
        <text
          x="200"
          y="40"
          textAnchor="middle"
          fill={SAND}
          opacity="0.7"
          fontSize="16"
          fontWeight="bold"
        >
          {labels.stage}
        </text>
        {/* Die eine und einzige Fläche: Stehparkett in Terracotta */}
        <polygon points="60,80 340,80 360,230 40,230" fill={TERRACOTTA} opacity="0.85" />
        <text
          x="200"
          y="165"
          textAnchor="middle"
          fill={BASE}
          fontSize="15"
          fontWeight="bold"
        >
          {labels.standing}
        </text>
      </svg>
      <div className="flex gap-6 mt-3 text-sm text-sand/60">
        <span className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: TERRACOTTA }}
          />{" "}
          {labels.legendStandard}
        </span>
        <span className="flex items-center gap-2">
          {/* VIP „gibt es nicht" — daher als leerer, geghosteter Ring */}
          <span className="w-3 h-3 rounded-full inline-block border border-sand-38" />{" "}
          {labels.legendVip}
        </span>
      </div>
      <p className="text-sm text-sand-38 mt-2">{labels.note}</p>
    </section>
  );
}
