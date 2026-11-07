/**
 * Icon Matcher for Jeopardy Clues
 * Ranks icon metadata by answer wording, with clue context as a tie-breaker
 *
 * Environment-aware configuration:
 * - Local dev: Uses /icons (relative path - expects icons in /public/icons/)
 * - Production: Uses VITE_ICON_BASE_URL environment variable (e.g., Cloudflare R2)
 */

import { getIconSize, type IconSize } from './themes';

// Environment-aware icon base URL
const ICON_BASE_URL = import.meta.env.VITE_ICON_BASE_URL || '/icons';

interface Icon {
  slug: string;
  file_name: string;
  title: string;
  category: string;
  tags: string[];
}

interface IconMatch {
  icon: Icon;
  score: number;
  matchedTokens: string[];
}

const ICON_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have',
  'how', 'in', 'into', 'is', 'it', 'its', "it's", 'may', 'might', 'must',
  'no', 'not', 'of', 'on', 'or', 'should', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'to', 'true', 'false',
  'up', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'will', 'with', 'would', 'yes', 'you', 'your', 'name', 'called',
  'this', 'these', 'those', 'type', 'kind', 'form',
]);

const ICON_SYNONYMS = new Map([
  ['book', ['novel', 'literature', 'library', 'storybook', 'read']],
  ['wizard', ['mage', 'sorcerer', 'magic', 'spell']],
  ['magic', ['wizard', 'spell', 'sorcery', 'mystic']],
  ['school', ['academy', 'university', 'college']],
  ['movie', ['film', 'cinema', 'motion', 'picture']],
  ['planet', ['world', 'globe']],
  ['tv', ['television', 'television-set', 'screen']],
  ['television', ['tv', 'television-set', 'screen']],
  ['phone', ['telephone', 'mobile', 'smartphone']],
  ['photo', ['photograph', 'picture', 'image']],
  ['info', ['information', 'data']],
  ['app', ['application', 'software']],
  ['msg', ['message', 'text', 'chat']],
  ['wifi', ['wireless', 'internet', 'network']],
  ['email', ['mail', 'electronic-mail']],
  ['game', ['sport', 'play', 'match']],
  ['country', ['nation', 'land', 'state']],
  ['city', ['town', 'village', 'place']],
  ['person', ['people', 'human', 'individual']],
  ['man', ['male', 'guy', 'person']],
  ['woman', ['female', 'lady', 'person']],
  ['food', ['eat', 'meal', 'dish']],
  ['music', ['song', 'sound', 'melody']],
]);

function tokenize(value: string): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map(token => token.trim())
    .filter(token => token && token.length > 1 && !ICON_STOP_WORDS.has(token));
}

class IconMatcher {
  private icons: Icon[] = [];
  private loaded = false;
  private loadedSize: IconSize | null = null;

  async load(): Promise<boolean> {
    // Allow retry if icons are empty (may have failed before symlink was ready)
    if (this.loaded && this.icons.length > 0) return true;

    const preferredSize = getIconSize();
    const sizes: IconSize[] = preferredSize === '1024' ? ['1024'] : [preferredSize, '1024'];
    for (const size of sizes) {
      try {
        const response = await fetch(`${ICON_BASE_URL}/size-${size}/meta.json`);
        if (!response.ok) throw new Error('Could not load icon index');
        const data = await response.json();
        if (!Array.isArray(data.items) || data.items.length === 0) {
          throw new Error('Icon index has no items');
        }
        this.icons = data.items;
        this.loadedSize = size;
        this.loaded = true;
        console.log(`Loaded ${this.icons.length} icons from ${ICON_BASE_URL} (size: ${size}px)`);
        return true;
      } catch {
        // A full-resolution-only collection can serve older size preferences too.
        // Vite may return HTML for a missing catalog, so JSON errors also fall back.
      }
    }
    this.icons = [];
    this.loadedSize = null;
    this.loaded = true;
    console.warn('IconMatcher: Failed to load icons - icon service not available');
    return false;
  }

  isLoaded(): boolean {
    return this.loaded && this.icons.length > 0;
  }

  // Force reload (useful for debugging or after symlink changes)
  async reload(): Promise<boolean> {
    this.loaded = false;
    this.icons = [];
    this.loadedSize = null;
    return this.load();
  }

  findMatch(clue: string, answer?: string, category?: string): IconMatch | null {
    return this.findMatches(clue, answer, category, 1)[0] || null;
  }

  findMatches(clue: string, answer?: string, category?: string, maxResults = 5): IconMatch[] {
    // Answer words establish relevance; clue and category only break close matches.
    return this.rank(answer || clue, answer ? `${clue} ${category || ''}` : category || '', maxResults);
  }

  private rank(query: string, context: string, maxResults: number): IconMatch[] {
    if (!this.isLoaded()) return [];
    const queryTokens = tokenize(query);
    const terms = [...new Set(queryTokens)];
    if (!terms.length) return [];
    const phrase = queryTokens.join(' ');
    const contextTerms = [...new Set(tokenize(context))].filter(t => !terms.includes(t));
    const scored: IconMatch[] = [];

    for (const icon of this.icons) {
      const title = tokenize(icon.title);
      const slug = tokenize(icon.slug);
      const identity = new Set([...title, ...slug]);
      const tags = new Set((icon.tags || []).flatMap(tokenize));
      const category = new Set(tokenize(icon.category));
      const matchedTokens = terms.filter(t => identity.has(t) || tags.has(t));
      // Require most of the answer, not a shared surname or generic category.
      if (matchedTokens.length / terms.length < 0.75) continue;

      let score = matchedTokens.reduce((sum, t) => sum + (identity.has(t) ? 6 : 2), 0);
      const names = [title.join(' '), slug.join(' ')];
      if (names.includes(phrase)) score += 40;
      else if (names.some(name => ` ${name} `.includes(` ${phrase} `))) score += 15;

      // Synonyms are a small bonus, never sufficient to create a match by themselves.
      for (const term of terms) {
        if ((ICON_SYNONYMS.get(term) || []).some(s => identity.has(s) || tags.has(s))) score += 0.5;
      }
      const contextScore = contextTerms.reduce((sum, t) =>
        sum + (identity.has(t) ? 2 : tags.has(t) ? 1 : category.has(t) ? 0.25 : 0), 0);
      score += Math.min(contextScore, 6);
      scored.push({ icon, score, matchedTokens });
    }

    return scored.sort((a, b) => b.score - a.score || a.icon.title.localeCompare(b.icon.title))
      .slice(0, maxResults);
  }

  buildIconUrl(match: IconMatch | null): string | null {
    if (!match || !this.loadedSize) return null;
    return `${ICON_BASE_URL}/size-${this.loadedSize}/images/${match.icon.file_name}`;
  }

  search(query: string, maxResults = 12): Array<Icon & { score: number }> {
    return this.rank(query, '', maxResults).map(({ icon, score }) => ({ ...icon, score }));
  }
}

// Singleton instance
export const iconMatcher = new IconMatcher();
export type { Icon, IconMatch };
