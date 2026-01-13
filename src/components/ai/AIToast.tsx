/**
 * AI Toast Component
 *
 * Displays toast notifications for AI operations.
 * Ported from jeop2 with React improvements.
 */

import { useEffect } from 'react';
import { X, Undo, CheckCircle, XCircle, Info, Loader2 } from 'lucide-react';
import type { Toast } from '@/lib/ai/hooks';

interface AIToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function AIToast({ toast, onDismiss }: AIToastProps) {
  const { id, message, type, onUndo } = toast;

  useEffect(() => {
    // Auto-dismiss after duration
    if (toast.duration && toast.duration > 0) {
      const timeout = setTimeout(() => onDismiss(id), toast.duration);
      return () => clearTimeout(timeout);
    }
  }, [id, toast.duration, onDismiss]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500/10 border-green-500/30 text-green-200';
      case 'error':
        return 'bg-red-500/10 border-red-500/30 text-red-200';
      case 'info':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-200';
      case 'loading':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-200';
    }
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border
        shadow-lg backdrop-blur-sm
        animate-in slide-in-from-right-full duration-300
        ${getStyles()}
      `}
    >
      <span className="flex-shrink-0">
        {getIcon()}
      </span>
      <span className="flex-1 text-sm">
        {message}
      </span>
      {onUndo && (
        <button
          onClick={() => {
            onUndo();
            onDismiss(id);
          }}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium
            bg-white/10 hover:bg-white/20 rounded transition-colors"
        >
          <Undo className="w-3 h-3" />
          Undo
        </button>
      )}
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface AIToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function AIToastContainer({ toasts, onDismiss }: AIToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-md">
      {toasts.map(toast => (
        <AIToast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
