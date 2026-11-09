import { DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { setGameRules, useGameRules, type TurnMode } from '@/lib/gameRules';
import { TIMER_OPTIONS } from '@/lib/clueTimerSettings';
import './tableRuleControls.css';

/** Use menu semantics inside Radix menus and native buttons inside the clue popover. */
function Choices({ label, value, choices, onChange, menu = false }: {
  label: string; value: string; choices: { value: string; label: string; accessibleLabel?: string }[];
  onChange: (value: string) => void; menu?: boolean;
}) {
  const items = choices.map((choice) => menu ? (
    <DropdownMenuRadioItem key={choice.value} value={choice.value} className="table-choice"
      aria-label={choice.accessibleLabel} onSelect={(e) => e.preventDefault()}>
      {choice.label}
    </DropdownMenuRadioItem>
  ) : (
    <button key={choice.value} type="button" className="table-choice" aria-pressed={value === choice.value}
      aria-label={choice.accessibleLabel} onClick={() => onChange(choice.value)}>{choice.label}</button>
  ));
  return (
    <div>
      <div className="table-settings-label">{label}</div>
      {menu ? <DropdownMenuRadioGroup aria-label={label} value={value} onValueChange={onChange} className="table-choices">{items}</DropdownMenuRadioGroup>
        : <div role="group" aria-label={label} className="table-choices">{items}</div>}
    </div>
  );
}

export function TableRuleControls({ menu = false, dailyDouble = false }: { menu?: boolean; dailyDouble?: boolean }) {
  const rules = useGameRules();
  return (
    <div className="table-rule-controls">
      <Choices label="Who picks next" value={rules.turnMode} menu={menu}
        choices={[{ value: 'rotate', label: 'Take turns' }, { value: 'winner', label: 'Winner picks' }]}
        onChange={(value) => setGameRules({ turnMode: value as TurnMode })} />
      {([
        ['allowSteal', 'Allow steals'],
        ['wrongAnswerPenalty', 'Wrong-answer penalty'],
      ] as const).map(([key, label]) => menu ? (
        <DropdownMenuCheckboxItem key={key} className="table-rule-toggle" checked={rules[key]}
          onCheckedChange={(value) => setGameRules({ [key]: value === true })} onSelect={(e) => e.preventDefault()}>
          <span>{label}</span><span className="table-toggle-state">{rules[key] ? 'On' : 'Off'}</span>
        </DropdownMenuCheckboxItem>
      ) : (
        <button key={key} type="button" role="switch" aria-label={label} aria-checked={rules[key]}
          className="table-rule-toggle" disabled={dailyDouble} onClick={() => setGameRules({ [key]: !rules[key] })}>
          <span>{label}</span><span className="table-toggle-state">{rules[key] ? 'On' : 'Off'}</span>
        </button>
      ))}
      <p className="table-settings-note">{dailyDouble ? 'Daily Doubles always use the wager, with no steals.'
        : 'Applies across clues. Steals end when the answer is shown.'}</p>
    </div>
  );
}

export function TimerControls({ seconds, onChange, menu = false }: { seconds: number; onChange: (seconds: number) => void; menu?: boolean }) {
  return <Choices label="Think timer" value={String(seconds)} menu={menu} onChange={(value) => onChange(Number(value))}
    choices={TIMER_OPTIONS.map((value) => ({ value: String(value), label: value === 0 ? 'Off' : `${value}s`,
      accessibleLabel: value === 0 ? 'Timer off' : `${value} seconds` }))} />;
}
