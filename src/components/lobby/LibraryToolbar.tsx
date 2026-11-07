import { Search, ArrowUpDown, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type GameSort = 'newest' | 'oldest' | 'recentlyPlayed' | 'mostPlayed' | 'inProgress' | 'notStarted' | 'completed';
export type StatusFilter = 'all' | 'inProgress' | 'new' | 'done';

const SORTS: Array<{ key: GameSort; label: string }> = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'recentlyPlayed', label: 'Recently Played' },
  { key: 'mostPlayed', label: 'Most Played' },
  { key: 'inProgress', label: 'In Progress First' },
  { key: 'notStarted', label: 'Not Started First' },
  { key: 'completed', label: '% Completed' },
];

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'new', label: 'Not started' },
  { key: 'done', label: 'Finished' },
];

interface LibraryToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sort: GameSort;
  onSortChange: (s: GameSort) => void;
  filter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

/** Search, status filter chips and the sort menu for the game shelf. */
export function LibraryToolbar({ searchQuery, onSearchChange, sort, onSortChange, filter, onFilterChange, counts }: LibraryToolbarProps) {
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? 'Sort';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm min-w-[14rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
        <input
          type="search"
          placeholder="Search games..."
          aria-label="Search games"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-white/15 bg-black/25 pl-9 pr-9 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[var(--lb-accent)] [&::-webkit-search-cancel-button]:hidden"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div role="group" aria-label="Filter by progress" className="flex items-center gap-1 rounded-lg bg-black/25 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => onFilterChange(f.key)}
            className={`h-8 rounded-md px-3 text-sm transition-colors ${
              filter === f.key ? 'bg-white/15 font-medium text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {f.label}
            {counts[f.key] > 0 && <span className="ml-1.5 text-xs tabular-nums text-white/40">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 gap-2 px-3 text-white/75 hover:bg-white/10 hover:text-white">
            <ArrowUpDown className="size-4" />
            {sortLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="border-b border-slate-700 px-3 py-2 text-xs text-slate-500">Sort by</div>
          {SORTS.map((s) => (
            <DropdownMenuItem key={s.key} onClick={() => onSortChange(s.key)} className={sort === s.key ? 'bg-yellow-500/10' : ''}>
              <span className="flex-1">{s.label}</span>
              {sort === s.key && <Check className="ml-auto size-3.5 text-yellow-500" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
