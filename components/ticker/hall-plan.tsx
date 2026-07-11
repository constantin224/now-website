interface Props {
  labels: {
    title: string;
    stage: string;
    standing: string;
    bar: string;
    tech: string;
    entrance: string;
    legendStandard: string;
    legendVip: string;
    note: string;
  };
}

// Saalplan als eleganter Architektur-Grundriss: Hairlines statt Farbflächen,
// Schraffur-Textur fürs Stehparkett, liebevolle Details (Bar = Meet-&-Greet-
// Location aus den VIP-Packages, Technik, Eingang). Genau EINE Kategorie.
const TERRACOTTA = "#a07352";
const SAND = "#d4cbbe";

export function HallPlan({ labels }: Props) {
  return (
    <div>
      {/* 3D-Kipp nur Desktop: der Plan liegt wie ein Bühnenplan im Raum */}
      <svg
        viewBox="0 0 400 300"
        className="w-full h-auto md:[transform:perspective(900px)_rotateX(26deg)] md:-my-3"
        role="img"
        aria-label={labels.title}
      >
        <defs>
          {/* Feine 45°-Schraffur — druckgrafisch statt Farbfläche */}
          <pattern
            id="hallHatch"
            width="7"
            height="7"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="7"
              stroke={TERRACOTTA}
              strokeOpacity="0.28"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {/* Außenwände */}
        <rect
          x="28"
          y="14"
          width="344"
          height="262"
          rx="8"
          fill="none"
          stroke={SAND}
          strokeOpacity="0.3"
          strokeWidth="1.4"
        />

        {/* Bühne — Doppellinie, sanft gefüllt */}
        <rect
          x="108"
          y="28"
          width="184"
          height="46"
          rx="3"
          fill={SAND}
          fillOpacity="0.07"
          stroke={SAND}
          strokeOpacity="0.4"
        />
        <rect
          x="113"
          y="33"
          width="174"
          height="36"
          rx="2"
          fill="none"
          stroke={SAND}
          strokeOpacity="0.15"
        />
        <text
          x="200"
          y="55"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.65"
          fontSize="11"
          letterSpacing="4"
        >
          {labels.stage}
        </text>

        {/* Stehparkett — die eine Fläche, schraffiert */}
        <polygon
          points="72,96 328,96 344,222 56,222"
          fill="url(#hallHatch)"
          stroke={TERRACOTTA}
          strokeOpacity="0.6"
          strokeWidth="1.2"
        />
        {/* Label-Schild, damit es über der Schraffur ruhig liegt */}
        <rect
          x="118"
          y="148"
          width="164"
          height="24"
          rx="2"
          fill="#0e0e0e"
          fillOpacity="0.85"
        />
        <text
          x="200"
          y="164"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.85"
          fontSize="10.5"
          letterSpacing="2.5"
        >
          {labels.standing}
        </text>

        {/* Technik-Pult */}
        <rect
          x="184"
          y="234"
          width="32"
          height="16"
          rx="2"
          fill="none"
          stroke={SAND}
          strokeOpacity="0.3"
        />
        <text
          x="200"
          y="262"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.4"
          fontSize="9"
          letterSpacing="2"
        >
          {labels.tech}
        </text>

        {/* Bar — Meet-&-Greet-Location aus den VIP-Packages */}
        <rect
          x="302"
          y="232"
          width="52"
          height="20"
          rx="2"
          fill={TERRACOTTA}
          fillOpacity="0.12"
          stroke={TERRACOTTA}
          strokeOpacity="0.55"
        />
        <text
          x="328"
          y="245.5"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.7"
          fontSize="9.5"
          letterSpacing="2.5"
        >
          {labels.bar}
        </text>

        {/* Eingang — Wandöffnung + Label */}
        <line
          x1="52"
          y1="276"
          x2="96"
          y2="276"
          stroke="#0e0e0e"
          strokeWidth="3"
        />
        <line
          x1="56"
          y1="276"
          x2="92"
          y2="276"
          stroke={SAND}
          strokeOpacity="0.5"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x="74"
          y="292"
          textAnchor="middle"
          fill={SAND}
          fillOpacity="0.4"
          fontSize="9"
          letterSpacing="2"
        >
          {labels.entrance}
        </text>
      </svg>

      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-xs md:text-sm text-sand/60">
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
      <p className="text-xs md:text-sm text-sand/50 mt-2">{labels.note}</p>
    </div>
  );
}
