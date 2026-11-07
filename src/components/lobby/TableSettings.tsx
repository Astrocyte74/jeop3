import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { Settings2, X, Check, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { themes, type ThemeKey, type IconSize } from '@/lib/themes';
import { lobbyVars } from './gameInfo';
import { isSfxMuted, setSfxMuted, playSfx } from '@/lib/sfx';
import { setGameRules, useGameRules, type TurnMode } from '@/lib/gameRules';
import { setIconsEnabled, useIconsEnabled } from '@/lib/iconSettings';

const ICON_SIZES: Array<{ size: IconSize; note: string }> = [
  { size: '128', note: 'Fastest' },
  { size: '256', note: 'Light' },
  { size: '512', note: 'Balanced' },
  { size: '1024', note: 'Sharpest' },
];

interface TableSettingsProps {
  currentTheme: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
  iconSize: IconSize;
  onIconSizeChange: (size: IconSize) => void;
}

function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="m-0 text-sm font-semibold text-white">{children}</h3>
      {hint && <p className="m-0 mt-0.5 text-xs text-white/55">{hint}</p>}
    </div>
  );
}

/** One place for everything about how the table looks and sounds. */
export function TableSettings({ currentTheme, onThemeChange, iconSize, onIconSizeChange }: TableSettingsProps) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => isSfxMuted());
  const rules = useGameRules();
  const iconsEnabled = useIconsEnabled();

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setSfxMuted(next);
    if (!next) playSfx('correct');
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm" className="h-10 gap-2 px-3 text-white/85 hover:bg-white/10 hover:text-white">
          <Settings2 className="size-4" />
          <span>Table settings</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          style={lobbyVars(themes[currentTheme])}
          className="lobby-settings fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-7 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="lobby-display m-0 text-3xl">Table settings</Dialog.Title>
              <Dialog.Description className="m-0 mt-1 text-sm text-white/60">
                Look and sound for this device. Changes apply right away.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close settings" className="text-white/70 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>

          <section className="mb-7">
            <SectionTitle hint="Colours for the board and this lobby.">Theme</SectionTitle>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.entries(themes) as Array<[ThemeKey, (typeof themes)[ThemeKey]]>).map(([key, t]) => {
                const active = currentTheme === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onThemeChange(key)}
                    className={`lobby-theme-thumb group text-left ${active ? 'is-active' : ''}`}
                    style={{ ['--t-accent' as string]: t.accent }}
                  >
                    <span
                      className="relative block h-[4.25rem] overflow-hidden rounded-lg"
                      style={{ background: `linear-gradient(135deg, ${t.bgStart}, ${t.bgMid} 55%, ${t.bgEnd})` }}
                    >
                      <span className="absolute inset-x-2 top-2 grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className="h-3 rounded-[3px]" style={{ background: `linear-gradient(145deg, ${t.primary}, ${t.secondary})`, boxShadow: '0 0 0 1px rgba(255,255,255,0.14)' }} />
                        ))}
                      </span>
                      <span className="absolute inset-x-2 top-[1.65rem] grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className="h-2.5 rounded-[2px]" style={{ background: i === 1 ? 'rgba(255,255,255,0.08)' : `${t.primary}`, opacity: i === 1 ? 1 : 0.7 }} />
                        ))}
                      </span>
                      <span className="absolute bottom-2 left-2 h-1.5 w-10 rounded-full" style={{ background: t.accent }} />
                      {active && (
                        <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full" style={{ background: t.accent, color: '#111' }}>
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 block text-sm font-medium text-white/90">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-7">
            <SectionTitle hint="How turns and points work. Applies to every board; change it any time from the game's settings.">
              Game rules
            </SectionTitle>
            <div role="radiogroup" aria-label="Who picks next" className="mb-3 grid gap-2 sm:grid-cols-2">
              {([
                ['rotate', 'Take turns', 'The pick passes to the next team after every clue. Best for a class.'],
                ['winner', 'Winner picks', 'Answer correctly and you choose again, like the TV show.'],
              ] as Array<[TurnMode, string, string]>).map(([mode, title, note]) => {
                const on = rules.turnMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setGameRules({ turnMode: mode })}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${on ? 'border-[var(--lb-accent)] bg-white/10' : 'border-white/12 bg-black/20 hover:bg-white/5'}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {on && <Check className="size-4 text-[var(--lb-accent)]" />}
                      {title}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/60">{note}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['wrongAnswerPenalty', 'Wrong answers lose points', rules.wrongAnswerPenalty],
                ['allowSteal', 'Other teams can steal', rules.allowSteal],
              ] as const).map(([key, label, on]) => (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => setGameRules({ [key]: !on })}
                  className="flex items-center justify-between rounded-xl border border-white/12 bg-black/20 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
                >
                  {label}
                  <span className={`lobby-switch ${on ? 'is-on' : ''}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <div className="mb-7">
            <section>
              <SectionTitle hint="Chimes and reveals during play.">Sound effects</SectionTitle>
              <button
                type="button"
                role="switch"
                aria-checked={!muted}
                onClick={toggleSound}
                className="flex w-full items-center justify-between rounded-xl border border-white/12 bg-black/20 px-4 py-3 text-left transition-colors hover:bg-white/5"
              >
                <span className="flex items-center gap-3 text-sm">
                  {muted ? <VolumeX className="size-5 text-white/50" /> : <Volume2 className="size-5 text-[var(--lb-accent)]" />}
                  {muted ? 'Muted' : 'On'}
                </span>
                <span className={`lobby-switch ${muted ? '' : 'is-on'}`} aria-hidden="true" />
              </button>
            </section>
          </div>

          <section>
            <SectionTitle hint="Pictures appear only after you reveal the answer.">Answer icons</SectionTitle>
            <button
              type="button"
              role="switch"
              aria-label="Show answer icons"
              aria-checked={iconsEnabled}
              onClick={() => setIconsEnabled(!iconsEnabled)}
              className="mb-4 flex w-full items-center justify-between rounded-xl border border-white/12 bg-black/20 px-4 py-3 text-left text-sm hover:bg-white/5"
            >
              Show answer icons
              <span className={`lobby-switch ${iconsEnabled ? 'is-on' : ''}`} aria-hidden="true" />
            </button>
            <SectionTitle hint="Bigger looks sharper on a TV but loads slower. Uses 1024px if a smaller size is unavailable.">Icon size</SectionTitle>
            <div role="radiogroup" aria-label="Icon size" className="grid grid-cols-4 gap-2">
              {ICON_SIZES.map(({ size, note }) => {
                const active = iconSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onIconSizeChange(size)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active ? 'border-[var(--lb-accent)] bg-white/10' : 'border-white/12 bg-black/20 hover:bg-white/5'
                    }`}
                  >
                    <span className="block text-sm font-semibold tabular-nums">{size} px</span>
                    <span className="block text-xs text-white/55">{note}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
