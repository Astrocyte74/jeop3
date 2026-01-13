import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { GameMeta, Team } from '@/lib/storage';
import { loadCustomGames, getSelectedGameId } from '@/lib/storage';
import { themes, applyTheme, getStoredTheme, type ThemeKey } from '@/lib/themes';
import { Gamepad2, Users, Sparkles, Palette, Settings } from 'lucide-react';

interface MainMenuProps {
  onSelectGame: (gameId: string, game: any) => void;
  onOpenEditor: () => void;
}

export function MainMenu({ onSelectGame, onOpenEditor }: MainMenuProps) {
  const [games, setGames] = useState<GameMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([
    { id: '1', name: 'Team 1', score: 0 },
    { id: '2', name: 'Team 2', score: 0 },
  ]);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(getStoredTheme());
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const response = await fetch('/games/index.json');
      const data = await response.json();
      const indexGames: GameMeta[] = (data.games || []).map((g: any) => ({
        ...g,
        source: 'index' as const,
      }));

      // Load game data for each index game
      const gamesWithData = await Promise.all(
        indexGames.map(async (g) => {
          try {
            const gameResponse = await fetch(`/${g.path}`);
            const gameData = await gameResponse.json();
            return { ...g, game: gameData };
          } catch {
            return g;
          }
        })
      );

      const customGames = loadCustomGames();
      const allGames = [...gamesWithData, ...customGames];
      setGames(allGames);

      // Auto-select the last selected game
      const lastSelectedId = getSelectedGameId();
      if (lastSelectedId && allGames.find((g) => g.id === lastSelectedId)) {
        setSelectedGameId(lastSelectedId);
      } else if (allGames.length > 0) {
        // If no previous selection, select the first game
        setSelectedGameId(allGames[0].id);
      }
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  };

  const filteredGames = games.filter((game) =>
    game.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddTeam = () => {
    const newId = String(teams.length + 1);
    setTeams([...teams, { id: newId, name: `Team ${teams.length + 1}`, score: 0 }]);
  };

  const handleUpdateTeamName = (id: string, name: string) => {
    setTeams(teams.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleRemoveTeam = (id: string) => {
    if (teams.length <= 1) return;
    setTeams(teams.filter((t) => t.id !== id));
  };

  const handleThemeChange = (themeKey: ThemeKey) => {
    setCurrentTheme(themeKey);
    applyTheme(themeKey);
    setShowThemePicker(false);
  };

  const handleStartGame = () => {
    if (!selectedGameId) return;

    const game = games.find((g) => g.id === selectedGameId);
    if (!game) return;

    // Remember this selection for next time
    setSelectedGameId(selectedGameId);
    onSelectGame(selectedGameId, game.game);
  };

  const currentThemeData = themes[currentTheme];

  return (
    <div
      className="min-h-screen p-6 transition-all duration-500"
      style={{
        background: `linear-gradient(135deg, ${currentThemeData.bgStart} 0%, ${currentThemeData.bgMid} 50%, ${currentThemeData.bgEnd} 100%)`,
      }}
    >
      {/* Animated background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse"
             style={{ background: `${currentThemeData.accent}20` }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse delay-1000"
             style={{ background: `${currentThemeData.primary}20` }} />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mb-2">
            JEOPARDY
          </h1>
          <p className="text-slate-400 text-lg">The Ultimate Quiz Experience</p>
        </header>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Games panel */}
          <div className="lg:col-span-1 bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold">Select Game</h2>
              </div>
              <Badge variant="outline" className="text-xs">
                {filteredGames.length} games
              </Badge>
            </div>

            <Input
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4 bg-slate-800/50 border-slate-700"
            />

            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {filteredGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => {
                    setSelectedGameId(game.id);
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedGameId === game.id
                      ? 'bg-yellow-500/20 border-yellow-500/50'
                      : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-medium text-sm">{game.title}</div>
                  {game.subtitle && (
                    <div className="text-xs text-slate-400 mt-1">{game.subtitle}</div>
                  )}
                </button>
              ))}
            </div>

            <Button
              onClick={onOpenEditor}
              variant="outline"
              className="w-full mt-4 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Game Creator
            </Button>
          </div>

          {/* Center panel - Start game */}
          <div className="lg:col-span-1 flex flex-col items-center justify-center">
            <Button
              onClick={handleStartGame}
              disabled={!selectedGameId}
              size="lg"
              className="w-full max-w-xs h-32 text-xl font-bold bg-gradient-to-br from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black shadow-lg shadow-yellow-500/20"
            >
              START GAME
            </Button>

            <div className="mt-6 flex gap-2">
              <Button
                onClick={() => setShowThemePicker(!showThemePicker)}
                variant="outline"
                size="sm"
                className="border-slate-700"
              >
                <Palette className="w-4 h-4 mr-2" />
                Theme
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>

            {/* Theme picker */}
            {showThemePicker && (
              <div className="mt-4 p-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-lg w-full max-w-xs">
                <h3 className="text-sm font-medium mb-3">Choose Theme</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(themes).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => handleThemeChange(key as ThemeKey)}
                      className={`text-xs p-3 rounded-lg border-2 transition-all font-medium ${
                        currentTheme === key
                          ? 'border-yellow-500 ring-2 ring-yellow-500/50'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                        color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      <div>{theme.name}</div>
                      {currentTheme === key && (
                        <div className="text-xs opacity-75 mt-1">✓ Active</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Teams panel */}
          <div className="lg:col-span-1 bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-yellow-500" />
              <h2 className="text-lg font-semibold">Teams</h2>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {teams.map((team) => (
                <div key={team.id} className="flex items-center gap-2">
                  <Input
                    value={team.name}
                    onChange={(e) => handleUpdateTeamName(team.id, e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                  />
                  {teams.length > 1 && (
                    <Button
                      onClick={() => handleRemoveTeam(team.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={handleAddTeam}
              variant="outline"
              className="w-full mt-4 border-slate-700"
              disabled={teams.length >= 6}
            >
              + Add Team
            </Button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-slate-500">
          Jeop3 v3.0 • Built with React + shadcn/ui
        </footer>
      </div>
    </div>
  );
}
