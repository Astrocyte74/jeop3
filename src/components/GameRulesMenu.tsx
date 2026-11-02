import { Users } from 'lucide-react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { setGameRules, useGameRules, type TurnMode } from '@/lib/gameRules';

/** In-game "Game rules" submenu: turn order, wrong-answer penalty and steals. */
export function GameRulesMenu() {
  const rules = useGameRules();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Users className="w-4 h-4 mr-2" />
        <span>Game rules</span>
        <span className="ml-auto text-xs text-slate-500">{rules.turnMode === 'rotate' ? 'Take turns' : 'Winner picks'}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={5} className="w-64">
        <DropdownMenuLabel>Who picks next</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={rules.turnMode} onValueChange={(v) => setGameRules({ turnMode: v as TurnMode })}>
          <DropdownMenuRadioItem value="rotate">Take turns after every clue</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="winner">Winner picks next</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={rules.wrongAnswerPenalty}
          onCheckedChange={(v) => setGameRules({ wrongAnswerPenalty: v === true })}
          onSelect={(e) => e.preventDefault()}
        >
          Wrong answers lose points
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={rules.allowSteal}
          onCheckedChange={(v) => setGameRules({ allowSteal: v === true })}
          onSelect={(e) => e.preventDefault()}
        >
          Other teams can steal
        </DropdownMenuCheckboxItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
