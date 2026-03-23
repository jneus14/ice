"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatPeriod(period: string, granularity: string): string {
  if (granularity === "week") {
    const d = new Date(period + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // month: "2025-03" → "Mar 2025"
  const [y, m] = period.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function TimeSeriesChart({
  data,
  granularity,
}: {
  data: Array<{ period: string; count: number }>;
  granularity: string;
}) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatPeriod(d.period, granularity),
  }));

  if (chartData.length === 0) {
    return <p className="text-warm-400 text-sm py-8 text-center">No data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          axisLine={false}
          width={35}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #d6d3d1",
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#ea580c"
          fill="#fed7aa"
          strokeWidth={2}
          name="Incidents"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
