/**
 * Icon Matcher for Jeopardy Clues
 * Matches relevant icons to clues based on semantic matching
 *
 * Environment-aware configuration:
 * - Local dev: Uses /icons (relative path - expects icons in /public/icons/)
 * - Production: Uses VITE_ICON_BASE_URL environment variable (e.g., Cloudflare R2)
 */

import { getIconSize } from './themes';

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

  async load(): Promise<boolean> {
    // Allow retry if icons are empty (may have failed before symlink was ready)
    if (this.loaded && this.icons.length > 0) return true;

    try {
      const size = getIconSize();
      const response = await fetch(`${ICON_BASE_URL}/size-${size}/meta.json`);
      if (!response.ok) throw new Error('Could not load icon index');
      const data = await response.json();
      this.icons = data.items || [];
      this.loaded = true;
      console.log(`Loaded ${this.icons.length} icons from ${ICON_BASE_URL} (size: ${size}px)`);
      return true;
    } catch (error) {
      // Silent fail - icon service not configured
      this.icons = [];
      this.loaded = true;
      console.warn('IconMatcher: Failed to load icons - icon service not available');
      return false;
    }
  }

  isLoaded(): boolean {
    return this.loaded && this.icons.length > 0;
  }

  // Force reload (useful for debugging or after symlink changes)
  async reload(): Promise<boolean> {
    this.loaded = false;
    this.icons = [];
    return this.load();
  }

  findMatch(clue: string, answer?: string, category?: string): IconMatch | null {
    if (!this.loaded || this.icons.length === 0) return null;

    const clueTokens = tokenize(clue);
    const answerTokens = answer ? tokenize(answer) : [];
    const categoryTokens = category ? tokenize(category) : [];
    const allTokens = [...clueTokens, ...answerTokens, ...categoryTokens];

    if (allTokens.length === 0) return null;

    // Expand tokens with synonyms
    const expandedTokens = new Set(allTokens);
    allTokens.forEach(token => {
      const synonyms = ICON_SYNONYMS.get(token);
      if (synonyms) {
        synonyms.forEach(s => expandedTokens.add(s));
      }
    });

    const tokens = Array.from(expandedTokens);

    let bestMatch: IconMatch | null = null;
    let bestScore = 0;

    for (const icon of this.icons) {
      let score = 0;
      const matchedTokens: string[] = [];

      const iconSlug = icon.slug.split('-');
      const iconTitle = tokenize(icon.title);
      const iconTags = (icon.tags || []).flatMap(tag => tokenize(tag));
      const iconCategory = tokenize(icon.category);

      for (const token of tokens) {
        // Slug match (highest weight)
        if (iconSlug.includes(token)) {
          score += 3;
          matchedTokens.push(token);
        }
        // Title match (medium weight)
        if (iconTitle.includes(token)) {
          score += 2;
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
        }
        // Tag match (lower weight)
        if (iconTags.includes(token)) {
          score += 1.5;
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
        }
        // Category match (lowest weight)
        if (iconCategory.includes(token)) {
          score += 1;
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
        }
      }

      if (score > bestScore && score >= 2) {
        bestScore = score;
        bestMatch = { icon, score, matchedTokens };
      }
    }

    return bestMatch;
  }

  findMatches(clue: string, answer?: string, category?: string, maxResults: number = 5): IconMatch[] {
    if (!this.loaded || this.icons.length === 0) return [];

    const clueTokens = tokenize(clue);
    const answerTokens = answer ? tokenize(answer) : [];
    const categoryTokens = category ? tokenize(category) : [];
    const allTokens = [...clueTokens, ...answerTokens, ...categoryTokens];

    if (allTokens.length === 0) return [];

    // Expand tokens with synonyms (but be more conservative for clue-only matches)
    const expandedTokens = new Set(allTokens);
    allTokens.forEach(token => {
      const synonyms = ICON_SYNONYMS.get(token);
      if (synonyms) {
        synonyms.forEach(s => expandedTokens.add(s));
      }
    });

    const tokens = Array.from(expandedTokens);

    // For clue-only matches, require higher score and prefer more specific matches
    const minScore = answer ? 2 : 4;

    // Debug logging
    if (!answer) {
      console.log('Clue-only matching:', { clue, category, tokens: allTokens });
    }

    // Score all icons
    const scored: IconMatch[] = [];

    for (const icon of this.icons) {
      let score = 0;
      const matchedTokens: string[] = [];

      const iconSlug = icon.slug.split('-');
      const iconTitle = tokenize(icon.title);
      const iconTags = (icon.tags || []).flatMap(tag => tokenize(tag));
      const iconCategory = tokenize(icon.category);

      for (const token of tokens) {
        // Slug match (highest weight) - direct keyword match in slug is best
        if (iconSlug.includes(token)) {
          score += 3;
          matchedTokens.push(token);
        }
        // Title match (medium weight)
        if (iconTitle.includes(token)) {
          score += 2;
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
        }
        // Tag match (lower weight)
        if (iconTags.includes(token)) {
          score += 1.5;
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
        }
        // Category match (lowest weight) - too generic, skip for clue-only
        if (iconCategory.includes(token)) {
          score += 1;
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
        }
      }

      // For clue-only matches, require at least 2 matched tokens or higher single score
      const hasMultipleMatches = matchedTokens.length >= 2;
      const meetsThreshold = score >= minScore;
      const validMatch = answer ? meetsThreshold : (meetsThreshold && hasMultipleMatches);

      if (validMatch) {
        scored.push({ icon, score, matchedTokens });
        if (!answer) {
          console.log('  Match:', icon.title, 'score:', score, 'tokens:', matchedTokens);
        }
      }
    }

    // Sort by score descending and return top matches
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  buildIconUrl(match: IconMatch | null): string | null {
    if (!match) return null;
    const size = getIconSize();
    return `${ICON_BASE_URL}/size-${size}/images/${match.icon.file_name}`;
  }

  search(query: string, maxResults = 12): Array<Icon & { score: number }> {
    if (!query || !this.loaded || this.icons.length === 0) return [];

    const baseTokens = tokenize(query);

    // Expand tokens with synonyms
    const expandedTokens = new Set(baseTokens);
    baseTokens.forEach(token => {
      const synonyms = ICON_SYNONYMS.get(token);
      if (synonyms) {
        synonyms.forEach(s => expandedTokens.add(s));
      }
    });

    const tokens = Array.from(expandedTokens);
    if (tokens.length === 0) return [];

    return this.icons
      .map(icon => {
        let score = 0;
        const iconSlug = icon.slug.split('-');
        const iconTitle = tokenize(icon.title);
        const iconTags = (icon.tags || []).flatMap(tag => tokenize(tag));
        const iconCategory = tokenize(icon.category);

        tokens.forEach(token => {
          if (iconSlug.includes(token)) score += 3;
          if (iconTitle.includes(token)) score += 2;
          if (iconTags.includes(token)) score += 1.5;
          if (iconCategory.includes(token)) score += 1;
        });

        return { ...icon, score };
      })
      .filter(i => i.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}

// Singleton instance
export const iconMatcher = new IconMatcher();
export type { Icon, IconMatch };
