"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function TypeBreakdownChart({
  data,
  color = "#3b82f6",
}: {
  data: Array<{ type: string; count: number }>;
  color?: string;
}) {
  if (data.length === 0) {
    return <p className="text-warm-400 text-sm py-8 text-center">No data</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="type"
          tick={{ fontSize: 11, fill: "#44403c" }}
          tickLine={false}
          axisLine={false}
          width={160}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #d6d3d1",
          }}
        />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} name="Incidents" />
      </BarChart>
    </ResponsiveContainer>
  );
}
