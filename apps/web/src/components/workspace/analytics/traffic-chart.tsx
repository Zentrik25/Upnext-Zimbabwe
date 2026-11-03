"use client";

import { useEffect, useRef, useState } from "react";
import { bucketLabel, count } from "@/lib/staff-format";
import type { ChartPoint } from "@/lib/staff-types";

type Bucket = "hour" | "day" | "week" | "month";

const H = 210;
const PAD = { left: 40, right: 14, top: 12, bottom: 28 };
const UNIT: Record<Bucket, string> = { hour: "hours", day: "days", week: "weeks", month: "months" };

/** An axis top whose quarters are whole, round numbers (4, 8, 12, 60 -> 240, 100 -> 100 ...). */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const quarter = max / 4;
  const power = 10 ** Math.floor(Math.log10(quarter));
  const step =
    [1, 2, 2.5, 3, 4, 5, 6, 8, 10].map((s) => s * power).find((s) => Number.isInteger(s) && s >= quarter) ??
    Math.ceil(quarter);
  return step * 4;
}

/**
 * A line chart of page views per bucket. Plain SVG (no chart library), flat, in the design tokens, drawn as wide as
 * its box so the text keeps its real size on a phone. Every point has a native tooltip, and the same numbers sit in
 * a visually hidden table for assistive technology. Quiet buckets show as zero, never as gaps.
 */
export function TrafficChart({
  points,
  bucket,
  label,
}: {
  points: ChartPoint[];
  bucket: Bucket;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      if (width > 0) setW(Math.max(260, width));
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...points.map((p) => p.views)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.views).toFixed(1)}`)
    .join(" ");
  const ticks = [0, 1, 2, 3, 4].map((n) => Math.round((max / 4) * n * 100) / 100);
  const every = Math.max(1, Math.ceil(points.length / (W < 420 ? 4 : 6)));
  const dots = points.length <= 40;
  const total = points.reduce((sum, p) => sum + p.views, 0);
  const slot = innerW / Math.max(points.length, 1);

  return (
    <figure className="m-0">
      <div ref={box} className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={`${label}: ${count(total)} views in ${points.length} ${UNIT[bucket]}`}
          className="block max-w-full"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
                {count(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text
                key={p.t}
                x={x(i)}
                y={H - 8}
                textAnchor={i === points.length - 1 && points.length > 1 ? "end" : "middle"}
                className="fill-muted text-[11px]"
              >
                {bucketLabel(p.t, bucket)}
              </text>
            ) : null,
          )}
          {points.length > 1 ? (
            <path
              d={line}
              fill="none"
              className="stroke-accent"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((p, i) => (
            <g key={p.t}>
              {dots || points.length === 1 ? (
                <circle cx={x(i)} cy={y(p.views)} r={3} className="fill-accent" />
              ) : null}
              <rect x={x(i) - slot / 2} y={PAD.top} width={slot} height={innerH} fill="transparent">
                <title>{`${bucketLabel(p.t, bucket)}: ${count(p.views)} views`}</title>
              </rect>
            </g>
          ))}
        </svg>
      </div>
      <p className="m-0 mt-1 text-small text-muted">The latest {bucket} is still in progress.</p>
      <figcaption className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Views</th>
              <th scope="col">Apply clicks</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.t}>
                <th scope="row">{bucketLabel(p.t, bucket)}</th>
                <td>{count(p.views)}</td>
                <td>{count(p.apply_clicks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
