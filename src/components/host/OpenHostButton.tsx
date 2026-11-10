import { useState } from 'react';
import { MonitorUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openHostWindow, hostViewUrl } from '@/lib/hostLink/openHost';
import { useHostConnected } from '@/lib/hostLink/hostPresence';

interface OpenHostButtonProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'ghost' | 'outline';
  /** Hide the words on narrow layouts (the tooltip still names it). */
  label?: string;
}

/** Opens the host window: a second browser window that sees the answers and runs the game remotely. */
export function OpenHostButton({ className, size = 'sm', variant = 'ghost', label = 'Open host view' }: OpenHostButtonProps) {
  const connected = useHostConnected();
  const [blocked, setBlocked] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        title={`Open a second window for the host: it shows the answers while this window stays on the TV (${hostViewUrl()})`}
        onClick={() => setBlocked(openHostWindow() === null)}
      >
        <MonitorUp className="size-4" aria-hidden="true" />
        <span>{connected ? 'Host view open' : label}</span>
      </Button>
      {blocked && (
        <span role="alert" className="text-xs text-amber-300">
          The browser blocked the popup. Allow popups for this site, or open {hostViewUrl()} in another window.
        </span>
      )}
    </>
  );
}
