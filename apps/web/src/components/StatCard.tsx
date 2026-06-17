import { memo } from 'react';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  hint?: string;
}

export const StatCard = memo(function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
        <span>{icon}</span> {label}
      </div>
      <div className="text-lg md:text-2xl font-semibold text-slate-900 font-mono">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
});
