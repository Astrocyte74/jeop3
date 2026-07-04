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
import { getAIApiBase, fetchArticleContent, generateAI, safeJsonParse } from '@/lib/ai/service';
import { validators } from '@/lib/ai/prompts';
import type { AIContext } from '@/lib/ai/types';
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
  suggestedTitles?: string[]; // Curated draft titles carried from the Live Board (truthful preview)
}

// New wizard steps for the redesigned flow
export type WizardStep =
  | 'choose-mode'      // AI/Manual/Import selection
  | 'composer'         // Single-page AI composer (Phase A)
  | 'liveboard'        // Dual-pane composer with live board preview (Phase B)
  | 'choose-source'    // Topic/Paste/URL selection (AI only, classic stepper)
  | 'add-content'      // Enter topic/content/URL (AI only, classic stepper)
  | 'review-sources'   // Review and add more sources (AI only, classic stepper)
  | 'theme-difficulty' // Theme and difficulty selection (AI only, classic stepper)
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
  onRetry?: () => void;
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

export function NewGameWizard({ open, onClose, onComplete, onOpenEditor, onImportJSON, isLoading = false, error, onRetry }: NewGameWizardProps) {
  // Clerk auth - needed for fetch-article endpoint
  const { getToken } = useAuth();

  // New wizard step state. The Live Board is the one and only AI creation flow
  // now — the wizard opens straight onto it. The composer/stepper step code is
  // retained below but currently has no entry point ("removed for now").
  const [currentStep, setCurrentStep] = useState<WizardStep>('liveboard');

  // Creation mode: 'ai' | 'manual' | 'import-json'. Manual and Import are demoted
  // to the footer "More" menu; AI is the default and primary path.
  const [creationMode, setCreationMode] = useState<'ai' | 'manual' | 'import-json'>('ai');

  // AI mode state
  const [customSources, setCustomSources] = useState<CustomSource[]>([]);
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');

  // Current source being added
  const [currentSourceType, setCurrentSourceType] = useState<'topic' | 'paste' | 'url'>('topic');
  const [currentSourceContent, setCurrentSourceContent] = useState('');
  const [currentSourceCategoryCount, setCurrentSourceCategoryCount] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [fetchError, setFetchError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sourceInputError, setSourceInputError] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  // Draft category names for the liveboard preview, keyed by draft-unit cache key
  // (see buildDraftUnit below). Kept for the whole session — identical requests
  // never refetch.
  const [draftNames, setDraftNames] = useState<Record<string, string[]>>({});
  const [rerollingColKey, setRerollingColKey] = useState<string | null>(null);
  const draftFetchesInFlight = useRef<Set<string>>(new Set());
  const draftUnitContexts = useRef<Map<string, AIContext>>(new Map());

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

  // Reset the span editor for the next entry. Every new span defaults to 1
  // column (the user widens it per content as needed); focus returns to the
  // input so the fill-in-turn flow is type → Enter → type → Enter.
  const resetCurrentSource = (_addedSourceCount?: number) => {
    setCurrentSourceContent('');
    setCurrentSourceCategoryCount(1);
    setSourceInputError('');
    setFetchError('');
    setSuccessMessage('');
    setTimeout(() => inputRef.current?.focus(), 50);
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

  // Add the current source (topic/paste/url) to the list. Shared by the classic
  // stepper's 'add-content' step and the single-page composer's "Add source" button.
  // Returns true on success.
  const addCurrentSource = async (): Promise<boolean> => {
    if (!validateCurrentSource()) return false;
    if (currentSourceType === 'url') {
      setIsFetching(true);
      setFetchError('');
      try {
        const authToken = await getToken().catch(() => null);
        const result = await fetchArticleContent(currentSourceContent.trim(), authToken);
        if (result.success && result.text) {
          const newSource: CustomSource = {
            id: crypto.randomUUID(),
            type: 'url',
            categoryCount: currentSourceCategoryCount,
            url: currentSourceContent.trim(),
            fetchedContent: result.text,
          };
          setCustomSources([...customSources, newSource]);
          resetCurrentSource(newSource.categoryCount);
          return true;
        }
        setFetchError(result.error || 'Failed to fetch content from URL');
        return false;
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to fetch content');
        return false;
      } finally {
        setIsFetching(false);
      }
    }
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
    return true;
  };

  // ==================== Navigation ====================
  const handleBack = () => {
    switch (currentStep) {
      case 'composer':
        setCurrentStep('choose-mode');
        break;
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
          setCurrentStep('liveboard');
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
        if (await addCurrentSource()) {
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
    // Carry the curated (possibly rerolled) draft titles from the Live Board into
    // each source so generation honors them — the final board matches the preview.
    const customSourcesWithDrafts = customSources.map(s => {
      const titles = (draftNames[draftUnitForSource(s).key] || []).filter(t => t && t.trim());
      return titles.length ? { ...s, suggestedTitles: titles.slice(0, s.categoryCount) } : s;
    });
    const data: WizardCompleteData = {
      mode: creationMode,
      theme: theme || 'random',
      difficulty,
      sourceMode: 'custom',
      customSources: customSourcesWithDrafts,
    };
    onComplete(data);
  };

  const handleClose = () => {
    // Don't call resetWizard() here - it can cause race conditions
    // The useEffect will reset when open changes to false
    onClose();
  };

  const handleManualConfirm = () => {
    handleClose();
    onOpenEditor?.();
  };

  const handleImportJSON = () => {
    handleClose();
    onImportJSON?.();
  };

  // Reset wizard when opening — straight onto the Live Board, first span = 1 column
  const resetWizard = () => {
    setCurrentStep('liveboard');
    setCreationMode('ai');
    setCustomSources([]);
    setTheme('');
    setDifficulty('normal');
    setCurrentSourceType('topic');
    setCurrentSourceContent('');
    setCurrentSourceCategoryCount(1);
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
    // The Live Board is the entry point — there is nothing to go back to.
    return currentStep !== 'choose-source' && currentStep !== 'choose-mode' && currentStep !== 'liveboard';
  };

  const getNextLabel = () => {
    if (currentStep === 'review-sources') return 'Review & Continue';
    if (currentStep === 'theme-difficulty') return 'Generate Game';
    return 'Continue';
  };

  // ==================== Live board preview (liveboard view) ====================
  // Board shape is derived locally from wizard state. On top of that, a silent,
  // debounced "draft pass" asks the AI for real category titles per source
  // (titles only, truncated excerpt, ~300 tokens) and writes them onto the
  // preview columns. Draft titles are preview-only — the final categories and
  // clues are still generated from scratch at Generate time.
  const hostnameOf = (url: string): string => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  };
  const sourceLabel = (s: CustomSource): string =>
    s.type === 'topic' ? (s.topic ?? 'Topic') : s.type === 'paste' ? 'Pasted content' : hostnameOf(s.url ?? '');

  const DRAFT_EXCERPT_CHARS = 1500;

  // A "unit" is one source's draft-name request; the key doubles as a cache key
  // so identical content/count/theme/difficulty never refetches (and names carry
  // over seamlessly when a typed topic becomes an added source).
  interface DraftUnit { key: string; count: number; context: AIContext }
  const buildDraftUnit = (topic: string | undefined, material: string | undefined, count: number): DraftUnit => ({
    key: `${topic !== undefined ? 'topic' : 'material'}|${count}|${theme.trim().toLowerCase()}|${difficulty}|${(topic ?? material ?? '').slice(0, 300)}`,
    count,
    context: {
      count,
      gameTopic: topic,
      referenceMaterial: material,
      theme: theme.trim() || undefined,
    },
  });
  const draftUnitForSource = (s: CustomSource): DraftUnit =>
    s.type === 'topic'
      ? buildDraftUnit(s.topic ?? '', undefined, s.categoryCount)
      : buildDraftUnit(undefined, (s.fetchedContent ?? s.content ?? '').slice(0, DRAFT_EXCERPT_CHARS), s.categoryCount);

  // The source being typed (not yet added) also gets draft names — topic type
  // only, where a few characters are enough signal. Paste/URL keep placeholder
  // shimmer until added.
  const draftInput = currentSourceContent.trim();
  const typedDraftUnit: DraftUnit | null =
    currentStep === 'liveboard' && currentSourceType === 'topic' && draftInput.length >= 3 && getRemainingCategories() > 0
      ? buildDraftUnit(draftInput, undefined, Math.min(currentSourceCategoryCount, getRemainingCategories()))
      : null;

  const fetchDraftNamesForUnit = async (unit: DraftUnit) => {
    draftFetchesInFlight.current.add(unit.key);
    draftUnitContexts.current.set(unit.key, unit.context);
    try {
      const authToken = await getToken().catch(() => null);
      const raw = await generateAI<string>('category-names-draft', unit.context, difficulty, undefined, authToken);
      const parsed = safeJsonParse(raw, validators['category-names-draft']) as { names: string[] } | null;
      // Cache even on failure ([]) so a bad response doesn't retry-loop;
      // columns simply keep their source-label fallback.
      const names = parsed?.names?.slice(0, unit.count) ?? [];
      setDraftNames(prev => ({ ...prev, [unit.key]: names }));
    } catch {
      setDraftNames(prev => ({ ...prev, [unit.key]: [] }));
    } finally {
      draftFetchesInFlight.current.delete(unit.key);
    }
  };

  // Debounced trigger: any unit not yet cached or in flight gets fetched 800ms
  // after the last relevant change. Only active in the liveboard view.
  useEffect(() => {
    if (currentStep !== 'liveboard') return;
    const units = customSources.map(draftUnitForSource);
    if (typedDraftUnit) units.push(typedDraftUnit);
    const missing = units.filter(u => !(u.key in draftNames) && !draftFetchesInFlight.current.has(u.key));
    if (missing.length === 0) return;
    const timer = setTimeout(() => {
      missing.forEach(u => { void fetchDraftNamesForUnit(u); });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, customSources, theme, difficulty, currentSourceType, currentSourceContent, currentSourceCategoryCount, draftNames]);

  // Per-span "regenerate titles": re-roll every draft title for one added span
  // in a single pass, avoiding the span's current titles so the result is fresh.
  const regenerateSpanTitles = async (source: CustomSource) => {
    if (rerollingColKey) return;
    const unit = draftUnitForSource(source);
    const baseContext = draftUnitContexts.current.get(unit.key) ?? unit.context;
    const avoid = (draftNames[unit.key] || []).filter(Boolean);
    setRerollingColKey(`span-${source.id}`);
    try {
      const authToken = await getToken().catch(() => null);
      const raw = await generateAI<string>(
        'category-names-draft',
        { ...baseContext, count: source.categoryCount, existingNames: avoid },
        difficulty, undefined, authToken
      );
      const parsed = safeJsonParse(raw, validators['category-names-draft']) as { names: string[] } | null;
      const names = parsed?.names?.slice(0, source.categoryCount) ?? [];
      if (names.length) {
        setDraftNames(prev => ({ ...prev, [unit.key]: names }));
      }
    } catch {
      // keep existing titles on failure
    } finally {
      setRerollingColKey(null);
    }
  };

  const rerollDraftName = async (unitKey: string, index: number, colKey: string) => {
    const baseContext = draftUnitContexts.current.get(unitKey);
    if (!baseContext || rerollingColKey) return;
    setRerollingColKey(colKey);
    try {
      const avoid = Object.values(draftNames).flat().filter(Boolean);
      const authToken = await getToken().catch(() => null);
      const raw = await generateAI<string>(
        'category-names-draft',
        { ...baseContext, count: 1, existingNames: avoid },
        difficulty, undefined, authToken
      );
      const parsed = safeJsonParse(raw, validators['category-names-draft']) as { names: string[] } | null;
      const newName = parsed?.names?.[0];
      if (newName) {
        setDraftNames(prev => {
          const names = [...(prev[unitKey] ?? [])];
          names[index] = newName;
          return { ...prev, [unitKey]: names };
        });
      }
    } catch {
      // Silent — the column keeps its current title.
    } finally {
      setRerollingColKey(null);
    }
  };

  // The board is organized as SPANS: contiguous column groups that share one
  // source. A span of N columns is generated in a single AI call (N distinct
  // categories, uniqueness enforced in-prompt), so content can safely cover
  // multiple columns without duplicate questions.
  interface PreviewColumn {
    key: string;
    label: string;
    state: 'added' | 'draft' | 'next' | 'empty';
    name?: string;
    unitKey?: string;
    idx?: number;
    pending?: boolean;
  }
  interface PreviewSpan {
    key: string;
    state: 'added' | 'draft' | 'next' | 'empty';
    sourceType: 'topic' | 'paste' | 'url' | null;
    startCol: number;
    columns: PreviewColumn[];
  }

  const previewSpans: PreviewSpan[] = [];
  let colCursor = 1;
  customSources.forEach((s) => {
    const unit = draftUnitForSource(s);
    const names = draftNames[unit.key];
    const cols: PreviewColumn[] = [];
    for (let i = 0; i < s.categoryCount; i++) {
      cols.push({
        key: `${s.id}-${i}`, label: sourceLabel(s), state: 'added',
        name: names?.[i], unitKey: unit.key, idx: i, pending: names === undefined,
      });
    }
    previewSpans.push({ key: s.id, state: 'added', sourceType: s.type, startCol: colCursor, columns: cols });
    colCursor += s.categoryCount;
  });

  // The span currently being authored is always visible on the board — as a
  // highlighted "next" outline before any content is typed, then as shimmering
  // draft columns (with live draft titles for topics) once typing starts.
  if (colCursor <= 6) {
    const width = Math.min(currentSourceCategoryCount, getRemainingCategories());
    const spanState: 'draft' | 'next' = draftInput ? 'draft' : 'next';
    const draftLabel =
      currentSourceType === 'topic' ? draftInput : currentSourceType === 'paste' ? 'Pasted content' : hostnameOf(draftInput);
    const typedNames = typedDraftUnit ? draftNames[typedDraftUnit.key] : undefined;
    const cols: PreviewColumn[] = [];
    for (let i = 0; i < width; i++) {
      cols.push({
        key: `draft-${i}`, label: draftLabel, state: spanState,
        name: typedNames?.[i], unitKey: typedDraftUnit?.key, idx: i,
        pending: spanState === 'draft' && typedDraftUnit !== null && typedNames === undefined,
      });
    }
    previewSpans.push({ key: 'authoring-span', state: spanState, sourceType: currentSourceType, startCol: colCursor, columns: cols });
    colCursor += width;
  }

  if (colCursor <= 6) {
    const cols: PreviewColumn[] = [];
    for (let i = colCursor; i <= 6; i++) {
      cols.push({ key: `empty-${i}`, label: '', state: 'empty' });
    }
    previewSpans.push({ key: 'empty-span', state: 'empty', sourceType: null, startCol: colCursor, columns: cols });
  }

  const plannedColumnCount = previewSpans
    .filter((sp) => sp.state === 'added' || sp.state === 'draft')
    .reduce((n, sp) => n + sp.columns.length, 0);

  // Range label for the span being authored ("Column 3" / "Columns 3–5")
  const nextColStart = getTotalCategoryCount() + 1;
  const nextColEnd = nextColStart + Math.min(currentSourceCategoryCount, Math.max(1, getRemainingCategories())) - 1;
  const spanRangeLabel = nextColStart === nextColEnd ? `Column ${nextColStart}` : `Columns ${nextColStart}–${nextColEnd}`;

  // Game title grows as column topics are added (theme always wins; the final
  // polished title is still AI-generated at Generate time).
  const titleTopics = customSources.filter((s) => s.type === 'topic').map((s) => s.topic ?? '').filter(Boolean);
  if (currentSourceType === 'topic' && draftInput) titleTopics.push(draftInput);
  const joinedTopics =
    titleTopics.length === 0 ? '' :
    titleTopics.length === 1 ? titleTopics[0] :
    titleTopics.length === 2 ? `${titleTopics[0]} & ${titleTopics[1]}` :
    `${titleTopics[0]}, ${titleTopics[1]} & More`;
  const previewTitle = theme.trim() || joinedTopics || 'Your New Game';

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className={`${currentStep === 'composer' ? 'data-[size=default]:sm:max-w-2xl' : ''} ${currentStep === 'liveboard' ? 'data-[size=default]:sm:max-w-2xl data-[size=default]:lg:max-w-[1180px] lg:h-[min(880px,94vh)]' : ''} max-h-[95vh] gap-4 flex flex-col`}>
        <AlertDialogHeader className="block text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shadow-lg ${
                creationMode === 'ai' ? 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30' :
                creationMode === 'manual' ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/30' :
                'bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/30'
              }`}>
                {creationMode === 'ai' && <Wand2 className="w-5 h-5 text-white" />}
                {creationMode === 'manual' && <Edit className="w-5 h-5 text-white" />}
                {creationMode === 'import-json' && <Upload className="w-5 h-5 text-white" />}
              </div>
              <div>
                <AlertDialogTitle>Create New Game</AlertDialogTitle>
                <AlertDialogDescription>
                  {currentStep === 'choose-mode' && 'Choose how you want to create your game'}
                  {currentStep === 'composer' && 'Add sources, pick a style, and generate'}
                  {currentStep === 'liveboard' && 'Watch your board take shape as you build'}
                  {currentStep === 'choose-source' && 'What type of content do you have?'}
                  {currentStep === 'add-content' && 'Enter your content'}
                  {currentStep === 'review-sources' && `Review your ${customSources.length} source${customSources.length > 1 ? 's' : ''}`}
                  {currentStep === 'theme-difficulty' && 'Finalize your game settings'}
                </AlertDialogDescription>
              </div>
            </div>

            {/* AI Model Selector */}
            <div className="flex items-center gap-2">
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
          </div>
        </AlertDialogHeader>

        {/* Progress Indicator - AI stepper only (composer/liveboard have no steps) */}
        {creationMode === 'ai' && currentStep !== 'choose-mode' && currentStep !== 'composer' && currentStep !== 'liveboard' && (
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
            {error && (
              <div className="mt-6 flex flex-col items-center gap-3 max-w-sm">
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg w-full">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
                {onRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={`overflow-y-auto flex-1 -mx-6 px-6 py-4 ${currentStep === 'liveboard' ? 'lg:overflow-y-hidden' : ''}`}>
            {/* ==================== STEP 1: CHOOSE MODE ==================== */}
            {currentStep === 'choose-mode' && (
              <div className="space-y-3" role="radiogroup" aria-label="Choose game creation mode">
                <button
                  onClick={() => setCreationMode('ai')}
                  role="radio"
                  aria-checked={creationMode === 'ai'}
                  aria-label="Generate with AI mode"
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
                  role="radio"
                  aria-checked={creationMode === 'manual'}
                  aria-label="Manual editor mode"
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
                  role="radio"
                  aria-checked={creationMode === 'import-json'}
                  aria-label="Import JSON mode"
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

            {/* ==================== COMPOSER (Phase A) & LIVE BOARD (Phase B) ==================== */}
            {/* Both views share the same composer form; liveboard adds a live board preview pane. */}
            {(currentStep === 'composer' || currentStep === 'liveboard') && (
              <div className={currentStep === 'liveboard' ? 'lg:grid lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-7 lg:items-stretch lg:h-full lg:min-h-0' : ''}>
              <div className={`space-y-6 ${currentStep === 'liveboard' ? 'lg:overflow-y-auto lg:min-h-0 lg:pr-2 lg:-mr-2' : ''}`}>
                {/* ==================== SPAN EDITOR (columns first) ==================== */}
                {getRemainingCategories() > 0 ? (
                <>
                {/* Which columns this content will fill — the starting point */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Now filling</Label>
                    <span className="font-board text-sm uppercase tracking-wider text-yellow-400">{spanRangeLabel}</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentSourceCategoryCount(Math.max(1, currentSourceCategoryCount - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
                        className="w-7 h-7 rounded-lg bg-slate-700/70 text-slate-200 hover:bg-slate-600 text-lg leading-none flex items-center justify-center"
                        aria-label="Fewer columns"
                      >−</button>
                      <span className="text-lg font-bold w-6 text-center text-slate-100">{currentSourceCategoryCount}</span>
                      <button
                        type="button"
                        onClick={() => setCurrentSourceCategoryCount(Math.min(getRemainingCategories(), currentSourceCategoryCount + 1) as 1 | 2 | 3 | 4 | 5 | 6)}
                        disabled={currentSourceCategoryCount >= getRemainingCategories()}
                        className="w-7 h-7 rounded-lg bg-slate-700/70 text-slate-200 hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-slate-700/70 text-lg leading-none flex items-center justify-center"
                        aria-label="More columns"
                      >+</button>
                    </div>
                    <span className="text-xs text-slate-500">column{currentSourceCategoryCount > 1 ? 's' : ''} for this content</span>
                    {getRemainingCategories() > currentSourceCategoryCount && (
                      <button
                        type="button"
                        onClick={() => setCurrentSourceCategoryCount(getRemainingCategories() as 1 | 2 | 3 | 4 | 5 | 6)}
                        className="text-xs font-semibold text-yellow-500/80 hover:text-yellow-400"
                      >
                        All {getRemainingCategories()}
                      </button>
                    )}
                  </div>
                  {currentSourceCategoryCount > 1 && (
                    <p className="text-[11px] text-slate-600 leading-snug">
                      One AI pass writes {currentSourceCategoryCount} distinct categories from this content — no duplicate questions across them.
                    </p>
                  )}
                </div>

                {/* What fills them */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fill with</Label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {([
                      { type: 'topic', Icon: Zap, label: 'Topic', sub: 'Any subject', grad: 'from-purple-500/25 to-purple-500/5', ring: 'border-purple-500', on: 'text-purple-300' },
                      { type: 'paste', Icon: FileText, label: 'Paste', sub: 'Notes, articles', grad: 'from-blue-500/25 to-blue-500/5', ring: 'border-blue-500', on: 'text-blue-300' },
                      { type: 'url', Icon: Globe, label: 'URL', sub: 'Webpage / wiki', grad: 'from-green-500/25 to-green-500/5', ring: 'border-green-500', on: 'text-green-300' },
                    ] as const).map(({ type, Icon, label, sub, grad, ring, on }) => {
                      const sel = currentSourceType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => { setCurrentSourceType(type); setCurrentSourceContent(''); setSourceInputError(''); setFetchError(''); }}
                          className={`flex flex-col items-center gap-1 py-3 rounded-xl border bg-gradient-to-b transition-all ${sel ? `${grad} ${ring}` : 'border-slate-700/70 from-slate-800/40 to-slate-800/5 text-slate-400 hover:border-slate-600'}`}
                        >
                          <Icon className={`w-5 h-5 ${sel ? on : ''}`} />
                          <span className="text-sm font-medium text-slate-100">{label}</span>
                          <span className="text-[10px] text-slate-500">{sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Content input (varies by source type) */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {currentSourceType === 'topic' ? 'Topic' : currentSourceType === 'paste' ? 'Content to analyze' : 'Webpage URL'}
                  </Label>
                  {currentSourceType === 'paste' ? (
                    <>
                      <Textarea
                        ref={textareaRef}
                        value={currentSourceContent}
                        onChange={(e) => { setCurrentSourceContent(e.target.value); setSourceInputError(''); }}
                        placeholder="Paste notes, an article, a transcript…"
                        className="min-h-[120px] bg-slate-800/50 border-slate-700 text-sm"
                      />
                      <p className="text-xs text-slate-500">{currentSourceContent.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</p>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        value={currentSourceContent}
                        onChange={(e) => { setCurrentSourceContent(e.target.value); setSourceInputError(''); setFetchError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && currentSourceContent.trim()) { e.preventDefault(); void addCurrentSource(); } }}
                        placeholder={currentSourceType === 'topic' ? 'e.g., US Presidents, Space Exploration' : 'https://en.wikipedia.org/wiki/…'}
                        className="flex-1 bg-slate-800/50 border-slate-700"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={currentSourceType === 'topic' ? handleGenerateRandomTopic : handleRandomWikipediaURL}
                        className="text-purple-400 hover:text-purple-300"
                        title={currentSourceType === 'topic' ? 'Random topic' : 'Random Wikipedia article'}
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  {currentSourceType === 'url' && isValidUrl(currentSourceContent) && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleFetchArticle} disabled={isFetching} className="text-blue-400 hover:text-blue-300">
                      {isFetching ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Fetching…</> : <><RefreshCw className="w-3 h-3 mr-1" /> Test fetch</>}
                    </Button>
                  )}
                  {fetchError && <p className="text-sm text-red-400">{fetchError}</p>}
                  {successMessage && <p className="text-sm text-green-400">{successMessage}</p>}
                </div>

                {/* Fill the span */}
                <Button
                  type="button"
                  onClick={() => void addCurrentSource()}
                  disabled={!currentSourceContent.trim() || isFetching}
                  variant="outline"
                  className="w-full justify-center border-dashed border-yellow-600/50 text-yellow-300/90 hover:bg-yellow-500/10 hover:text-yellow-200"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Fill {spanRangeLabel.toLowerCase()}
                </Button>
                </>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-green-600/40 bg-green-500/10 p-3 text-sm text-green-300">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    All 6 columns filled — ready to generate!
                  </div>
                )}

                {sourceInputError && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {sourceInputError}
                  </div>
                )}

                {/* Spans already on the board */}
                {customSources.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">On the board</Label>
                    {(() => {
                      let colStart = 1;
                      return customSources.map((source) => {
                        const start = colStart;
                        const end = colStart + source.categoryCount - 1;
                        colStart = end + 1;
                        return (
                          <div key={source.id} className="p-2.5 bg-slate-800/40 border border-slate-700/70 rounded-xl flex items-center gap-3">
                            <span className="font-board text-[11px] uppercase tracking-wider text-yellow-500/90 bg-slate-900/60 rounded-md px-2 py-1.5 flex-shrink-0">
                              {start === end ? `Col ${start}` : `${start}–${end}`}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-slate-900/60 flex items-center justify-center flex-shrink-0">
                              {source.type === 'topic' && <Zap className="w-3.5 h-3.5 text-purple-400" />}
                              {source.type === 'paste' && <FileText className="w-3.5 h-3.5 text-blue-400" />}
                              {source.type === 'url' && <Globe className="w-3.5 h-3.5 text-green-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-100 truncate">
                                {source.type === 'topic' ? source.topic : source.type === 'paste' ? 'Pasted content' : source.url}
                              </div>
                            </div>
                            <button type="button" onClick={() => handleRemoveSource(source.id)} className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10" aria-label="Remove from board">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Theme */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Theme <span className="normal-case font-normal text-slate-600">(optional)</span>
                  </Label>
                  <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ties your categories together" className="bg-slate-800/50 border-slate-700" />
                </div>

                {/* Difficulty */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Difficulty</Label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {difficultyOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDifficulty(opt.value)}
                        className={`p-3 rounded-xl border text-center transition-all bg-gradient-to-b ${difficulty === opt.value ? 'border-yellow-500 from-yellow-500/15 to-yellow-500/5' : 'border-slate-700/70 from-slate-800/40 to-slate-800/5 hover:border-slate-600'}`}
                      >
                        <div className="text-lg">{opt.icon}</div>
                        <div className={`text-sm font-semibold mt-0.5 ${difficulty === opt.value ? 'text-yellow-300' : 'text-slate-300'}`}>{opt.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live board preview pane (liveboard view, lg+ screens only) */}
              {currentStep === 'liveboard' && (
                <div className="hidden lg:flex flex-col items-center justify-center relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 px-6 py-5 mt-6 lg:mt-0">
                  <div aria-hidden className="absolute inset-0 pointer-events-none bg-[radial-gradient(640px_320px_at_50%_-10%,rgba(37,58,220,0.28),transparent_65%),radial-gradient(400px_260px_at_90%_110%,rgba(250,204,21,0.05),transparent_60%)]" />

                  <div className="absolute top-5 left-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    Live preview — updates as you build
                  </div>

                  <div className="relative text-center">
                    <h2 className="font-board text-3xl xl:text-4xl uppercase tracking-wide text-yellow-400 [text-shadow:0_2px_10px_rgba(0,0,0,0.65)]">
                      {previewTitle}
                    </h2>
                    <p className="text-xs text-slate-500 mt-2 capitalize">
                      {difficulty} difficulty · {plannedColumnCount * 5} clues · {6 - plannedColumnCount} column{6 - plannedColumnCount === 1 ? '' : 's'} open
                    </p>
                  </div>

                  <div className="relative flex gap-1.5 w-full max-w-[760px] mt-6">
                    {previewSpans.map((span) => {
                      const spanEnd = span.startCol + span.columns.length - 1;
                      const rangeText = span.startCol === spanEnd ? `Col ${span.startCol}` : `Cols ${span.startCol}–${spanEnd}`;
                      const spanSource = customSources.find(s => s.id === span.key);
                      return (
                        <div key={span.key} className="flex flex-col gap-1.5 min-w-0" style={{ flexGrow: span.columns.length, flexBasis: 0 }}>
                          {/* Span ribbon — groups the columns that share one source */}
                          {span.state === 'added' ? (
                            <div className="h-6 rounded-md bg-slate-800/70 border border-slate-700/50 flex items-center justify-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 overflow-hidden whitespace-nowrap">
                              {span.sourceType === 'topic' && <Zap className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                              {span.sourceType === 'paste' && <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                              {span.sourceType === 'url' && <Globe className="w-3 h-3 text-green-400 flex-shrink-0" />}
                              {span.columns.length > 1 && rangeText}
                              {spanSource && (
                                <button
                                  type="button"
                                  onClick={() => void regenerateSpanTitles(spanSource)}
                                  disabled={rerollingColKey !== null}
                                  title="Regenerate titles for this span"
                                  aria-label="Regenerate titles for this span"
                                  className="ml-auto p-0.5 rounded text-slate-400 hover:text-yellow-400 disabled:opacity-40 flex-shrink-0"
                                >
                                  <RefreshCw className={`w-3 h-3 ${rerollingColKey === `span-${span.key}` ? 'animate-spin' : ''}`} />
                                </button>
                              )}
                            </div>
                          ) : span.state === 'draft' || span.state === 'next' ? (
                            <div className={`h-6 rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 flex items-center justify-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wider text-yellow-500/90 overflow-hidden whitespace-nowrap ${span.state === 'next' ? 'animate-pulse' : ''}`}>
                              {span.state === 'next' ? '↓ next' : 'filling…'}
                            </div>
                          ) : (
                            <div className="h-6" />
                          )}

                          {/* Category header cells */}
                          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${span.columns.length}, minmax(0, 1fr))` }}>
                            {span.columns.map((col) => (
                              <div
                                key={`head-${col.key}`}
                                className={`relative group h-[70px] rounded-md flex items-center justify-center text-center px-1.5 py-2 ${
                                  col.state === 'added'
                                    ? 'bg-gradient-to-b from-[#13289f] to-[#0c1b74] border border-white/10 shadow-[inset_0_0_0_1px_rgba(0,0,30,0.4)]'
                                    : col.state === 'draft'
                                      ? `bg-gradient-to-b from-[#13289f]/60 to-[#0c1b74]/60 border border-blue-500/30 ${col.pending ? 'animate-pulse' : ''}`
                                      : col.state === 'next'
                                        ? 'border-2 border-dashed border-yellow-500/40 bg-yellow-500/5'
                                        : 'border border-dashed border-slate-800 bg-slate-900/30'
                                }`}
                              >
                                {col.state === 'empty' ? (
                                  <span className="text-slate-700 text-lg">+</span>
                                ) : col.state === 'next' ? (
                                  <span className="text-yellow-500/60 text-lg">+</span>
                                ) : (
                                  <span className={`font-board uppercase leading-tight tracking-wide text-[12px] line-clamp-3 break-words [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] ${
                                    col.state === 'draft' ? 'text-blue-200/90' : 'text-white'
                                  } ${col.pending && col.state === 'added' ? 'animate-pulse opacity-60' : ''}`}>
                                    {col.pending && '✨ '}{col.name ?? col.label}
                                  </span>
                                )}
                                {/* Per-column reroll — appears on hover once a draft title exists */}
                                {col.name && col.unitKey !== undefined && col.idx !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() => void rerollDraftName(col.unitKey!, col.idx!, col.key)}
                                    disabled={rerollingColKey !== null}
                                    title="Reroll this category title"
                                    aria-label="Reroll this category title"
                                    className={`absolute top-1 right-1 p-0.5 rounded text-blue-200/50 hover:text-yellow-400 transition-opacity ${
                                      rerollingColKey === col.key ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                  >
                                    <RefreshCw className={`w-3 h-3 ${rerollingColKey === col.key ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Value cells */}
                          {[200, 400, 600, 800, 1000].map((value) => (
                            <div key={value} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${span.columns.length}, minmax(0, 1fr))` }}>
                              {span.columns.map((col) => (
                                <div
                                  key={`${value}-${col.key}`}
                                  className={`h-[44px] rounded-md flex items-center justify-center ${
                                    col.state === 'added'
                                      ? 'bg-gradient-to-b from-[#13289f] to-[#0c1b74] border border-white/10'
                                      : col.state === 'draft'
                                        ? 'bg-gradient-to-b from-[#13289f]/50 to-[#0c1b74]/50 border border-blue-500/20'
                                        : col.state === 'next'
                                          ? 'border border-dashed border-yellow-500/20 bg-yellow-500/[0.03]'
                                          : 'border border-slate-800/60 bg-slate-900/20'
                                  }`}
                                >
                                  <span className={`font-board tracking-wide text-lg [text-shadow:0_2px_0_rgba(0,0,0,0.55)] ${
                                    col.state === 'added' ? 'text-yellow-400' : col.state === 'draft' ? 'text-yellow-400/50' : col.state === 'next' ? 'text-yellow-500/25' : 'text-slate-800'
                                  }`}>
                                    ${value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {plannedColumnCount === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-sm text-slate-400 bg-slate-950/85 border border-slate-800 rounded-xl px-5 py-3 max-w-[280px] text-center">
                          ← Start with <span className="text-yellow-400 font-semibold">Column 1</span>: give it a topic, pasted content, or a URL
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="relative text-[11px] text-slate-600 mt-5 text-center max-w-md">
                    Draft titles sketch your board as you build (hover a column to reroll it) — final categories, clues and team names are written when you hit Generate.
                  </p>
                </div>
              )}
              </div>
            )}

            {/* ==================== STEP 2: CHOOSE SOURCE TYPE ==================== */}
            {currentStep === 'choose-source' && (
              <div className="space-y-3" role="radiogroup" aria-label="Choose source type">
                <button
                  onClick={() => {
                    setCurrentSourceType('topic');
                    setCurrentSourceContent('');
                    setSourceInputError('');
                    setFetchError('');
                  }}
                  role="radio"
                  aria-checked={currentSourceType === 'topic'}
                  aria-label="Topic source type"
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
                  role="radio"
                  aria-checked={currentSourceType === 'paste'}
                  aria-label="Paste content source type"
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
                  role="radio"
                  aria-checked={currentSourceType === 'url'}
                  aria-label="URL source type"
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && currentSourceContent.trim()) {
                          e.preventDefault();
                          handleNext();
                        }
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && currentSourceContent.trim()) {
                          e.preventDefault();
                          handleNext();
                        }
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
          {/* Demoted creation modes — AI is the primary path */}
          {currentStep === 'liveboard' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isLoading}
                  className="text-slate-500 hover:text-slate-300 text-xs"
                >
                  More options
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={handleManualConfirm}>
                  <Edit className="w-4 h-4 mr-2 text-orange-400" />
                  <div>
                    <div className="text-sm">Manual editor</div>
                    <div className="text-xs text-slate-500">Write everything yourself</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImportJSON}>
                  <Upload className="w-4 h-4 mr-2 text-cyan-400" />
                  <div>
                    <div className="text-sm">Import JSON</div>
                    <div className="text-xs text-slate-500">Load an exported game</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
          {(currentStep === 'composer' || currentStep === 'liveboard') && creationMode === 'ai' && (
            <Button
              type="button"
              onClick={handleComplete}
              disabled={isLoading || customSources.length === 0 || isFetching}
              className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold shadow-lg shadow-yellow-500/20"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Game{customSources.length > 0 ? ` · ${getTotalCategoryCount()} ${getTotalCategoryCount() === 1 ? 'category' : 'categories'}` : ''}
            </Button>
          )}
          {currentStep !== 'choose-mode' && currentStep !== 'composer' && currentStep !== 'liveboard' && creationMode === 'ai' && (
            <Button
              type="button"
              onClick={handleNext}
              disabled={isLoading || (currentStep === 'add-content' && currentSourceType === 'url' && isFetching)}
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
