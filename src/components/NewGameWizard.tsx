/**
 * New Game Wizard Dialog
 *
 * Simplified game creation with tabbed interface:
 * - AI: Add sources to generate categories with AI
 * - Manual: Create all content manually
 * - Import: Load from JSON file
 */

import { useState, useEffect, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Wand2, ArrowLeft, Sparkles, ChevronDown, FileText, Globe, Zap, Edit, AlertCircle, RefreshCw, Plus, Trash2, Loader2, Upload, Info } from 'lucide-react';
import { getAIApiBase, fetchArticleContent } from '@/lib/ai/service';
import { useAuth } from '@/lib/auth';
import { getModelStats, formatTime, getModelsBySpeed, getCostEstimate, initializePricing } from '@/lib/ai/stats';

// Custom source type for per-category sources
export interface CustomSource {
  id: string;
  type: 'topic' | 'paste' | 'url';
  topic?: string;
  content?: string;
  url?: string;
  categoryCount: number;
  fetchedContent?: string; // For URL sources after fetching
}

export interface WizardStep {
  type: 'creation-mode' | 'manual-confirm' | 'source' | 'custom-categories' | 'theme' | 'difficulty';
  creationMode?: 'ai' | 'manual' | 'import-json';
  sourceMode?: 'scratch' | 'paste' | 'url' | 'custom';
  referenceMaterial?: string;
  referenceUrl?: string;
  customSources?: CustomSource[];
  theme?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

export interface WizardCompleteData {
  mode: 'ai' | 'manual' | 'import-json';
  // AI mode fields
  theme?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  sourceMode?: 'scratch' | 'paste' | 'url' | 'custom';
  referenceMaterial?: string;
  referenceUrl?: string;
  customSources?: CustomSource[];
}

interface NewGameWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (data: WizardCompleteData) => void;
  onOpenEditor?: () => void;
  onImportJSON?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const difficultyOptions = [
  {
    value: 'easy' as const,
    icon: '🟢',
    title: 'Easy',
    desc: 'Accessible, well-known facts - great for beginners'
  },
  {
    value: 'normal' as const,
    icon: '🟡',
    title: 'Normal',
    desc: 'Balanced mix - a fun challenge for everyone'
  },
  {
    value: 'hard' as const,
    icon: '🔴',
    title: 'Hard',
    desc: 'Niche details and deep cuts - for trivia experts'
  }
];

const MIN_CHARS = 40;
const MAX_CHARS = 100000;

// Curated list of interesting Jeopardy topics for instant inspiration
const RANDOM_JEOPARDY_TOPICS = [
  // History & Culture
  "Ancient Egyptian Pharaohs",
  "The Silk Road Trade Routes",
  "Harlem Renaissance",
  "The Industrial Revolution",
  "Mayan Civilization",
  "The Byzantine Empire",
  "The Space Race",
  "The Cold War",
  "The Renaissance Art Period",
  "The Gold Rush Era",

  // Science & Nature
  "Quantum Mechanics",
  "The Periodic Table of Elements",
  "Volcanoes and Plate Tectonics",
  "The Human Body Systems",
  "Ocean Marine Life",
  "Astronomy and Constellations",
  "The Theory of Evolution",
  "Genetics and DNA",
  "Climate Change",
  "Renewable Energy Sources",

  // Geography
  "The Seven Wonders of the World",
  "African Geography",
  "The Amazon Rainforest",
  "The Great Barrier Reef",
  "European Capitals",
  "US National Parks",
  "The Himalayan Mountains",
  "Island Nations of the World",
  "The Mississippi River",
  "Deserts of the World",

  // Literature & Arts
  "Shakespeare's Plays",
  "Greek Mythology",
  "Nobel Prize Winners",
  "Classic American Novelists",
  "Famous Painters",
  "Musical Composers",
  "The Beatles Catalog",
  "Broadway Musicals",
  "Science Fiction Literature",
  "Pulitzer Prize Winners",

  // Sports & Entertainment
  "Olympic History",
  "Baseball Statistics",
  "World Cup Soccer",
  "NBA Championship Teams",
  "James Bond Films",
  "Disney Animated Classics",
  "Superheroes in Comics",
  "Famous TV Sitcoms",
  "Video Game Franchises",
  "Academy Award Best Pictures",

  // Technology & Innovation
  "The Internet History",
  "Social Media Platforms",
  "Artificial Intelligence",
  "Smartphone Technology",
  "Electric Vehicles",
  "NASA Missions",
  "Computer Programming Languages",
  "Famous Inventors",
  "Medical Breakthroughs",
  "Cryptocurrency"
];

// Curated list of interesting Wikipedia articles
const RANDOM_WIKIPEDIA_ARTICLES = [
  "https://en.wikipedia.org/wiki/Ancient_Egypt",
  "https://en.wikipedia.org/wiki/Quantum_mechanics",
  "https://en.wikipedia.org/wiki/Silk_Road",
  "https://en.wikipedia.org/wiki/Harlem_Renaissance",
  "https://en.wikipedia.org/wiki/Industrial_Revolution",
  "https://en.wikipedia.org/wiki/Maya_civilization",
  "https://en.wikipedia.org/wiki/Space_Race",
  "https://en.wikipedia.org/wiki/Cold_War",
  "https://en.wikipedia.org/wiki/Renaissance_art",
  "https://en.wikipedia.org/wiki/Periodic_table",
  "https://en.wikipedia.org/wiki/Volcano",
  "https://en.wikipedia.org/wiki/Human_body",
  "https://en.wikipedia.org/wiki/Great_Barrier_Reef",
  "https://en.wikipedia.org/wiki/Amazon_rainforest",
  "https://en.wikipedia.org/wiki/Seven_Wonders_of_the_Ancient_World",
  "https://en.wikipedia.org/wiki/William_Shakespeare",
  "https://en.wikipedia.org/wiki/Greek_mythology",
  "https://en.wikipedia.org/wiki/Nobel_Prize",
  "https://en.wikipedia.org/wiki/Olympic_Games",
  "https://en.wikipedia.org/wiki/Major_League_Baseball",
  "https://en.wikipedia.org/wiki/FIFA_World_Cup",
  "https://en.wikipedia.org/wiki/James_Bond",
  "https://en.wikipedia.org/wiki/The_Beatles",
  "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "https://en.wikipedia.org/wiki/NASA",
  "https://en.wikipedia.org/wiki/History_of_the_Internet",
  "https://en.wikipedia.org/wiki/Solar_System",
  "https://en.wikipedia.org/wiki/Climate_change",
  "https://en.wikipedia.org/wiki/Evolution",
  "https://en.wikipedia.org/wiki/DNA",
  "https://en.wikipedia.org/wiki/Seven_Wonders_of_the_World",
  "https://en.wikipedia.org/wiki/Mount_Everest",
  "https://en.wikipedia.org/wiki/Grand_Canyon",
  "https://en.wikipedia.org/wiki/Niagara_Falls",
  "https://en.wikipedia.org/wiki/African_elephant",
  "https://en.wikipedia.org/wiki/Great_White_Shark",
  "https://en.wikipedia.org/wiki/Blue_whale",
  "https://en.wikipedia.org/wiki/Polar_bear",
  "https://en.wikipedia.org/wiki/Golden_eagle",
  "https://en.wikipedia.org/wiki/American_Civil_War",
  "https://en.wikipedia.org/wiki/French_Revolution",
  "https://en.wikipedia.org/wiki/Roman_Empire",
  "https://en.wikipedia.org/wiki/Alexander_the_Great",
  "https://en.wikipedia.org/wiki/Julius_Caesar",
  "https://en.wikipedia.org/wiki/Cleopatra",
  "https://en.wikipedia.org/wiki/Leonardo_da_Vinci",
  "https://en.wikipedia.org/wiki/Michelangelo",
  "https://en.wikipedia.org/wiki/Wolfgang_Amadeus_Mozart",
  "https://en.wikipedia.org/wiki/Ludwig_van_Beethoven",
  "https://en.wikipedia.org/wiki/Johann_Sebastian_Bach",
  "https://en.wikipedia.org/wiki/Albert_Einstein",
  "https://en.wikipedia.org/wiki/Marie_Curie",
  "https://en.wikipedia.org/wiki/Isaac_Newton",
  "https://en.wikipedia.org/wiki/Charles_Darwin",
  "https://en.wikipedia.org/wiki/Stephen_Hawking",
  "https://en.wikipedia.org/wiki/Jane_Austen",
  "https://en.wikipedia.org/wiki/Mark_Twain",
  "https://en.wikipedia.org/wiki/Ernest_Hemingway",
  "https://en.wikipedia.org/wiki/George_Orwell",
  "https://en.wikipedia.org/wiki/Agatha_Christie",
  "https://en.wikipedia.org/wiki/Stanley_Kubrick",
  "https://en.wikipedia.org/wiki/Alfred_Hitchcock",
  "https://en.wikipedia.org/wiki/Steven_Spielberg",
  "https://en.wikipedia.org/wiki/Martin_Scorsese",
  "https://en.wikipedia.org/wiki/Quentin_Tarantino"
];

// Simple URL validation helper
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export function NewGameWizard({ open, onClose, onComplete, onOpenEditor, onImportJSON, isLoading = false, error }: NewGameWizardProps) {
  // Clerk auth - needed for fetch-article endpoint
  const { getToken } = useAuth();

  // Tab state: 'ai', 'manual', 'import'
  const [activeTab, setActiveTab] = useState<'ai' | 'manual' | 'import'>('ai');

  // Step state for AI mode flow
  const [step, setStep] = useState<'sources' | 'theme' | 'difficulty'>('sources');

  // AI mode state
  const [customSources, setCustomSources] = useState<CustomSource[]>([]);
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');

  // Current source being added
  const [currentSourceType, setCurrentSourceType] = useState<'topic' | 'paste' | 'url'>('topic');
  const [currentSourceContent, setCurrentSourceContent] = useState('');
  const [currentSourceCategoryCount, setCurrentSourceCategoryCount] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
  const [fetchError, setFetchError] = useState('');
  const [sourceInputError, setSourceInputError] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourcesListRef = useRef<HTMLDivElement>(null);

  // Load available AI models on mount
  useEffect(() => {
    const apiBase = getAIApiBase();
    fetch(`${apiBase}/health`)
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setAvailableModels(data.models);
          const stored = localStorage.getItem('jeop3:aiModel');
          if (stored && data.models.find((m: any) => m.id === stored)) {
            setAIModel(stored);
          } else if (data.models.length > 0) {
            setAIModel(data.models[0].id);
          }
        }
        // Initialize pricing from OpenRouter (async, non-blocking)
        initializePricing().catch(err => {
          if (import.meta.env.DEV) {
            console.warn('Failed to initialize AI model pricing:', err);
          }
        });
      })
      .catch(() => {
        // Silent fail - AI features will be disabled
        if (import.meta.env.DEV) {
          console.warn('AI server not available - AI features disabled');
        }
      });
  }, []);

  // Reset state and auto-focus when wizard opens
  useEffect(() => {
    if (open) {
      setActiveTab('ai');
      setStep('sources');
      setCustomSources([]);
      setTheme('');
      setDifficulty('normal');
      setCurrentSourceType('topic');
      setCurrentSourceContent('');
      setCurrentSourceCategoryCount(6);
      setIsFetching(false);
      setFetchError('');
      setSourceInputError('');
      // Auto-focus the input after a small delay to ensure the dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // ==================== AI Model Selection ====================
  const handleAIModelChange = (modelId: string) => {
    setAIModel(modelId);
    localStorage.setItem('jeop3:aiModel', modelId);
  };

  const formatModelName = (modelId?: string): string => {
    if (!modelId) return 'Unknown';
    const parts = modelId.split(':');
    const provider = parts[0];
    const modelName = parts.slice(1).join(':');
    if (provider === 'or' || provider === 'openrouter') {
      return `🤖 ${modelName}`;
    } else if (provider === 'ollama') {
      return `🦙 ${modelName}`;
    }
    return modelName;
  };

  // ==================== Source Management ====================
  const getTotalCategoryCount = () => {
    return customSources.reduce((sum, source) => sum + source.categoryCount, 0);
  };

  const getRemainingCategories = () => {
    return 6 - getTotalCategoryCount();
  };

  const getDisplayLabel = (source: CustomSource): string => {
    if (source.type === 'topic') return `Topic: "${source.topic}"`;
    if (source.type === 'paste') return `Pasted Content (${source.content?.length.toLocaleString() || 0} chars)`;
    if (source.type === 'url') {
      const url = source.url || '';
      try {
        const hostname = new URL(url).hostname;
        return `URL: ${hostname}`;
      } catch {
        return `URL: ${url.substring(0, 30)}...`;
      }
    }
    return 'Unknown source';
  };

  // Auto-adjust category count if it exceeds remaining categories
  useEffect(() => {
    const remaining = getRemainingCategories();
    if (currentSourceCategoryCount > remaining && remaining > 0) {
      setCurrentSourceCategoryCount(remaining as 1 | 2 | 3 | 4 | 5 | 6);
    }
  }, [customSources]);

  // Validate current source input
  const validateCurrentSource = (): boolean => {
    setSourceInputError('');
    if (currentSourceType === 'topic' && !currentSourceContent.trim()) {
      setSourceInputError('Please enter a topic');
      return false;
    }
    if (currentSourceType === 'paste' && currentSourceContent.trim().length < MIN_CHARS) {
      setSourceInputError(`Please enter at least ${MIN_CHARS} characters`);
      return false;
    }
    if (currentSourceType === 'url' && !currentSourceContent.trim()) {
      setSourceInputError('Please enter a URL');
      return false;
    }
    if (currentSourceType === 'url' && currentSourceContent.trim() && !isValidUrl(currentSourceContent.trim())) {
      setSourceInputError('Please enter a valid URL (e.g., https://en.wikipedia.org/wiki/Topic)');
      return false;
    }
    return true;
  };

  // Scroll to sources list after adding
  const scrollToSourcesList = () => {
    setTimeout(() => {
      sourcesListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  // Add current source to the list
  const handleAddSourceToList = async () => {
    if (!validateCurrentSource()) return;

    const newSource: CustomSource = {
      id: crypto.randomUUID(),
      type: currentSourceType,
      categoryCount: currentSourceCategoryCount,
    };

    if (currentSourceType === 'topic') {
      newSource.topic = currentSourceContent.trim();
      setCustomSources([...customSources, newSource]);
      resetCurrentSource(newSource.categoryCount);
      scrollToSourcesList();
    } else if (currentSourceType === 'paste') {
      newSource.content = currentSourceContent.trim();
      setCustomSources([...customSources, newSource]);
      resetCurrentSource(newSource.categoryCount);
      scrollToSourcesList();
    } else if (currentSourceType === 'url') {
      setIsFetching(true);
      setFetchError('');
      try {
        const authToken = await getToken().catch(() => null);
        const result = await fetchArticleContent(currentSourceContent.trim(), authToken);
        if (result.success && result.text) {
          newSource.url = currentSourceContent.trim();
          newSource.fetchedContent = result.text;
          setCustomSources([...customSources, newSource]);
          resetCurrentSource(newSource.categoryCount);
          scrollToSourcesList();
        } else {
          setFetchError(result.error || 'Failed to fetch content from URL');
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch content');
      } finally {
        setIsFetching(false);
      }
    }
  };

  // Reset current source input for next entry
  // addedSourceCount is the category count of the source being added (if any)
  const resetCurrentSource = (addedSourceCount?: number) => {
    setCurrentSourceContent('');
    // Calculate remaining categories based on what the state WILL be after adding the source
    const currentTotal = getTotalCategoryCount();
    const newTotal = addedSourceCount !== undefined ? currentTotal + addedSourceCount : currentTotal;
    const remaining = 6 - newTotal;

    // Determine default: if first source used less than 6, subsequent sources default to 1
    let defaultCount: 1 | 2 | 3 | 4 | 5 | 6;
    if (customSources.length === 0 && addedSourceCount === undefined) {
      // No sources yet, this is for initial state
      defaultCount = 6;
    } else if (customSources.length === 0) {
      // We're adding the first source now, next one should be 1 if this wasn't 6
      defaultCount = addedSourceCount! < 6 ? 1 : 6;
    } else {
      // We already have sources, check the first one
      const firstSourceCount = customSources[0]?.categoryCount ?? 6;
      defaultCount = firstSourceCount < 6 ? 1 : 6;
    }

    // Respect remaining categories limit
    const finalCount = Math.min(defaultCount, Math.max(1, remaining));
    setCurrentSourceCategoryCount(finalCount as 1 | 2 | 3 | 4 | 5 | 6);
    setSourceInputError('');
    setFetchError('');
  };

  const handleRemoveSource = (id: string) => {
    setCustomSources(customSources.filter(s => s.id !== id));
  };

  // ==================== Random Topic / URL Generation ====================
  const handleGenerateRandomTopic = () => {
    // Pick a random topic from curated list
    const randomTopic = RANDOM_JEOPARDY_TOPICS[Math.floor(Math.random() * RANDOM_JEOPARDY_TOPICS.length)];
    setCurrentSourceContent(randomTopic);
    // Brief animation effect
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRandomWikipediaURL = () => {
    // Pick a random Wikipedia article from curated list
    const randomURL = RANDOM_WIKIPEDIA_ARTICLES[Math.floor(Math.random() * RANDOM_WIKIPEDIA_ARTICLES.length)];
    setCurrentSourceContent(randomURL);
    // Brief animation effect
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ==================== Navigation ====================
  const handleBack = () => {
    if (step === 'theme') {
      setStep('sources');
    } else if (step === 'difficulty') {
      setStep('theme');
    }
  };

  const handleSourcesNext = () => {
    if (customSources.length === 0) {
      setSourceInputError('Please add at least one source');
      return;
    }
    if (getTotalCategoryCount() === 0) {
      setSourceInputError('Please select at least one category');
      return;
    }
    setStep('theme');
  };

  const handleThemeNext = () => {
    setStep('difficulty');
  };

  const handleComplete = () => {
    onComplete({
      mode: 'ai',
      theme: theme || 'random',
      difficulty,
      sourceMode: 'custom',
      customSources,
    });
    // Reset handled by useEffect on open change
  };

  const handleClose = () => {
    onClose();
    // Reset handled by useEffect on open change
  };

  const handleManualConfirm = () => {
    handleClose();
    onOpenEditor?.();
  };

  const handleImportJSON = () => {
    handleClose();
    onImportJSON?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Wand2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <AlertDialogTitle>Create New Game</AlertDialogTitle>
                <AlertDialogDescription>
                  {activeTab === 'ai' && step === 'sources' && 'Add sources to generate categories with AI'}
                  {activeTab === 'ai' && step === 'theme' && 'Choose a theme for your game'}
                  {activeTab === 'ai' && step === 'difficulty' && 'Select difficulty level'}
                  {activeTab === 'manual' && 'Manually create all game content'}
                  {activeTab === 'import' && 'Import a game from a JSON file'}
                </AlertDialogDescription>
              </div>
            </div>

            {/* AI Model Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-900/50 h-8 px-2"
                  disabled={isLoading}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
                  <span className="text-xs">{formatModelName(aiModel)}</span>
                  <ChevronDown className="w-3 h-3 ml-1 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {availableModels.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <span className="text-slate-500 text-xs">No models available</span>
                  </DropdownMenuItem>
                ) : (
                  <>
                    {/* Performance stats header */}
                    <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700">
                      Performance based on your history
                    </div>

                    {/* OpenRouter section */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <span className="text-blue-400 mr-2">🤖</span>
                        <span>OpenRouter</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto w-56">
                        {availableModels.filter(m => m.provider === 'openrouter').map((model) => {
                          const stats = getModelStats(model.id);
                          const costEstimate = getCostEstimate(model.id);
                          return (
                            <DropdownMenuItem
                              key={model.id}
                              onClick={() => handleAIModelChange(model.id)}
                              className={aiModel === model.id ? 'bg-yellow-500/10' : ''}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{model.name}</span>
                                  {aiModel === model.id && (
                                    <span className="text-xs text-yellow-500 flex-shrink-0">✓</span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                  {stats && (
                                    <span>{formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}</span>
                                  )}
                                  <span className="text-green-400">💰 {costEstimate}</span>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {/* Ollama section */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <span className="text-green-400 mr-2">🦙</span>
                        <span>Ollama</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent sideOffset={5} className="max-h-80 overflow-y-auto w-56">
                        {availableModels.filter(m => m.provider === 'ollama').map((model) => {
                          const stats = getModelStats(model.id);
                          return (
                            <DropdownMenuItem
                              key={model.id}
                              onClick={() => handleAIModelChange(model.id)}
                              className={aiModel === model.id ? 'bg-yellow-500/10' : ''}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{model.name}</span>
                                  {aiModel === model.id && (
                                    <span className="text-xs text-yellow-500 flex-shrink-0">✓</span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                  {stats && (
                                    <span>{formatTime(stats.averageTimeMs)} avg • {stats.count} use{stats.count > 1 ? 's' : ''}</span>
                                  )}
                                  <span className="text-green-400">🆓 Free</span>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Current selection with stats */}
                    <DropdownMenuItem disabled className="focus:bg-transparent">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-500">
                          Selected: {availableModels.find(m => m.id === aiModel)?.provider === 'ollama' ? '🦙' : '🤖'} {availableModels.find(m => m.id === aiModel)?.name || 'None'}
                        </div>
                        {(() => {
                          const stats = aiModel ? getModelStats(aiModel) : null;
                          const fastestModel = getModelsBySpeed()[0];
                          const costEstimate = aiModel ? getCostEstimate(aiModel) : null;
                          const isOllama = availableModels.find(m => m.id === aiModel)?.provider === 'ollama';
                          return (
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {stats && (
                                <span className="text-xs text-slate-600">
                                  Avg: {formatTime(stats.averageTimeMs)} • {stats.count} generated
                                </span>
                              )}
                              {fastestModel && fastestModel.modelId === aiModel && (
                                <span className="text-xs text-green-500">⚡ Fastest</span>
                              )}
                              {costEstimate && !isOllama && (
                                <span className="text-xs text-green-500">💰 {costEstimate}</span>
                              )}
                              {isOllama && (
                                <span className="text-xs text-green-500">🆓 Free</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </AlertDialogHeader>

        {/* Tab Selector */}
        <div className="px-6 pt-2 pb-4 border-b border-slate-700/50">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all border-b-2 ${
                activeTab === 'ai'
                  ? 'border-purple-400 text-slate-200 bg-slate-800/50'
                  : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-slate-800/30'
              }`}
            >
              <Wand2 className="w-4 h-4 inline mr-1.5" />
              AI
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all border-b-2 ${
                activeTab === 'manual'
                  ? 'border-orange-400 text-slate-200 bg-slate-800/50'
                  : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-slate-800/30'
              }`}
            >
              <Edit className="w-4 h-4 inline mr-1.5" />
              Manual
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all border-b-2 ${
                activeTab === 'import'
                  ? 'border-cyan-400 text-slate-200 bg-slate-800/50'
                  : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-slate-800/30'
              }`}
            >
              <Upload className="w-4 h-4 inline mr-1.5" />
              Import
            </button>
          </div>
        </div>

        {/* Progress Indicator - shows selected choices */}
        {activeTab === 'ai' && step !== 'sources' && (
          <div className="px-6 pb-4 border-b border-slate-700/50">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md">
                AI Generate
              </span>
              {customSources.length > 0 && (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded-md">
                  {customSources.length} source{customSources.length !== 1 ? 's' : ''}, {getTotalCategoryCount()} categor{getTotalCategoryCount() !== 1 ? 'ies' : 'y'}
                </span>
              )}
              {step === 'difficulty' && theme && (
                <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">
                  Theme: {theme || 'random'}
                </span>
              )}
              {step === 'difficulty' && (
                <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-md">
                  Difficulty: {difficulty === 'easy' ? 'Easy' : difficulty === 'normal' ? 'Normal' : 'Hard'}
                </span>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
            <p className="text-lg font-medium text-slate-200 mb-2">Generating your game...</p>
            <p className="text-sm text-slate-400">Creating categories and questions with AI</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {/* ==================== AI TAB ==================== */}
            {activeTab === 'ai' && step === 'sources' && (
              <div className="py-4 space-y-5">
                {/* Source type selection */}
                <div className="space-y-3">
                  <Label className="text-sm text-slate-300">Source Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setCurrentSourceType('topic');
                        setCurrentSourceContent('');
                        setSourceInputError('');
                        setFetchError('');
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        currentSourceType === 'topic'
                          ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-lg shadow-purple-500/10'
                          : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500 hover:bg-slate-700/50'
                      }`}
                      title="Generate categories from any topic or theme"
                    >
                      <Zap className="w-5 h-5 mx-auto mb-1.5" />
                      <span className="text-xs font-medium">Topic</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentSourceType('paste');
                        setCurrentSourceContent('');
                        setSourceInputError('');
                        setFetchError('');
                        setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        currentSourceType === 'paste'
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-lg shadow-blue-500/10'
                          : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500 hover:bg-slate-700/50'
                      }`}
                      title="Paste notes, articles, or other content"
                    >
                      <FileText className="w-5 h-5 mx-auto mb-1.5" />
                      <span className="text-xs font-medium">Paste</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentSourceType('url');
                        setCurrentSourceContent('');
                        setSourceInputError('');
                        setFetchError('');
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        currentSourceType === 'url'
                          ? 'bg-green-500/20 border-green-500 text-green-300 shadow-lg shadow-green-500/10'
                          : 'bg-slate-700/30 border-slate-600 text-slate-400 hover:border-slate-500 hover:bg-slate-700/50'
                      }`}
                      title="Fetch content from a webpage"
                    >
                      <Globe className="w-5 h-5 mx-auto mb-1.5" />
                      <span className="text-xs font-medium">URL</span>
                    </button>
                  </div>
                  {/* Type descriptions */}
                  <div className="flex gap-2 text-xs text-slate-500">
                    {currentSourceType === 'topic' && (
                      <p className="bg-purple-500/5 text-purple-300 px-2 py-1 rounded border border-purple-500/10">
                        ⚡ Fastest — just enter a topic name
                      </p>
                    )}
                    {currentSourceType === 'paste' && (
                      <p className="bg-blue-500/5 text-blue-300 px-2 py-1 rounded border border-blue-500/10">
                        📄 Perfect for notes, articles, transcripts
                      </p>
                    )}
                    {currentSourceType === 'url' && (
                      <p className="bg-green-500/5 text-green-300 px-2 py-1 rounded border border-green-500/10">
                        🌐 Auto-fetches from Wikipedia & web pages
                      </p>
                    )}
                  </div>
                </div>

                {/* Content input */}
                <div className="space-y-2">
                  <Label htmlFor="currentSourceContent" className="text-sm text-slate-300">
                    {currentSourceType === 'topic' && 'Topic Name'}
                    {currentSourceType === 'paste' && 'Content to Analyze'}
                    {currentSourceType === 'url' && 'Webpage URL'}
                  </Label>
                  {currentSourceType === 'paste' ? (
                    <Textarea
                      ref={textareaRef}
                      id="currentSourceContent"
                      value={currentSourceContent}
                      onChange={(e) => {
                        setCurrentSourceContent(e.target.value);
                        setSourceInputError('');
                      }}
                      placeholder="Paste notes, transcripts, or articles..."
                      className="bg-slate-700/50 border-slate-600 min-h-[120px] max-h-[200px] resize-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10"
                      maxLength={MAX_CHARS}
                      autoFocus
                    />
                  ) : (
                    <div className="relative">
                      <Input
                        ref={inputRef}
                        id="currentSourceContent"
                        type={currentSourceType === 'url' ? 'url' : 'text'}
                        value={currentSourceContent}
                        onChange={(e) => {
                          setCurrentSourceContent(e.target.value);
                          setSourceInputError('');
                        }}
                        placeholder={
                          currentSourceType === 'url'
                            ? 'https://en.wikipedia.org/wiki/Topic'
                            : 'e.g., US Presidents, Space Exploration, 1990s Music'
                        }
                        className="bg-slate-700/50 border-slate-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 pr-20"
                        autoFocus
                      />
                      {/* Sparkle button for random topic/URL */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={currentSourceType === 'topic' ? handleGenerateRandomTopic : handleRandomWikipediaURL}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                        title={currentSourceType === 'topic' ? 'Get a random Jeopardy topic' : 'Get a random Wikipedia article'}
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  {currentSourceType === 'paste' && currentSourceContent.length > 0 && currentSourceContent.length < MIN_CHARS && (
                    <p className="text-xs text-orange-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Minimum {MIN_CHARS} characters required ({currentSourceContent.length} / {MIN_CHARS})
                    </p>
                  )}
                  {currentSourceType === 'paste' && (
                    <p className="text-xs text-slate-500 flex items-center justify-between">
                      <span>{currentSourceContent.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</span>
                      {currentSourceContent.length >= MIN_CHARS && (
                        <span className="text-green-400">✓ Ready to add</span>
                      )}
                    </p>
                  )}
                  {currentSourceType === 'topic' && (
                    <p className="text-xs text-slate-500">
                      💡 Be specific for better results — "US Presidents" instead of "History"
                    </p>
                  )}
                  {currentSourceType === 'url' && (
                    <p className="text-xs text-slate-500">
                      💡 Works best with Wikipedia articles and educational content
                    </p>
                  )}
                </div>

                {/* Category count */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-slate-300">Categories from this source</Label>
                    <span className="text-xs text-slate-500">
                      {getRemainingCategories()} slot{getRemainingCategories() === 1 ? '' : 's'} available
                    </span>
                  </div>
                  <select
                    value={currentSourceCategoryCount}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value);
                      const valid = Math.max(1, Math.min(6, parsed || 1));
                      setCurrentSourceCategoryCount(valid as 1 | 2 | 3 | 4 | 5 | 6);
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
                  >
                    {[6, 1, 2, 3, 4, 5].map(n => {
                      const remaining = getRemainingCategories();
                      const isDisabled = n > remaining;
                      const label = n === 1 ? 'y' : 'ies';
                      const hint = n === 6 ? '' : n === 1 ? ' (recommended)' : n === 2 ? ' (balanced)' : '';
                      const displayLabel = n === 6 ? 'Full Game (6 Categories)' : `${n} categor${label}${hint}`;

                      return (
                        <option
                          key={n}
                          value={n}
                          disabled={isDisabled}
                          className="bg-slate-800"
                        >
                          {displayLabel}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-xs text-slate-500">
                    Each source generates this many categories. Total cannot exceed 6.
                  </p>
                </div>

                {/* Error messages */}
                {sourceInputError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{sourceInputError}</p>
                  </div>
                )}
                {fetchError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{fetchError}</p>
                  </div>
                )}

                {/* Sources list */}
                {customSources.length > 0 && (
                  <div ref={sourcesListRef} className="space-y-3 pt-3 border-t border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-400">
                        <span className="text-slate-300 font-medium">{customSources.length} source{customSources.length !== 1 ? 's' : ''}</span> added
                      </p>
                      <div className={`text-sm font-semibold px-3 py-1.5 rounded-full ${getTotalCategoryCount() === 6 ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'}`}>
                        {getTotalCategoryCount()} / 6 categories
                      </div>
                    </div>
                    {getTotalCategoryCount() < 6 && (
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        Optionally add more sources ({getRemainingCategories()} categor{getRemainingCategories() === 1 ? 'y' : 'ies'} remaining)
                      </p>
                    )}
                    <div className="space-y-2">
                      {customSources.map((source) => {
                        const typeConfig = {
                          topic: { icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', label: 'Topic' },
                          paste: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Pasted Content' },
                          url: { icon: Globe, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'URL' },
                        }[source.type];
                        const Icon = typeConfig.icon;

                        return (
                          <div key={source.id} className={`bg-slate-800/50 border ${typeConfig.border} rounded-lg p-3 hover:bg-slate-800/70 transition-colors group`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`p-1.5 rounded ${typeConfig.bg} ${typeConfig.color}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-xs text-slate-500">{typeConfig.label}</span>
                                  <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full border border-slate-600">
                                    {source.categoryCount} categor{source.categoryCount === 1 ? 'y' : 'ies'}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-slate-200 truncate mb-0.5">{getDisplayLabel(source)}</p>
                                {source.type === 'topic' && (
                                  <p className="text-xs text-slate-500 italic">"{source.topic}"</p>
                                )}
                                {source.type === 'url' && (
                                  <p className="text-xs text-slate-500 truncate">{source.url}</p>
                                )}
                                {source.type === 'paste' && (
                                  <p className="text-xs text-slate-500">{source.content?.length.toLocaleString() || 0} characters</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleRemoveSource(source.id)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="Remove this source"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {getRemainingCategories() === 0 && customSources.length > 0 && (
                      <div className="flex items-center justify-center gap-2 py-2 px-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <span className="text-green-400">✓</span>
                        <p className="text-sm text-green-300 font-medium">All 6 categories allocated!</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Theme step */}
            {activeTab === 'ai' && step === 'theme' && (
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="theme">Game Theme</Label>
                  <Input
                    ref={inputRef}
                    id="theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="Optional overall theme (leave blank for auto-generated title)"
                    className="bg-slate-800/50 border-slate-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleThemeNext();
                      }
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    Your sources already define specific topics - this is optional for the game title
                  </p>
                </div>
              </div>
            )}

            {/* Difficulty step */}
            {activeTab === 'ai' && step === 'difficulty' && (
              <div className="py-4 space-y-3">
                <p className="text-sm text-slate-400 mb-2">How challenging should the questions be?</p>
                {difficultyOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDifficulty(option.value)}
                    className={`
                      w-full text-left p-4 rounded-lg border transition-all
                      ${difficulty === option.value
                        ? 'bg-purple-500/20 border-purple-500/50 ring-2 ring-purple-500/30'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{option.icon}</span>
                      <div>
                        <div className="font-semibold text-slate-200">{option.title}</div>
                        <div className="text-sm text-slate-400 mt-1">{option.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ==================== MANUAL TAB ==================== */}
            {activeTab === 'manual' && (
              <div className="py-4 space-y-6">
                {/* What's involved */}
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-300 mb-2">⚠️ Manual creation requires significant effort</h3>
                  <p className="text-sm text-slate-300 mb-2">You'll need to manually enter:</p>
                  <ul className="text-sm text-slate-300 space-y-1 ml-4">
                    <li>• 6 category titles</li>
                    <li>• 30 clues (5 per category)</li>
                    <li>• 30 correct responses/answers</li>
                    <li>• Dollar values for each clue</li>
                  </ul>
                  <p className="text-xs text-slate-400 mt-3">This can take 30-60 minutes or more to complete.</p>
                </div>

                {/* AI alternative */}
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-300 mb-2">✨ Or let AI do the work for you</h3>
                  <p className="text-sm text-slate-300 mb-2">AI can generate a complete game in seconds:</p>
                  <ul className="text-sm text-slate-300 space-y-1 ml-4">
                    <li>• <span className="text-green-400">From any theme</span> - just enter a topic</li>
                    <li>• <span className="text-blue-400">From your content</span> - paste notes, transcripts, or articles</li>
                    <li>• <span className="text-blue-400">From a webpage</span> - paste a URL to fetch content</li>
                  </ul>
                  <p className="text-xs text-slate-400 mt-3">All clues fact-checked and ready to play!</p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleManualConfirm}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    I understand - proceed to manual editor
                  </Button>
                  <Button
                    onClick={() => setActiveTab('ai')}
                    variant="outline"
                    className="w-full border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Try AI generation instead
                  </Button>
                </div>
              </div>
            )}

            {/* ==================== IMPORT TAB ==================== */}
            {activeTab === 'import' && (
              <div className="py-4 space-y-6">
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Import from JSON</h3>
                  <p className="text-sm text-slate-400 mb-6">
                    Load a previously exported game or a JSON file in the correct format
                  </p>
                  <Button
                    onClick={handleImportJSON}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold max-w-xs"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Select JSON File
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="px-6 pb-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-300 mb-1">Generation Failed</p>
                  <p className="text-xs text-red-400/80 mb-3">{error}</p>
                  <Button
                    onClick={handleComplete}
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-500/30 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <div className="flex gap-2 w-full">
            {/* Back button for AI tab when not in sources step */}
            {activeTab === 'ai' && step !== 'sources' ? (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                disabled={isLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            ) : (
              <AlertDialogCancel onClick={handleClose} className="flex-1" disabled={isLoading}>
                Cancel
              </AlertDialogCancel>
            )}

            {/* Add Source button for AI sources step - shown in middle */}
            {activeTab === 'ai' && step === 'sources' && (
              <Button
                onClick={handleAddSourceToList}
                className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white"
                disabled={isFetching || (currentSourceType === 'paste' && currentSourceContent.length < MIN_CHARS) || !currentSourceContent.trim() || currentSourceCategoryCount > getRemainingCategories() || isLoading}
              >
                {isFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Source
                  </>
                )}
              </Button>
            )}

            {/* Action buttons for AI tab */}
            {activeTab === 'ai' && step === 'sources' && (
              <Button
                onClick={handleSourcesNext}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black"
                disabled={isLoading || customSources.length === 0 || getTotalCategoryCount() === 0}
              >
                Next
              </Button>
            )}
            {activeTab === 'ai' && step === 'theme' && (
              <Button
                onClick={handleThemeNext}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black"
                disabled={isLoading}
              >
                Next
              </Button>
            )}
            {activeTab === 'ai' && step === 'difficulty' && (
              <Button
                onClick={handleComplete}
                className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white"
                disabled={isLoading || !!error}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Game
              </Button>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
