'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface QueryChartData {
  date: string;
  queries: number;
  escalations: number;
}

interface QueryChartProps {
  data: QueryChartData[];
}

export function QueryChart({ data }: QueryChartProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Query Volume (Last 7 Days)
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="queries" fill="#6366f1" name="Queries" />
            <Bar dataKey="escalations" fill="#f59e0b" name="Escalations" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
