import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-serif text-warm-900">Trends & Analytics</h1>
        <p className="text-warm-500 mt-1">Data insights from the Human Impact Project tracker</p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
