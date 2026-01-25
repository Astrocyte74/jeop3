/**
 * TTS Settings Component
 * Allows users to configure text-to-speech settings
 */

import { useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Loader2, Check, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

interface TTSSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TTSSettingsDialog({ open, onOpenChange }: TTSSettingsProps) {
  const [settings, setSettings] = useState(getTTSSettings());
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [editingApiUrl, setEditingApiUrl] = useState(settings.apiUrl);
  const [saveApiUrl, setSaveApiUrl] = useState<string | null>(null);

  // Sync settings with localStorage changes (from other components)
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

  // Check availability and load voices when opened
  useEffect(() => {
    if (open && settings.enabled) {
      setChecking(true);
      checkTTSAvailable().then(isAvailable => {
        setAvailable(isAvailable);
        setChecking(false);
      });

      // Load favorite voices
      setLoadingVoices(true);
      getFavoriteVoices().then(fetched => {
        setVoices(fetched);
        setLoadingVoices(false);
      }).catch(() => setLoadingVoices(false));
    }
  }, [open, settings.enabled]);

  const handleToggleEnabled = () => {
    const updated = updateTTSSettings({ enabled: !settings.enabled });
    setSettings(updated);
    if (updated.enabled && !available) {
      // Check availability when enabling
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
    if (saveApiUrl && saveApiUrl !== settings.apiUrl) {
      const updated = updateTTSSettings({ apiUrl: saveApiUrl });
      setSettings(updated);
      // Reset availability since API URL changed
      setAvailable(null);
    }
    setSaveApiUrl(null);
  }, [saveApiUrl, settings.apiUrl]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Text-to-Speech Settings
            </AlertDialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <AlertDialogDescription>
            Configure TTS for reading clues and answers (requires local TTS server)
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-center gap-3">
              {settings.enabled ? (
                <Volume2 className="w-5 h-5 text-green-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <div className="font-medium text-sm">
                  {settings.enabled ? 'TTS Enabled' : 'TTS Disabled'}
                </div>
                <div className="text-xs text-slate-400">
                  {settings.enabled
                    ? 'Clues can be read aloud'
                    : 'Click to enable text-to-speech'}
                </div>
              </div>
            </div>
            <Button
              variant={settings.enabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleEnabled}
              disabled={checking}
            >
              {checking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {settings.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          {settings.enabled && (
            <>
              {/* Connection Status */}
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    {checking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        <span className="text-slate-400">Checking...</span>
                      </>
                    ) : available === true ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-green-400">Connected</span>
                      </>
                    ) : available === false ? (
                      <>
                        <VolumeX className="w-4 h-4 text-red-400" />
                        <span className="text-red-400">Not Available</span>
                      </>
                    ) : (
                      <>
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-400">Not Checked</span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={checking}
                  >
                    Test Connection
                  </Button>
                </div>

                {/* API URL Configuration */}
                <div className="space-y-2">
                  <Label htmlFor="api-url" className="text-xs">API URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-url"
                      value={editingApiUrl}
                      onChange={(e) => {
                        setEditingApiUrl(e.target.value);
                        setSaveApiUrl(e.target.value);
                      }}
                      onBlur={handleSaveApiUrl}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveApiUrl();
                        } else if (e.key === 'Escape') {
                          setEditingApiUrl(settings.apiUrl);
                          setSaveApiUrl(null);
                        }
                      }}
                      placeholder="http://127.0.0.1:7860/api"
                      className="flex-1 h-8 text-sm"
                    />
                    {saveApiUrl && saveApiUrl !== settings.apiUrl && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSaveApiUrl}
                        className="h-8"
                      >
                        Save
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    URL of your Kokoro TTS server
                  </p>
                </div>
              </div>

              {/* Voice Selection */}
              <div className="space-y-2">
                <Label>Favorite Voice</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {settings.defaultVoice
                          ? voices.find(v => v.id === settings.defaultVoice)?.label || settings.defaultVoice
                          : 'Select Voice...'
                        }
                      </span>
                      <span className="text-xs text-slate-400 ml-2">▼</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
                    <DropdownMenuItem onClick={() => {
                      const updated = updateTTSSettings({ defaultVoice: '' });
                      setSettings(updated);
                    }}>
                      <em className="text-slate-400">Default Voice</em>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {voices.length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-400">
                        {loadingVoices ? 'Loading voices...' : 'No favorites available'}
                      </div>
                    )}
                    {voices.map(voice => (
                      <DropdownMenuItem
                        key={voice.id}
                        onClick={() => {
                          const updated = updateTTSSettings({ defaultVoice: voice.id });
                          setSettings(updated);
                        }}
                      >
                        <div className="flex flex-col gap-1">
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Auto Read Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-read">Auto Read</Label>
                  <p className="text-xs text-slate-400">
                    Automatically read clues when revealed
                  </p>
                </div>
                <Button
                  variant={settings.autoRead ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const updated = updateTTSSettings({ autoRead: !settings.autoRead });
                    setSettings(updated);
                  }}
                >
                  {settings.autoRead ? 'On' : 'Off'}
                </Button>
              </div>

              {/* Speed Control */}
              <div className="space-y-2">
                <Label htmlFor="speed">Speed: {settings.speed}x</Label>
                <Input
                  id="speed"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={settings.speed}
                  onChange={(e) => {
                    const newSpeed = parseFloat(e.target.value);
                    const updated = updateTTSSettings({ speed: newSpeed });
                    setSettings(updated);
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>0.5x (Slow)</span>
                  <span>1.0x (Normal)</span>
                  <span>2.0x (Fast)</span>
                </div>
              </div>
            </>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface TTSMenuButtonProps {
  onOpenSettings: () => void;
}

export function TTSMenuButton({ onOpenSettings }: TTSMenuButtonProps) {
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
        <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700">
          Text-to-Speech
        </div>

        <DropdownMenuItem onClick={onOpenSettings}>
          <Settings className="w-4 h-4 mr-2 text-slate-400" />
          <span>Settings</span>
        </DropdownMenuItem>

        {settings.enabled && (
          <>
            <DropdownMenuSeparator />
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
          </>
        )}

        <DropdownMenuSeparator />
        <div className="px-3 py-1 text-xs text-slate-500">
          Status: {available === true ? (
            <span className="text-green-400">Connected</span>
          ) : available === false ? (
            <span className="text-red-400">Unavailable</span>
          ) : (
            <span className="text-slate-400">Off</span>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
