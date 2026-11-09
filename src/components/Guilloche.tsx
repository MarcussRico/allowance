/**
 * Banknote-style security patterns, generated from a seed so every allowance
 * gets its own. The band is also the spend meter: lines left of the spent
 * fraction are printed in ink, the rest in faint engraving blue.
 */

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

function wavePath(width: number, height: number, phase: number, cycles: number, amp: number, beat: number): string {
  const steps = 160;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const t = (i / steps) * Math.PI * 2;
    const y = height / 2 + amp * Math.sin(t * cycles + phase) * (0.55 + 0.45 * Math.cos(t * beat + phase / 2));
    d += `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`;
  }
  return d;
}

export function GuillocheBand({
  seed,
  spentFraction,
  height = 44,
  label,
}: {
  seed: string;
  spentFraction: number;
  height?: number;
  label: string;
}) {
  const rand = seeded(seed);
  const width = 600;
  const cycles = 5 + Math.floor(rand() * 4);
  const beat = 1 + Math.floor(rand() * 2);
  const lines = 11;
  const amp = height * 0.42;
  const paths = Array.from({ length: lines }, (_, i) => wavePath(width, height, (i / lines) * Math.PI * 2, cycles, amp, beat));
  const cut = Math.max(0, Math.min(1, spentFraction)) * width;
  const clipSpent = `spent-${seed.replace(/[^a-z0-9]/gi, "")}`;
  const clipLeft = `left-${seed.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="guilloche-band">
      <defs>
        <clipPath id={clipSpent}>
          <rect x="0" y="0" width={cut} height={height} />
        </clipPath>
        <clipPath id={clipLeft}>
          <rect x={cut} y="0" width={width - cut} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipLeft})`} stroke="var(--engrave)" strokeOpacity="0.32" fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke">
        {paths.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <g clipPath={`url(#${clipSpent})`} stroke="var(--ink)" strokeOpacity="0.85" fill="none" strokeWidth="0.9">
        {paths.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {cut > 0 && cut < width && (
        <line x1={cut} x2={cut} y1="0" y2={height} stroke="var(--ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

export function GuillocheRosette({ seed, size = 88 }: { seed: string; size?: number }) {
  const rand = seeded(`${seed}:rosette`);
  // A prime outer radius keeps every rosette dense: the loop count never collapses to a few lobes.
  const R = rand() < 0.5 ? 31 : 37;
  const r = 7 + Math.floor(rand() * 6);
  const d0 = 10 + rand() * 9;
  const rings = 3;
  const paths: string[] = [];
  for (let k = 0; k < rings; k++) {
    const d = d0 + k * 3;
    const steps = 260 * r;
    let p = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * r;
      const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      p += `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`;
    }
    paths.push(p);
  }
  const extent = R - r + d0 + rings * 3;
  return (
    <svg
      viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
      width={size}
      height={size}
      aria-hidden="true"
      className="guilloche-rosette"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} fill="none" stroke="var(--engrave)" strokeOpacity={0.28 - i * 0.05} strokeWidth="0.35" />
      ))}
    </svg>
  );
}
