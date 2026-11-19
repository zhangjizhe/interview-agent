import { CheckCircle2, Clock3, Loader2, MinusCircle, XCircle } from 'lucide-react';
const states = {
  PENDING: { label: '等待中', tone: 'pending', icon: Clock3 },
  RUNNING: { label: '运行中', tone: 'running', icon: Loader2 },
  COMPLETED: { label: '已完成', tone: 'completed', icon: CheckCircle2 },
  FAILED: { label: '失败', tone: 'failed', icon: XCircle },
  CANCELLED: { label: '已取消', tone: 'cancelled', icon: MinusCircle },
};
export function RunStatusBadge({ status }: { status: string }) {
  const value = Object.prototype.hasOwnProperty.call(states, status) ? states[status as keyof typeof states] : { label: status, tone: 'unknown', icon: MinusCircle };
  const Icon = value.icon;
  return <span className={`run-status-badge run-status-${value.tone}`} title={status}><Icon size={13} aria-hidden="true"/>{value.label}</span>;
}
