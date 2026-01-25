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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Wand2, ArrowLeft, Sparkles, ChevronDown, FileText, Globe, Zap, Edit, AlertCircle, RefreshCw, Plus, Trash2, Loader2, Upload, Check } from 'lucide-react';
import { getAIApiBase, fetchArticleContent } from '@/lib/ai/service';
import { useAuth } from '@/lib/auth';
import { getModelStats, formatTime, getCostEstimate, initializePricing } from '@/lib/ai/stats';

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

// New wizard steps for the redesigned flow
export type WizardStep =
  | 'choose-mode'      // AI/Manual/Import selection
  | 'choose-source'    // Topic/Paste/URL selection (AI only)
  | 'add-content'      // Enter topic/content/URL (AI only)
  | 'review-sources'   // Review and add more sources (AI only)
  | 'theme-difficulty' // Theme and difficulty selection (AI only)
  | 'manual-editor';   // Manual editing mode

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

export function NewGameWizard({ open, onClose, onComplete, onOpenEditor, onImportJSON, isLoading = false }: NewGameWizardProps) {
  // Clerk auth - needed for fetch-article endpoint
  const { getToken } = useAuth();

  // New wizard step state
  const [currentStep, setCurrentStep] = useState<WizardStep>('choose-mode');

  // Creation mode: 'ai' | 'manual' | 'import-json'
  const [creationMode, setCreationMode] = useState<'ai' | 'manual' | 'import-json'>('ai');

  // AI mode state
  const [customSources, setCustomSources] = useState<CustomSource[]>([]);
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');

  // Current source being added
  const [currentSourceType, setCurrentSourceType] = useState<'topic' | 'paste' | 'url'>('topic');
  const [currentSourceContent, setCurrentSourceContent] = useState('');
  const [currentSourceCategoryCount, setCurrentSourceCategoryCount] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
  const [fetchError, setFetchError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sourceInputError, setSourceInputError] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  const [aiModel, setAIModel] = useState<string>('or:google/gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setSuccessMessage('');
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

  const handleFetchArticle = async () => {
    if (!currentSourceContent.trim() || !isValidUrl(currentSourceContent.trim())) {
      setFetchError('Please enter a valid URL');
      return;
    }
    setIsFetching(true);
    setFetchError('');
    setSuccessMessage('');
    try {
      const authToken = await getToken().catch(() => null);
      const result = await fetchArticleContent(currentSourceContent.trim(), authToken);
      if (result.success && result.text) {
        // Show success message briefly
        setSuccessMessage('Content fetched successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setFetchError(result.error || 'Failed to fetch content from URL');
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch content');
    } finally {
      setIsFetching(false);
    }
  };

  // ==================== Navigation ====================
  const handleBack = () => {
    switch (currentStep) {
      case 'choose-source':
        setCurrentStep('choose-mode');
        break;
      case 'add-content':
        setCurrentStep('choose-source');
        break;
      case 'review-sources':
        setCurrentStep('add-content');
        break;
      case 'theme-difficulty':
        setCurrentStep('review-sources');
        break;
    }
  };

  const handleNext = async () => {
    switch (currentStep) {
      case 'choose-mode':
        if (creationMode === 'ai') {
          setCurrentStep('choose-source');
        } else if (creationMode === 'manual') {
          handleManualConfirm();
        } else if (creationMode === 'import-json') {
          handleImportJSON();
        }
        break;
      case 'choose-source':
        setCurrentStep('add-content');
        break;
      case 'add-content':
        // Validate and add source before proceeding
        if (!validateCurrentSource()) {
          return; // Stay on this step if validation fails
        }
        // For URL sources, we need to fetch first
        if (currentSourceType === 'url') {
          setIsFetching(true);
          setFetchError('');
          try {
            const authToken = await getToken().catch(() => null);
            const result = await fetchArticleContent(currentSourceContent.trim(), authToken);
            if (result.success && result.text) {
              const newSource: CustomSource = {
                id: crypto.randomUUID(),
                type: currentSourceType,
                categoryCount: currentSourceCategoryCount,
                url: currentSourceContent.trim(),
                fetchedContent: result.text,
              };
              setCustomSources([...customSources, newSource]);
              resetCurrentSource(newSource.categoryCount);
              setCurrentStep('review-sources');
            } else {
              setFetchError(result.error || 'Failed to fetch content from URL');
              return; // Stay on this step
            }
          } catch (err) {
            setFetchError(err instanceof Error ? err.message : 'Failed to fetch content');
            return; // Stay on this step
          } finally {
            setIsFetching(false);
          }
        } else {
          // For topic and paste, add directly
          const newSource: CustomSource = {
            id: crypto.randomUUID(),
            type: currentSourceType,
            categoryCount: currentSourceCategoryCount,
          };
          if (currentSourceType === 'topic') {
            newSource.topic = currentSourceContent.trim();
          } else {
            newSource.content = currentSourceContent.trim();
          }
          setCustomSources([...customSources, newSource]);
          resetCurrentSource(newSource.categoryCount);
          setCurrentStep('review-sources');
        }
        break;
      case 'review-sources':
        // Validate we have at least one source
        if (customSources.length === 0) {
          setSourceInputError('Please add at least one source');
          return;
        }
        setCurrentStep('theme-difficulty');
        break;
      case 'theme-difficulty':
        handleComplete();
        break;
    }
  };

  const handleComplete = () => {
    // Validate we have at least one source before completing
    if (creationMode === 'ai' && customSources.length === 0) {
      setSourceInputError('Please add at least one source');
      return;
    }
    const data: WizardCompleteData = {
      mode: creationMode,
      theme: theme || 'random',
      difficulty,
      sourceMode: 'custom',
      customSources,
    };
    onComplete(data);
  };

  const handleClose = () => {
    onClose();
    resetWizard();
  };

  const handleManualConfirm = () => {
    handleClose();
    onOpenEditor?.();
  };

  const handleImportJSON = () => {
    handleClose();
    onImportJSON?.();
  };

  // Reset wizard when opening
  const resetWizard = () => {
    setCurrentStep('choose-mode');
    setCreationMode('ai');
    setCustomSources([]);
    setTheme('');
    setDifficulty('normal');
    setCurrentSourceType('topic');
    setCurrentSourceContent('');
    setCurrentSourceCategoryCount(6);
    setFetchError('');
    setSuccessMessage('');
    setSourceInputError('');
  };

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) {
      resetWizard();
    }
  }, [open]);

  // Helper to get step info for progress indicator
  const getStepInfo = () => {
    if (creationMode === 'manual') return { current: 1, total: 1 };
    if (creationMode === 'import-json') return { current: 1, total: 1 };
    // AI mode steps
    const steps: WizardStep[] = ['choose-source', 'add-content', 'review-sources', 'theme-difficulty'];
    const currentIndex = steps.indexOf(currentStep);
    return { current: currentIndex + 1, total: steps.length };
  };

  const canGoBack = () => {
    if (creationMode === 'manual' || creationMode === 'import-json') return false;
    return currentStep !== 'choose-source' && currentStep !== 'choose-mode';
  };

  const getNextLabel = () => {
    if (currentStep === 'review-sources') return 'Review & Continue';
    if (currentStep === 'theme-difficulty') return 'Generate Game';
    return 'Continue';
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                creationMode === 'ai' ? 'bg-purple-500/20' :
                creationMode === 'manual' ? 'bg-orange-500/20' : 'bg-cyan-500/20'
              }`}>
                {creationMode === 'ai' && <Wand2 className="w-5 h-5 text-purple-400" />}
                {creationMode === 'manual' && <Edit className="w-5 h-5 text-orange-400" />}
                {creationMode === 'import-json' && <Upload className="w-5 h-5 text-cyan-400" />}
              </div>
              <div>
                <AlertDialogTitle>Create New Game</AlertDialogTitle>
                <AlertDialogDescription>
                  {currentStep === 'choose-mode' && 'Choose how you want to create your game'}
                  {currentStep === 'choose-source' && 'What type of content do you have?'}
                  {currentStep === 'add-content' && 'Enter your content'}
                  {currentStep === 'review-sources' && `Review your ${customSources.length} source${customSources.length > 1 ? 's' : ''}`}
                  {currentStep === 'theme-difficulty' && 'Finalize your game settings'}
                </AlertDialogDescription>
              </div>
            </div>

            {/* AI Model Selector - only show for AI mode */}
            {creationMode === 'ai' && (
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
                                  {stats && (
                                    <div className="text-xs text-slate-500 mt-0.5">
                                      Avg: {formatTime(stats.averageTimeMs)} • {stats.count} generated
                                    </div>
                                  )}
                                </div>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </AlertDialogHeader>

        {/* Progress Indicator - AI mode only */}
        {creationMode === 'ai' && currentStep !== 'choose-mode' && (
          <div className="px-6 py-3 border-b border-slate-700/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Step {getStepInfo().current} of {getStepInfo().total}</span>
              <div className="flex gap-1">
                {(['choose-source', 'add-content', 'review-sources', 'theme-difficulty'] as WizardStep[]).map((s, i) => (
                  <div
                    key={s}
                    className={`w-6 h-1.5 rounded-full transition-colors ${
                      (['choose-source', 'add-content', 'review-sources', 'theme-difficulty'] as WizardStep[]).indexOf(currentStep) >= i
                        ? 'bg-purple-500'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
            <p className="text-lg font-medium text-slate-200 mb-2">Generating your game...</p>
            <p className="text-sm text-slate-400">Creating categories and questions with AI</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-6 px-6 py-4">
            {/* ==================== STEP 1: CHOOSE MODE ==================== */}
            {currentStep === 'choose-mode' && (
              <div className="space-y-3">
                <button
                  onClick={() => setCreationMode('ai')}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    creationMode === 'ai'
                      ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Wand2 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-200 mb-1">Generate with AI</h3>
                      <p className="text-sm text-slate-400">
                        Enter a topic or paste content to automatically generate a full Jeopardy game
                      </p>
                    </div>
                    {creationMode === 'ai' && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => setCreationMode('manual')}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    creationMode === 'manual'
                      ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <Edit className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-200 mb-1">Manual Editor</h3>
                      <p className="text-sm text-slate-400">
                        Create all questions and answers yourself with full control
                      </p>
                    </div>
                    {creationMode === 'manual' && (
                      <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => setCreationMode('import-json')}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    creationMode === 'import-json'
                      ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-cyan-500/20 rounded-lg">
                      <Upload className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-200 mb-1">Import JSON</h3>
                      <p className="text-sm text-slate-400">
                        Load a game from a previously exported JSON file
                      </p>
                    </div>
                    {creationMode === 'import-json' && (
                      <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            )}

            {/* ==================== STEP 2: CHOOSE SOURCE TYPE ==================== */}
            {currentStep === 'choose-source' && (
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setCurrentSourceType('topic');
                    setCurrentSourceContent('');
                    setSourceInputError('');
                    setFetchError('');
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    currentSourceType === 'topic'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Zap className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-200 mb-1">Topic</h3>
                      <p className="text-sm text-slate-400">
                        Fastest option — just enter any topic name
                      </p>
                    </div>
                    {currentSourceType === 'topic' && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => {
                    setCurrentSourceType('paste');
                    setCurrentSourceContent('');
                    setSourceInputError('');
                    setFetchError('');
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    currentSourceType === 'paste'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <FileText className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-200 mb-1">Paste Content</h3>
                      <p className="text-sm text-slate-400">
                        Paste notes, articles, or other text content
                      </p>
                    </div>
                    {currentSourceType === 'paste' && (
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => {
                    setCurrentSourceType('url');
                    setCurrentSourceContent('');
                    setSourceInputError('');
                    setFetchError('');
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    currentSourceType === 'url'
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Globe className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-200 mb-1">URL</h3>
                      <p className="text-sm text-slate-400">
                        Fetch content from Wikipedia or any webpage
                      </p>
                    </div>
                    {currentSourceType === 'url' && (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            )}

            {/* ==================== STEP 3: ADD CONTENT ==================== */}
            {currentStep === 'add-content' && (
              <div className="space-y-4">
                {currentSourceType === 'topic' && (
                  <div className="space-y-2">
                    <Label htmlFor="topicInput" className="text-sm text-slate-300">Topic Name</Label>
                    <Input
                      id="topicInput"
                      ref={inputRef}
                      value={currentSourceContent}
                      onChange={(e) => {
                        setCurrentSourceContent(e.target.value);
                        setSourceInputError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && currentSourceContent.trim()) {
                          handleNext();
                        }
                      }}
                      placeholder="e.g., US Presidents, Space Exploration, 1990s Music"
                      className="bg-slate-800/50 border-slate-700"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerateRandomTopic}
                        className="text-purple-400 hover:text-purple-300"
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        Random Topic
                      </Button>
                    </div>
                  </div>
                )}

                {currentSourceType === 'paste' && (
                  <div className="space-y-2">
                    <Label htmlFor="pasteInput" className="text-sm text-slate-300">Content to Analyze</Label>
                    <Textarea
                      ref={textareaRef}
                      id="pasteInput"
                      value={currentSourceContent}
                      onChange={(e) => {
                        setCurrentSourceContent(e.target.value);
                        setSourceInputError('');
                      }}
                      placeholder={`Paste your notes, articles, or other content here...`}
                      className="min-h-[200px] bg-slate-800/50 border-slate-700 text-sm"
                    />
                    <p className="text-xs text-slate-500">
                      {currentSourceContent.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
                    </p>
                  </div>
                )}

                {currentSourceType === 'url' && (
                  <div className="space-y-2">
                    <Label htmlFor="urlInput" className="text-sm text-slate-300">Webpage URL</Label>
                    <Input
                      id="urlInput"
                      ref={inputRef}
                      value={currentSourceContent}
                      onChange={(e) => {
                        setCurrentSourceContent(e.target.value);
                        setSourceInputError('');
                        setFetchError('');
                      }}
                      placeholder="https://en.wikipedia.org/wiki/Ancient_Egypt"
                      className="bg-slate-800/50 border-slate-700"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRandomWikipediaURL}
                        className="text-green-400 hover:text-green-300"
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        Random Wikipedia
                      </Button>
                      {isValidUrl(currentSourceContent) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleFetchArticle}
                          disabled={isFetching}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {isFetching ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Fetching...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Test Fetch
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    {fetchError && (
                      <p className="text-sm text-red-400">{fetchError}</p>
                    )}
                    {successMessage && (
                      <p className="text-sm text-green-400">{successMessage}</p>
                    )}
                  </div>
                )}

                {/* Category Count */}
                <div className="space-y-2">
                  <Label className="text-sm text-slate-300">Categories to Generate</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((count) => {
                      const remaining = getRemainingCategories();
                      const isValid = count <= remaining;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => isValid && setCurrentSourceCategoryCount(count as 1 | 2 | 3 | 4 | 5 | 6)}
                          disabled={!isValid}
                          className={`py-2 px-3 rounded-lg border text-center transition-all ${
                            !isValid
                              ? 'opacity-30 cursor-not-allowed border-slate-800'
                              : currentSourceCategoryCount === count
                                ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600 cursor-pointer'
                          }`}
                        >
                          {count}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500">
                    This will generate {currentSourceCategoryCount} categor{currentSourceCategoryCount > 1 ? 'ies' : 'y'}
                    {getRemainingCategories() < 6 && ` (${getRemainingCategories()} remaining)`}
                  </p>
                </div>

                {sourceInputError && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {sourceInputError}
                  </div>
                )}
              </div>
            )}

            {/* ==================== STEP 4: REVIEW SOURCES ==================== */}
            {currentStep === 'review-sources' && (
              <div className="space-y-4">
                {/* Sources List */}
                <div className="space-y-2">
                  {customSources.map((source) => (
                    <div
                      key={source.id}
                      className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {source.type === 'topic' && <Zap className="w-4 h-4 text-purple-400" />}
                          {source.type === 'paste' && <FileText className="w-4 h-4 text-blue-400" />}
                          {source.type === 'url' && <Globe className="w-4 h-4 text-green-400" />}
                          <span className="text-sm font-medium text-slate-200 truncate">
                            {source.type === 'topic' && source.topic}
                            {source.type === 'paste' && 'Pasted Content'}
                            {source.type === 'url' && source.url}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {source.categoryCount} categor{source.categoryCount > 1 ? 'ies' : 'y'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSource(source.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Add Another Source Button - PROMINENT */}
                <button
                  type="button"
                  onClick={() => setCurrentStep('choose-source')}
                  disabled={getTotalCategoryCount() >= 6}
                  className={`w-full p-4 border-2 border-dashed rounded-lg text-center transition-all group ${
                    getTotalCategoryCount() >= 6
                      ? 'border-slate-800 opacity-50 cursor-not-allowed'
                      : 'border-slate-700 hover:border-purple-500 hover:bg-purple-500/5'
                  }`}
                >
                  <Plus className={`w-5 h-5 mx-auto mb-2 ${getTotalCategoryCount() >= 6 ? 'text-slate-600' : 'text-slate-500 group-hover:text-purple-400'}`} />
                  <span className={`text-sm ${getTotalCategoryCount() >= 6 ? 'text-slate-600' : 'text-slate-400 group-hover:text-purple-300'}`}>
                    Add Another Source
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    Total: {customSources.length} source{customSources.length !== 1 ? 's' : ''}, {getTotalCategoryCount()} / 6 categories
                  </p>
                </button>

                {sourceInputError && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {sourceInputError}
                  </div>
                )}
              </div>
            )}

            {/* ==================== STEP 5: THEME & DIFFICULTY ==================== */}
            {currentStep === 'theme-difficulty' && (
              <div className="space-y-4">
                {/* Theme */}
                <div className="space-y-2">
                  <Label htmlFor="themeInput" className="text-sm text-slate-300">
                    Game Theme <span className="text-slate-500">(optional)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="themeInput"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      placeholder="Random theme will be used"
                      className="flex-1 bg-slate-800/50 border-slate-700"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTheme('')}
                      className="text-slate-400 hover:text-slate-300"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Ties all categories together with a unifying theme
                  </p>
                </div>

                {/* Difficulty */}
                <div className="space-y-2">
                  <Label className="text-sm text-slate-300">Difficulty Level</Label>
                  <div className="space-y-2">
                    {difficultyOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDifficulty(opt.value)}
                        className={`w-full p-3 rounded-lg border text-left transition-all ${
                          difficulty === opt.value
                            ? 'bg-slate-700/50 border-slate-600'
                            : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{opt.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-200">{opt.title}</span>
                              {difficulty === opt.value && (
                                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center ml-auto">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <AlertDialogFooter className="gap-2">
          {canGoBack() && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={isLoading}
              className="text-slate-400 hover:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-300"
          >
            Cancel
          </Button>
          {currentStep === 'choose-mode' && creationMode !== 'manual' && creationMode !== 'import-json' && (
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white"
            >
              Continue
            </Button>
          )}
          {currentStep === 'choose-mode' && creationMode === 'import-json' && (
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Import JSON
            </Button>
          )}
          {currentStep !== 'choose-mode' && creationMode === 'ai' && (
            <Button
              type="button"
              onClick={handleNext}
              disabled={isLoading}
              className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white"
            >
              {getNextLabel()}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

}
