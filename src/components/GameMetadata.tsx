import { useState } from 'react';
import { Info, Clock, Cpu, FileText, Globe, Layers } from 'lucide-react';
import type { GameMetadata } from '@/lib/storage';
import { formatTime } from '@/lib/ai/stats';

interface GameMetadataProps {
  metadata?: GameMetadata;
  defaultOpen?: boolean;
  collapsible?: boolean; // If false, content is always expanded (for dialogs)
}

export function GameMetadata({ metadata, defaultOpen = false, collapsible = true }: GameMetadataProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!metadata) return null;

  const formatDate = (isoString?: string) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatModelName = (model?: string) => {
    if (!model) return null;
    // Clean up model names for display
    if (model.startsWith('or:')) return model.slice(3);
    if (model.startsWith('ollama:')) return model.slice(7) + ' (Ollama)';
    return model;
  };

  // Get source mode label - handle the actual sourceMode values from the wizard
  const getSourceModeLabel = (): string | null => {
    if (!metadata.sourceMode) return null;

    const labels: Record<string, string> = {
      scratch: 'From Scratch', // Random theme
      paste: 'From Content',   // Pasted content
      url: 'From URL',         // Fetched from URL
      custom: 'Multi-Source',  // Multiple sources
    };

    // For 'scratch' mode, if there's a sourceMaterial, it might have been from content
    if (metadata.sourceMode === 'scratch' && metadata.sourceMaterial) {
      return 'From Content';
    }

    return labels[metadata.sourceMode] || metadata.sourceMode;
  };

  const shouldShow = collapsible ? isOpen : true;

  return (
    <div className={collapsible ? 'border-l border-slate-700/50' : ''}>
      {collapsible && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 w-full text-left py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors select-none"
        >
          <Info className="w-4 h-4" />
          <span>Game Info</span>
          <span className={`ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
      )}

      {shouldShow && (
        <div className={collapsible ? 'space-y-3 pl-6 pb-3 text-sm' : 'space-y-5 text-sm'}>
          {/* Creation Info */}
          {(metadata.generatedAt || metadata.modelUsed || metadata.generationTimeMs) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/90">Creation</p>
              {metadata.generatedAt && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock className="w-4 h-4 text-[var(--theme-accent,#ffcc00)]" />
                  <span className="text-sm">{formatDate(metadata.generatedAt)}</span>
                </div>
              )}
              {metadata.modelUsed && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Cpu className="w-4 h-4 text-[var(--theme-accent,#ffcc00)]" />
                  <span className="text-sm">{formatModelName(metadata.modelUsed)}</span>
                </div>
              )}
              {metadata.generationTimeMs && (
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-sm text-slate-500">Generated in</span>
                  <span className="text-sm">{formatTime(metadata.generationTimeMs)}</span>
                </div>
              )}
            </div>
          )}

          {/* Source/Mode Info */}
          {(metadata.sourceMode || metadata.difficulty) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/90">Source</p>
              {metadata.sourceMode && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Layers className="w-4 h-4 text-[var(--theme-accent,#ffcc00)]" />
                  <span className="text-sm">{getSourceModeLabel()}</span>
                </div>
              )}
              {metadata.difficulty && (
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-sm text-slate-500">Difficulty:</span>
                  <span className="text-sm capitalize">{metadata.difficulty}</span>
                </div>
              )}
            </div>
          )}

          {/* Custom Sources or Source Material */}
          {(metadata.customSources?.length || metadata.sourceMaterial) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/90">Sources</p>
              {metadata.customSources?.map((source, idx) => (
                <div key={idx} className="flex items-start gap-2 text-slate-300">
                  {source.type === 'url' ? (
                    <Globe className="w-4 h-4 text-[var(--theme-accent,#ffcc00)] mt-0.5 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-[var(--theme-accent,#ffcc00)] mt-0.5 flex-shrink-0" />
                  )}
                  <span className="text-sm break-all">{source.content}</span>
                </div>
              ))}
              {metadata.sourceMaterial && (
                <div className="flex items-start gap-2 text-slate-300">
                  <FileText className="w-4 h-4 text-[var(--theme-accent,#ffcc00)] mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-slate-400 line-clamp-2">{metadata.sourceMaterial}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
