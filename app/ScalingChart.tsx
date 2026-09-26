import React, { useId } from 'react';
import runs from './scaling-data.json';

// Adapted from the paper figure6-remotion/src/ScalingFigure.tsx; original coordinates and observations retained.
// Raw observations only. Panel (a) displays steps 1k--100k without smoothing.
// Original data and panel (b)'s full-window minima retain step 0.
export const scalingMinima = runs.flatMap(run => (['clean', 'representative'] as const).map(metric => ({
  fraction: run.fraction, metric,
  sample: run.samples.reduce((a, b) => a[metric] <= b[metric] ? a : b),
})));
const colors = ['#B9B7CB', '#9994BE', '#7D72B3', '#6553AD', '#513ECB'];
const ink = '#29232f';
const muted = '#655c6e';
const grid = '#e5e0eb';
const top = 130, bottom = 500;
// Stable SVG serialization across the browser and server math implementations.
const coordinate = (value: number) => Math.round(value * 1e6) / 1e6;
const logY = (v: number) => coordinate(bottom - Math.log(v / .005) / Math.log(.02 / .005) * (bottom - top));
const bestY = (v: number) => coordinate(bottom - (v - .005) / (.0125 - .005) * (bottom - top));
const dataX = (v: number) => coordinate(1330 + Math.log(v / 4) / Math.log(125 / 4) * 440);
// Descriptive OLS fits: L = intercept + slope * ln(D), D in percentage points.
// Fit the five measured minima equally; draw only within the observed range.
export function fitLogLinear(metric: 'bestClean' | 'bestRepresentative') {
  const xs = runs.map(run => Math.log(run.fraction));
  const ys = runs.map(run => run[metric]);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const slope = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0)
    / xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const intercept = meanY - slope * meanX;
  const predict = (fraction: number) => intercept + slope * Math.log(fraction);
  const residual = ys.reduce((sum, y, i) => sum + (y - predict(runs[i].fraction)) ** 2, 0);
  const total = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
  return {intercept, slope, rSquared: 1 - residual / total, predict};
}
const fits = [
  {metric: 'bestClean' as const},
  {metric: 'bestRepresentative' as const},
].map(spec => ({...spec, ...fitLogLinear(spec.metric)}));
// Cut the fit itself around observations; do not cover grid lines with white disks.
function fitSegments(fit: typeof fits[number]) {
  const x1 = dataX(5), y1 = bestY(fit.predict(5));
  const dx = dataX(100) - x1, dy = bestY(fit.predict(100)) - y1;
  const lengthSquared = dx * dx + dy * dy;
  const gaps = runs.flatMap(run => {
    const px = dataX(run.fraction) - x1, py = bestY(run[fit.metric]) - y1;
    const center = (px * dx + py * dy) / lengthSquared;
    const distanceSquared = (px - center * dx) ** 2 + (py - center * dy) ** 2;
    if (distanceSquared >= 16 ** 2) return [];
    const half = Math.sqrt((16 ** 2 - distanceSquared) / lengthSquared);
    return [[Math.max(0, center - half), Math.min(1, center + half)]];
  }).sort((a, b) => a[0] - b[0]);
  const segments: {x1: number; y1: number; x2: number; y2: number; offset: number}[] = [];
  const append = (start: number, end: number) => {
    if (end > start) segments.push({x1: x1 + start * dx, y1: y1 + start * dy,
      x2: x1 + end * dx, y2: y1 + end * dy, offset: -start * Math.sqrt(lengthSquared)});
  };
  let cursor = 0;
  for (const [start, end] of gaps) {
    append(cursor, start);
    cursor = Math.max(cursor, end);
  }
  append(cursor, 1);
  return segments;
}
const Text: React.FC<React.SVGProps<SVGTextElement>> = props => <text fill={ink} fontSize={30} {...props} />;
const Rule: React.FC<React.SVGProps<SVGLineElement>> = props => <line stroke={grid} strokeWidth={1.3} {...props} />;
const SlopeArrow = ({x1, y1, x2, y2, solid, gradientId}: {
  x1: number; y1: number; x2: number; y2: number; solid: boolean; gradientId: string;
}) => {
  const length = coordinate(Math.hypot(x2 - x1, y2 - y1));
  const angle = coordinate(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
  return <g transform={`translate(${x1} ${y1}) rotate(${angle})`}>
    <path d={`M1.8,-1.6 H${length - 11}
      Q${length - 9},-1.6 ${length - 9},-3.2
      Q${length - 9},-4.8 ${length - 7.2},-3.9
      L${length - 1.5},-0.9 Q${length + .2},0 ${length - 1.5},.9
      L${length - 7.2},3.9 Q${length - 9},4.8 ${length - 9},3.2
      Q${length - 9},1.6 ${length - 11},1.6 H1.8
      Q0,1.6 0,0 Q0,-1.6 1.8,-1.6 Z`}
      fill={solid ? `url(#${gradientId})` : '#F3F3F6'} stroke={`url(#${gradientId})`} strokeWidth={1.2} strokeLinejoin="round" />
  </g>;
};
const Glow = ({x, y}: {x: number; y: number}) => <g>
  <circle cx={x} cy={y} r={19} fill="#bda5df" fillOpacity={0.06} />
  <circle cx={x} cy={y} r={15} fill="#bda5df" fillOpacity={0.10} />
  <circle cx={x} cy={y} r={11.5} fill="#bda5df" fillOpacity={0.16} />
</g>;
const GlowCircle = ({x, y, color}: {x: number; y: number; color: string}) => <g>
  <Glow x={x} y={y} />
  <circle cx={x} cy={y} r={8} fill={color} />
</g>;
const OpenCircle = ({x, y, color, outerRadius = 9.5}: {x: number; y: number; color: string; outerRadius?: number}) => <g>
  <g transform={`translate(${x} ${y}) scale(${outerRadius / 9.5})`}>
    <Glow x={0} y={0} />
    <circle cx={0} cy={0} r={8} fill="#F3F3F6" stroke={color} strokeWidth={3} />
  </g>
</g>;

function LinkedMinimum({ fraction, metric, x, y, color, panel }: {
  fraction: number; metric: 'clean' | 'representative'; x: number; y: number; color: string; panel: 'training' | 'scaling';
}) {
  const key = `${metric}-${fraction}`;
  return <g transform={`translate(${x} ${y})`} data-minimum={key} data-panel={panel}>
    <g style={{opacity: `var(--minimum-${key}, 1)`, transform: `scale(var(--minimum-scale-${key}, 1))`}}>
      <circle r={panel === 'training' ? 15 : 23} fill={color} style={{opacity: `var(--minimum-pulse-${key}, 0)`}} />
      {metric === 'representative'
        ? <OpenCircle x={0} y={0} color={color} outerRadius={panel === 'training' ? 5.8 : 9.5} />
        : panel === 'training' ? <circle r={5} fill={color} stroke="white" strokeWidth={1.2} /> : <GlowCircle x={0} y={0} color={color} />}
    </g>
  </g>;
}

function TrainingPanel({x, metric, title, clipId}: {
  x: number; metric: 'clean' | 'representative'; title: string; clipId: string;
}) {
  const width = 532.5;
  const sx = (v: number) => x + v / 100000 * width;
  return <g>
    <Text x={x + width / 2} y={580} textAnchor="middle" fontSize={28}>{title}</Text>
    {[.005, .006, .007, .01, .015, .02].map(v => <g key={v}>
      {v !== .02 && <Rule x1={x} x2={x + width} y1={logY(v)} y2={logY(v)} />}
      {metric === 'representative' && <Text x={x - 8} y={logY(v) + 4}
        transform={`rotate(-45 ${x - 8} ${logY(v) + 4})`}
        textAnchor="end" fill={muted} fontSize={24}>{v}</Text>}
    </g>)}
    {[0, 25000, 50000, 75000, 100000].map(v => <g key={v}>
      {v !== 0 && <Rule x1={sx(v)} x2={sx(v)} y1={top} y2={bottom} strokeOpacity={0.65} />}
      <Rule x1={sx(v)} x2={sx(v)} y1={bottom} y2={bottom + 7} stroke="#998bA5" />
      <Text x={sx(v)} y={bottom + 38} textAnchor={v === 0 ? 'start' : v === 100000 ? 'end' : 'middle'} fill={muted}>{v === 0 ? '0' : `${v / 1000}k`}</Text>
    </g>)}
    {metric === 'representative' && <Rule x1={x} x2={x} y1={top} y2={bottom} stroke="#998bA5" />}
    <Rule x1={x} x2={x + width} y1={bottom} y2={bottom} stroke="#998bA5" />
    <defs><clipPath id={clipId}><rect x={x - 10} y={0} width={552.5} style={{transform: "scaleX(var(--scaling-reveal, 1))", transformBox: "fill-box", transformOrigin: "left center"}} height={620} /></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
    {runs.map((run, index) => <g key={run.fraction}>
      {[{width: 16, opacity: 0.045}, {width: 11, opacity: 0.075}, {width: 7.5, opacity: 0.10}].map(halo =>
        <path key={halo.width}
          d={run.samples.filter(s => s.step >= 1000).map((s, i) => `${i ? 'L' : 'M'}${sx(s.step)},${logY(s[metric])}`).join(' ')}
          fill="none" stroke={colors[index]} strokeWidth={halo.width} strokeOpacity={halo.opacity}
          strokeLinecap="round" strokeLinejoin="round" />)}
      <path d={run.samples.filter(s => s.step >= 1000).map((s, i) => `${i ? 'L' : 'M'}${sx(s.step)},${logY(s[metric])}`).join(' ')}
        fill="none" stroke={colors[index]} strokeWidth={index === 4 ? 5.8 : 4.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </g>)}
    <g style={{opacity: "var(--scaling-rise, 1)"}}>
      <Text x={x + width - 12} y={metric === 'clean' ? 216 : 198} textAnchor="end" fontSize={21} fill={muted} fontStyle="italic">Late-Stage Loss Increase</Text>
      {[0, 1].map(index => {
        const step = index === 0 ? 85000 : 95000;
        const sample = runs[index].samples.find(s => s.step === step)!;
        const targetY = logY(sample[metric]) - 9;
        const startY = metric === 'clean' ? 224 : 206;
        return <path key={`rise-${index}`}
          d={index === 0
            ? `M${sx(76000)},${startY} Q${sx(82000)},${startY + 11} ${sx(step)},${targetY}`
            : `M${sx(96000)},${startY} Q${sx(99000)},${targetY - 30} ${sx(step)},${targetY}`}
          fill="none" stroke={colors[index]} strokeWidth={1.5} strokeLinecap="round" />;
      })}
    </g>
    </g>
    {runs.map((run, index) => {
      const best = scalingMinima.find(point => point.fraction === run.fraction && point.metric === metric)!.sample;
      if (best.step < 1000) return null;
      return <LinkedMinimum key={`minimum-${run.fraction}`} fraction={run.fraction} metric={metric}
        x={sx(best.step)} y={logY(best[metric])} color={colors[index]} panel="training" />;
    })}
  </g>;
}

export const ScalingChart = React.memo(function ScalingChart() {
  const id = useId().replace(/:/g, "");
  return <svg xmlns="http://www.w3.org/2000/svg"
  className="scaling-chart" width={1800} height={620} viewBox="0 0 1800 620"
  role="img" aria-labelledby={`${id}-title ${id}-description`} style={{fontFamily: 'Times New Roman'}}>
  <title id={`${id}-title`}>Human-data scaling: validation loss</title>
  <desc id={`${id}-description`}>Raw representative and clean validation curves at 5, 10, 25, 50, and 100 percent of training data, followed by their full-window minimum losses. The left axes use logarithmic loss; the right chart uses logarithmic data fraction. Dashed lines are descriptive fits, not extrapolations.</desc>
  <defs>
    {/* Vector-safe static glass: translucent tint, soft rim, and top light. */}
    <linearGradient id={`${id}-glass`} x1="0%" y1="0%" x2="35%" y2="100%">
      <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.88} />
      <stop offset="45%" stopColor="#F3F0FB" stopOpacity={0.78} />
      <stop offset="100%" stopColor="#E6E0F6" stopOpacity={0.7} />
    </linearGradient>
    <linearGradient id={`${id}-slope`} x1="0%" y1="0%" x2="100%" y2="0%">
      {colors.map((color, index) => <stop key={color}
        offset={`${coordinate(Math.log([5, 10, 25, 50, 100][index] / 5) / Math.log(20) * 100)}%`}
        stopColor={color} />)}
    </linearGradient>
  </defs>
  <Text x={647.5} y={95} textAnchor="middle" fontSize={35} fontWeight="bold">(a) Mid-training Validation Loss</Text>
  <Text x={24} y={315} transform="rotate(-90 24 315)" textAnchor="middle" fontSize={28}>Validation Loss (log scale)</Text>
  <TrainingPanel x={90} metric="representative" title="Representative Validation" clipId={`${id}-representative`} />
  <TrainingPanel x={672.5} metric="clean" title="Clean Validation" clipId={`${id}-clean`} />
  {runs.map((run, i) => {
    const lx = 230 + i * 180;
    return <g key={`shared-legend-${run.fraction}`}>
      {[{width: 16, opacity: 0.045}, {width: 11, opacity: 0.075}, {width: 7.5, opacity: 0.10}].map(halo =>
        <Rule key={halo.width} x1={lx} x2={lx + 38} y1={145} y2={145}
          stroke={colors[i]} strokeWidth={halo.width} strokeOpacity={halo.opacity} strokeLinecap="round" />)}
      <Rule x1={lx} x2={lx + 38} y1={145} y2={145} stroke={colors[i]} strokeWidth={i === 4 ? 5.8 : 4.5} />
      <Text x={lx + 50} y={154} fontSize={28}>{run.fraction}%</Text>
    </g>;
  })}
  <Text x={1550} y={95} textAnchor="middle" fontSize={35} fontWeight="bold">(b) Validation Loss Scaling</Text>
  {[.006, .008, .010, .012].map(v => <g key={v}>
    <Rule x1={1330} x2={1770} y1={bestY(v)} y2={bestY(v)} />
    <Text x={1322} y={bestY(v) + 4} transform={`rotate(-45 1322 ${bestY(v) + 4})`}
      textAnchor="end" fontSize={24} fill={muted}>{v.toFixed(3)}</Text>
  </g>)}
  <Rule x1={1330} x2={1330} y1={top} y2={bottom} stroke="#998bA5" />
  <Rule x1={1330} x2={1770} y1={bottom} y2={bottom} stroke="#998bA5" />
  <g style={{opacity: "var(--scaling-summary, 1)", transform: "translateY(var(--scaling-summary-offset, 0px))"}}>
  {fits.flatMap(fit => fitSegments(fit).map(({offset, ...segment}, index) => <Rule key={`${fit.metric}-${index}`}
    {...segment} strokeDashoffset={offset}
    stroke="#8B83AF" strokeWidth={2.4} strokeOpacity={0.8} strokeDasharray="7 6" strokeLinecap="round" />))}
  {/* Arrow lengths show fitted loss decreases for the same data doubling. */}
  {fits.map(fit => {
    return <SlopeArrow gradientId={`${id}-slope`} key={`slope-${fit.metric}`}
      x1={dataX(50)} x2={dataX(100)}
      y1={bestY(fit.predict(50)) - 34} y2={bestY(fit.predict(100)) - 34}
      solid={fit.metric === 'bestClean'} />;
  })}
  <g>
    {[{width: 12, opacity: .012}, {width: 8, opacity: .018}, {width: 4, opacity: .025}].map(layer =>
      <rect key={layer.width} x={1346} y={412} width={154} height={74} rx={12}
        fill="none" stroke="#8676AF" strokeWidth={layer.width} strokeOpacity={layer.opacity} />)}
    <rect x={1346} y={410} width={154} height={74} rx={12}
      fill={`url(#${id}-glass)`} stroke="#CFC7E5" strokeOpacity={0.1} strokeWidth={0.6} />
    <rect x={1347.2} y={411.2} width={151.6} height={71.6} rx={10.8}
      fill="none" stroke="white" strokeOpacity={0.15} strokeWidth={0.6} />
    <path d="M1349,423 Q1349,413 1359,413 H1487 Q1497,413 1497,423"
      fill="none" stroke="white" strokeWidth={1} strokeOpacity={0.2} strokeLinecap="round" />
    <g transform="translate(-10 4)">
      <SlopeArrow gradientId={`${id}-slope`} x1={1392} y1={419} x2={1420} y2={433} solid={false} />
      <SlopeArrow gradientId={`${id}-slope`} x1={1446} y1={419} x2={1474} y2={433} solid />
      <Text x={1433} y={466} textAnchor="middle" fontSize={22} fill="#756A9B" fontStyle="italic">Similar Trends</Text>
    </g>
  </g>
  </g>
  {runs.map((run, i) => <g key={run.fraction}>
    <Rule x1={dataX(run.fraction)} x2={dataX(run.fraction)} y1={bottom} y2={bottom + 7} stroke="#998bA5" />
    <Text x={dataX(run.fraction)} y={bottom + 38} textAnchor="middle" fill={muted}>{run.fraction}</Text>
    <LinkedMinimum fraction={run.fraction} metric="clean" x={dataX(run.fraction)} y={bestY(run.bestClean)} color={colors[i]} panel="scaling" />
    <LinkedMinimum fraction={run.fraction} metric="representative" x={dataX(run.fraction)} y={bestY(run.bestRepresentative)} color={colors[i]} panel="scaling" />
  </g>)}
  <g>
    <Text x={1708} y={199} fontSize={28} textAnchor="end">Representative</Text>
    <OpenCircle x={1734} y={191} color={colors[4]} />
    <Text x={1708} y={235} fontSize={28} textAnchor="end">Clean</Text>
    <GlowCircle x={1734} y={227} color={colors[4]} />
  </g>
  <Text x={1550} y={580} textAnchor="middle" fontSize={28}>Training Data (%, log scale)</Text>
  <Text x={1255} y={315} transform="rotate(-90 1255 315)" textAnchor="middle" fontSize={30}>Best Validation Loss</Text>
</svg>;
});
