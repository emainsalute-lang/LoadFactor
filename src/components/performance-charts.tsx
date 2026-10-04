"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, BarChart3, MoveUpRight } from "lucide-react";
import type { HeightUnit, WeightUnit } from "@/lib/types";
import { heightFromCm, weightFromKg } from "@/lib/analytics";
interface Point { date: string; label: string; value: number }
const tooltipStyle = { background: "#20232a", border: "1px solid #383d47", borderRadius: 10, color: "#f3f4f6", fontSize: 12 };
export default function PerformanceCharts({ jumps, volume, heightUnit, weightUnit }: {
  jumps: Point[]; volume: Point[]; heightUnit: HeightUnit; weightUnit: WeightUnit;
}) {
  const jumpPoints = jumps.map(p => ({ ...p, value: Number(heightFromCm(p.value, heightUnit).toFixed(1)) }));
  const volumePoints = volume.map(p => ({ ...p, value: Math.round(weightFromKg(p.value, weightUnit)) }));
  const gain = jumpPoints.length > 1 ? jumpPoints[jumpPoints.length - 1].value - jumpPoints[0].value : 0;
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
    <section className="panel chart-panel">
      <div className="section-title"><div><span className="eyebrow">EXPLOSIVE POWER</span><h2>Vertical jump progression</h2></div><MoveUpRight size={19} className="text-lime-300" /></div>
      <div className="chart-subtitle"><span>Daily best · {heightUnit === "in" ? "inches" : "centimeters"}</span><span className="positive"><ArrowUpRight size={13}/>{gain >= 0 ? "+" : ""}{gain.toFixed(1)} {heightUnit} this period</span></div>
      <div className="chart" role="img" aria-label={"Vertical jump chart with " + jumpPoints.length + " daily best measurements"}>
        {jumpPoints.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={jumpPoints} margin={{ top: 15, right: 16, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#292d35" strokeDasharray="3 5" vertical={false}/>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#858b97", fontSize: 11 }} minTickGap={36} dy={10}/>
            <YAxis domain={["dataMin - 2", "dataMax + 2"]} axisLine={false} tickLine={false} tick={{ fill: "#858b97", fontSize: 11 }} tickFormatter={value => Number(value).toFixed(0)}/>
            <Tooltip contentStyle={tooltipStyle} formatter={value => [String(value) + " " + heightUnit, "Jump height"]}/>
            <Line type="monotone" dataKey="value" stroke="#c6f467" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#c6f467", stroke: "#171a20", strokeWidth: 3 }}/>
          </LineChart>
        </ResponsiveContainer> : <p className="empty">Log a jump to start tracking your progress.</p>}
      </div>
      <div className="chart-footer"><span><i className="legend-dot bg-lime-300"/>Vertical jump</span><span>Every centimeter counts.</span></div>
    </section>
    <section className="panel chart-panel">
      <div className="section-title"><div><span className="eyebrow">TRAINING LOAD</span><h2>Weekly volume</h2></div><BarChart3 size={19} className="text-sky-300"/></div>
      <div className="chart-subtitle"><span>Total weight × reps · {weightUnit}</span><span className="subtle-pill">Monday–Sunday</span></div>
      <div className="chart" role="img" aria-label="Total volume per training week">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={volumePoints} margin={{ top: 15, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#292d35" strokeDasharray="3 5" vertical={false}/>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#858b97", fontSize: 11 }} minTickGap={16} dy={10}/>
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#858b97", fontSize: 11 }} tickFormatter={value => Number(value) >= 1000 ? (Number(value) / 1000).toFixed(0) + "k" : String(value)}/>
            <Tooltip cursor={{ fill: "#ffffff05" }} contentStyle={tooltipStyle} formatter={value => [Number(value).toLocaleString() + " " + weightUnit, "Volume"]}/>
            <Bar dataKey="value" fill="#79c8ed" radius={[5, 5, 0, 0]} maxBarSize={34}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footer"><span><i className="legend-dot bg-sky-300"/>Volume load</span><span>Consistency builds capacity.</span></div>
    </section>
  </div>;
}
