"use client";

/**
 * Histórico de preço na própria linha. Só aparece com ≥ 2 snapshots — antes
 * disso não há variação para mostrar, e uma linha reta mentiria.
 */
export function PriceSparkline({
  points,
  width = 44,
  height = 14,
}: {
  points: { captured_at: string; effective_nightly: number | null }[];
  width?: number;
  height?: number;
}) {
  const values = points
    .map((point) => point.effective_nightly)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * (width - 2) + 1;
      const y = height - 1 - ((value - min) / span) * (height - 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = values[0];
  const last = values[values.length - 1];
  const dropped = last < first;
  const delta = first === 0 ? 0 : ((last - first) / first) * 100;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      role="img"
      aria-label={`Variação de preço: ${delta.toFixed(0)}%`}
    >
      <title>{`${delta > 0 ? "+" : ""}${delta.toFixed(0)}% desde o primeiro snapshot`}</title>
      <path
        d={path}
        fill="none"
        strokeWidth="1.25"
        className={dropped ? "stroke-success" : "stroke-muted-foreground"}
      />
    </svg>
  );
}
