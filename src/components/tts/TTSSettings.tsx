/**
 * TTS Settings Component
 * Allows users to configure text-to-speech settings via submenu
 */

import { useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Loader2, Check, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getTTSSettings,
  updateTTSSettings,
  checkTTSAvailable,
  getFavoriteVoices,
  type TTSVoice,
} from '@/lib/tts';

/**
 * TTS Submenu with all settings
 * Can be used in both MainMenu and GameBoard
 */
export function TTSSubmenu() {
  const [settings, setSettings] = useState(getTTSSettings());
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [editingApiUrl, setEditingApiUrl] = useState(settings.apiUrl);
  const [submenuOpen, setSubmenuOpen] = useState(false);

  // Sync settings with localStorage changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'jeop3:ttsSettings:v1' && e.newValue) {
        try {
          setSettings(JSON.parse(e.newValue));
        } catch {
          // Ignore invalid JSON
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Update editing API URL when settings change
  useEffect(() => {
    setEditingApiUrl(settings.apiUrl);
  }, [settings.apiUrl]);

  // Check availability and load voices when submenu opens
  useEffect(() => {
    if (submenuOpen && settings.enabled) {
      setChecking(true);
      checkTTSAvailable().then(isAvailable => {
        setAvailable(isAvailable);
        setChecking(false);
      });

      setLoadingVoices(true);
      getFavoriteVoices().then(fetched => {
        setVoices(fetched);
        setLoadingVoices(false);
      }).catch(() => setLoadingVoices(false));
    }
  }, [submenuOpen, settings.enabled]);

  const handleToggleEnabled = () => {
    const updated = updateTTSSettings({ enabled: !settings.enabled });
    setSettings(updated);
    if (updated.enabled && !available) {
      setChecking(true);
      checkTTSAvailable().then(setAvailable).finally(() => setChecking(false));
    }
  };

  const handleTestConnection = async () => {
    setChecking(true);
    const isAvailable = await checkTTSAvailable();
    setAvailable(isAvailable);
    setChecking(false);
  };

  const handleSaveApiUrl = useCallback(() => {
    if (editingApiUrl && editingApiUrl !== settings.apiUrl) {
      const updated = updateTTSSettings({ apiUrl: editingApiUrl });
      setSettings(updated);
      setAvailable(null);
    }
  }, [editingApiUrl, settings.apiUrl]);

  const isEnabled = settings.enabled && available === true;

  return (
    <DropdownMenuSub open={submenuOpen} onOpenChange={setSubmenuOpen}>
      <DropdownMenuSubTrigger>
        <Volume2 className={`w-4 h-4 mr-2 ${isEnabled ? 'text-green-400' : 'text-slate-400'}`} />
        <span>Text-to-Speech</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={5} className="w-64">
        {/* Status header */}
        <div className="px-2 py-1.5 text-xs border-b border-slate-700 flex items-center justify-between">
          <span className="text-slate-500">TTS Status</span>
          <div className="flex items-center gap-1">
            {checking ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                <span className="text-slate-400 text-xs">Checking...</span>
              </>
            ) : available === true ? (
              <>
                <Check className="w-3 h-3 text-green-400" />
                <span className="text-green-400 text-xs">Connected</span>
              </>
            ) : available === false ? (
              <>
                <VolumeX className="w-3 h-3 text-red-400" />
                <span className="text-red-400 text-xs">Unavailable</span>
              </>
            ) : (
              <>
                <Settings className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 text-xs">Off</span>
              </>
            )}
          </div>
        </div>

        {/* Enable/Disable */}
        <DropdownMenuItem onClick={handleToggleEnabled} disabled={checking}>
          {settings.enabled ? (
            <Volume2 className="w-4 h-4 mr-2 text-green-400" />
          ) : (
            <VolumeX className="w-4 h-4 mr-2 text-slate-400" />
          )}
          <span>{settings.enabled ? 'Disable TTS' : 'Enable TTS'}</span>
        </DropdownMenuItem>

        {settings.enabled && (
          <>
            <DropdownMenuSeparator />

            {/* Test Connection */}
            <DropdownMenuItem onClick={handleTestConnection} disabled={checking}>
              {checking ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2 text-slate-400" />
              )}
              <span>Test Connection</span>
            </DropdownMenuItem>

            {/* Auto Read Toggle */}
            <DropdownMenuItem onClick={() => {
              const updated = updateTTSSettings({ autoRead: !settings.autoRead });
              setSettings(updated);
            }}>
              {settings.autoRead ? (
                <Check className="w-4 h-4 mr-2 text-green-400" />
              ) : (
                <div className="w-4 h-4 mr-2" />
              )}
              <span>Auto Read Clues</span>
            </DropdownMenuItem>

            {/* Voice Selection Submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Settings className="w-4 h-4 mr-2 text-slate-400" />
                <span>Voice Settings</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent sideOffset={5} className="w-56">
                {/* API URL */}
                <div className="px-2 py-1.5">
                  <Label className="text-xs">API URL</Label>
                  <Input
                    value={editingApiUrl}
                    onChange={(e) => setEditingApiUrl(e.target.value)}
                    onBlur={handleSaveApiUrl}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveApiUrl();
                        (e.target as HTMLInputElement).blur();
                      } else if (e.key === 'Escape') {
                        setEditingApiUrl(settings.apiUrl);
                      }
                    }}
                    placeholder="http://127.0.0.1:7860/api"
                    className="h-8 text-sm mt-1"
                  />
                </div>

                <DropdownMenuSeparator />

                {/* Voice Selection */}
                <div className="px-2 py-1.5">
                  <Label className="text-xs">Favorite Voice</Label>
                  {voices.length === 0 && !loadingVoices && (
                    <p className="text-xs text-slate-500 mt-1">No favorites available</p>
                  )}
                  {loadingVoices && (
                    <div className="flex items-center gap-2 mt-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-xs text-slate-500">Loading...</span>
                    </div>
                  )}
                </div>

                {voices.map(voice => (
                  <DropdownMenuItem
                    key={voice.id}
                    onClick={() => {
                      const updated = updateTTSSettings({ defaultVoice: voice.id });
                      setSettings(updated);
                    }}
                  >
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="text-sm truncate">{voice.label}</span>
                      <span className="text-xs text-slate-400 truncate">
                        {voice.locale} {voice.gender && `• ${voice.gender}`}
                      </span>
                    </div>
                    {voice.id === settings.defaultVoice && (
                      <Check className="w-4 h-4 ml-auto text-green-400 flex-shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                {/* Speed Control */}
                <div className="px-2 py-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Speed: {settings.speed}x</Label>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={settings.speed}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const updated = updateTTSSettings({ speed: value });
                      setSettings(updated);
                    }}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>0.5x</span>
                    <span>1.0x</span>
                    <span>2.0x</span>
                  </div>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * Simple TTS Menu Button for standalone use (legacy, for compatibility)
 * @deprecated Use TTSSubmenu in existing menus instead
 */
export function TTSMenuButton() {
  const [settings, setSettings] = useState(getTTSSettings());
  const [available, setAvailable] = useState<boolean | null>(null);

  // Sync settings with localStorage changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'jeop3:ttsSettings:v1' && e.newValue) {
        try {
          setSettings(JSON.parse(e.newValue));
        } catch {
          // Ignore invalid JSON
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (settings.enabled) {
      checkTTSAvailable().then(setAvailable);
    }
  }, [settings.enabled]);

  const isEnabled = settings.enabled && available === true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
          title="Text-to-Speech"
        >
          <Volume2 className={`w-3.5 h-3.5 ${isEnabled ? 'text-green-400' : ''}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <TTSSubmenu />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
