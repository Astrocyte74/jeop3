/**
 * Icon Matcher for Jeopardy Clues
 * Matches relevant icons to clues based on semantic matching
 */

import { getIconSize, type IconSize } from './themes';

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
    if (this.loaded) return true;

    try {
      const size = getIconSize();
      const response = await fetch(`/icons/size-${size}/meta.json`);
      if (!response.ok) throw new Error('Could not load icon index');
      const data = await response.json();
      this.icons = data.items || [];
      this.loaded = true;
      console.log(`Loaded ${this.icons.length} icons (size: ${size}px)`);
      return true;
    } catch (error) {
      console.warn('Failed to load icons:', error);
      this.icons = [];
      this.loaded = true;
      return false;
    }
  }

  isLoaded(): boolean {
    return this.loaded;
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

    // Expand tokens with synonyms
    const expandedTokens = new Set(allTokens);
    allTokens.forEach(token => {
      const synonyms = ICON_SYNONYMS.get(token);
      if (synonyms) {
        synonyms.forEach(s => expandedTokens.add(s));
      }
    });

    const tokens = Array.from(expandedTokens);

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

      if (score >= 2) {
        scored.push({ icon, score, matchedTokens });
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
    return `/icons/size-${size}/images/${match.icon.file_name}`;
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
