import { MonitorSmartphone } from 'lucide-react';
import { useHostConnected } from '@/lib/hostLink/hostPresence';
import './host.css';

/** A small, quiet marker on the TV while a host window is connected and judging. */
export function HostConnectedBadge() {
  const connected = useHostConnected();
  if (!connected) return null;
  return (
    <div className="host-badge" role="status" aria-label="Host window connected">
      <MonitorSmartphone className="w-4 h-4" aria-hidden="true" />
      <span>Host connected</span>
    </div>
  );
}
