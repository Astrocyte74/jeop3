import { Users, Timer } from 'lucide-react';
import { DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { TableRuleControls, TimerControls } from '@/components/TableRuleControls';
import { useGameRules } from '@/lib/gameRules';
import { setClueTimerSecs, useClueTimerSecs } from '@/lib/clueTimerSettings';

export function GameRulesMenu() {
  const rules = useGameRules();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Users className="w-4 h-4 mr-2" />
        <span>Game rules</span>
        <span className="ml-auto text-xs text-slate-400">{rules.turnMode === 'rotate' ? 'Take turns' : 'Winner picks'}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={5} className="w-80 p-4">
        <TableRuleControls menu />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function ThinkTimerMenu() {
  const seconds = useClueTimerSecs();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Timer className="w-4 h-4 mr-2" />
        <span>Think timer</span>
        <span className="ml-auto text-xs text-slate-400">{seconds === 0 ? 'Off' : `${seconds}s`}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={5} className="w-80 p-4">
        <TimerControls seconds={seconds} onChange={setClueTimerSecs} menu />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
