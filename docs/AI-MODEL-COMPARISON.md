# AI Model Comparison - Pre-WWII Quiz Generation Test

**Test Date:** 2025-01-14
**Prompt:** "pre ww2 events up to Sept 1939"
**Test Type:** Full game generation (6 categories × 5 clues each)
**Significance:** Quiz generation is an excellent real-world AI benchmark because it exposes weaknesses immediately: factual drift, scope creep, difficulty calibration, and category coherence.

---

## Test Methodology

All models were tested with identical parameters:
- **Prompt Type:** `categories-generate` (full game)
- **Difficulty:** Normal
- **Expected Output:** 6 categories with 5 clues each (200, 400, 600, 800, 1000)
- **Format Requirements:** Valid JSON with category titles, clues, and responses

---

## Models Tested

| Model | Provider | Time | Status |
|-------|----------|------|--------|
| gemma3:12b | Ollama (local) | 1 min 5s | Complete |
| gpt-oss:20b-cloud | Ollama (local) | 1 min 3s | Complete |
| google/gemini-2.5-flash-lite | OpenRouter | 8s | Complete ⭐ |
| google/gemini-2.5-flash | OpenRouter | 9s | Complete |
| google/gemini-3-pro-preview | OpenRouter | 38s | Complete |
| moonshotai/kimi-k2-thinking | OpenRouter | 34s | Not shared |
| x-ai/grok-4.1-fast | OpenRouter | 23s | Complete |
| z-ai/glm-4.7 | OpenRouter | 54s | Complete |
| z-ai/glm-4.7-flash | OpenRouter/Direct | 134-143s | ❌ Too slow |

---

## Detailed Assessment by Model

### 1. gemma3:12b (Ollama - Local)
**Time:** 1 min 5s

**Strengths:**
- Good category selection (Spanish Civil War, Anschluss, League of Nations)
- Solid historical knowledge overall
- Well-formatted JSON output
- Works offline/no API costs

**Weaknesses:**
- Factual errors: Lists Rhineland as 1938 (actual: 1936)
- Mixes post-Sept 1939 events (Invasion of Poland was Sept 1, but context matters)
- Slow for local model (65 seconds)
- Some difficulty calibration issues

**Best Use:** Offline/local usage, cost-sensitive applications

---

### 2. gpt-oss:20b-cloud (Ollama - Local)
**Time:** 1 min 3s

**Critical Issues:**
- **Format Failure:** Generated questions instead of answers in "response" fields
- **Scope Violation:** Included WWII events (Battle of Britain, Stalingrad - both 1940+)
- **Poor Fact-Checking:** Incorrect dates and relationships
- Not suitable for quiz generation without post-processing

**Best Use:** Avoid for quiz generation

---

### 3. google/gemini-2.5-flash-lite (OpenRouter)
**Time:** 8 seconds

**Strengths:**
- Excellent factual accuracy
- Perfect time scope adherence (all events pre-Sept 1939)
- Good category structure
- Extremely fast (8 seconds for full game)
- Cost-effective (flash-lite tier)

**Weaknesses:**
- Some generic category titles ("The 1930s")
- Less creative wordplay in titles

**Best Use:** Default model for most use cases - best speed/accuracy/cost balance

---

### 4. google/gemini-2.5-flash (OpenRouter)
**Time:** 9 seconds

**Strengths:**
- Excellent factual accuracy
- Strong category coherence
- Good variety of topics (political, military, diplomatic)
- Fast performance (9 seconds)
- Better category titles than flash-lite

**Weaknesses:**
- Minor: Some categories could be more creative

**Best Use:** Primary recommendation for quiz generation - excellent all-around performer

---

### 5. google/gemini-3-pro-preview (OpenRouter)
**Time:** 38 seconds

**Critical Issues:**
- Failed to generate multiple title options (only returned 1 instead of 3)
- Significantly slower without quality improvement
- No discernable advantage over flash models
- Higher cost for slower performance

**Best Use:** Not recommended for quiz generation

---

### 6. moonshotai/kimi-k2-thinking (OpenRouter)
**Time:** 34 seconds

**Status:** Results were not shared in detail

**Best Use:** Insufficient data for assessment

---

### 7. x-ai/grok-4.1-fast (OpenRouter)
**Time:** 23 seconds

**Strengths:**
- Best category titles (most creative and engaging)
- Excellent factual accuracy
- Strong thematic coherence
- Good difficulty progression
- More sophisticated approach to topics

**Weaknesses:**
- Slower than Gemini flash models (23s vs 8-9s)
- May be overly serious in tone

**Best Use:** Serious trivia applications where title creativity matters more than speed

---

### 8. z-ai/glm-4.7 (OpenRouter)
**Time:** 54 seconds

**Strengths:**
- **Best creative titles** - "The Dress Rehearsal" for Spanish Civil War is exceptionally clever
- Excellent factual accuracy across most clues
- Perfect scope adherence (all events pre-Sept 1939)
- Strong category coherence - each stays tightly on topic
- Great variety of topics (political, military, diplomatic, US-focused)
- Perfect JSON structure
- Good difficulty progression

**Weaknesses:**
- Slow (54s) - slower than gemini-flash (9s) and grok (23s)
- **Missing team names** - did not generate suggestedTeamNames (not critical)
- **Historical accuracy issues** (validated by ChatGPT):
  1. **Anti-Comintern Pact ($600)** - Incorrect order: was Germany+Japan first (1936), Italy joined later (1937), not "Germany and Italy first"
  2. **Rome-Berlin Axis ($800)** - "Friendship treaty" is loose terminology; "Axis" wasn't a formal treaty name but a diplomatic alignment
  3. **Spanish Civil War coup ($1000)** - "Led" is ambiguous; coup involved multiple generals (Mola, Sanjurjo, Franco)
  4. **King of Italy ($1000)** - "Declared him deposed" is odd wording; should be "dismissed him"

**Best Use:** Premium trivia applications where title creativity is the highest priority, **but requires validation pass** for historical accuracy

**Note:** Team names can be generated separately using AI features if needed. For competitive trivia use, recommend a fact-check pass on generated content.

---

### 9. z-ai/glm-4.7-flash (OpenRouter & Z.AI Direct)
**Time:** 134-143 seconds for 2 categories (estimated ~7-8 minutes for full game)

**Critical Issues:**
- **Extremely slow:** 36-38x slower than gemini-2.5-flash-lite
- **"Flash" branding misleading:** Not optimized for structured JSON generation
- **Token inefficient:** Uses 2.3x more tokens than Gemini for same output
- **Unusable for real-time:** Users would wait 7-8 minutes for game generation

**Strengths:**
- Valid JSON output
- Good category titles when it completes
- Advertised as "free" (but speed penalty outweighs cost savings)

**Weaknesses:**
- Prohibitively slow for interactive use
- No quality advantage over faster models
- Direct Z.AI API only marginally faster than OpenRouter (134s vs 143s)

**Best Use:** **NOT recommended for Jeop3** - only consider for offline batch processing where users don't wait for results. The "free" cost is not worth the user experience penalty.

**Test Date:** 2026-01-19 (2-category test via OpenRouter and direct Z.AI API)

---

## Rankings by Category

### Overall Quality (Best to Worst)
1. **gemini-2.5-flash** - Excellent accuracy, fast, well-formatted
2. **gemini-2.5-flash-lite** - Nearly identical quality at lower cost
3. **grok-4.1-fast** - Best titles (tied with GLM), faster than GLM, more accurate
4. **glm-4.7** - **Best titles**, excellent content, slower, **needs validation for historical accuracy**
5. **gemma3:12b** - Good for local, some factual errors
6. **gpt-oss:20b-cloud** - Format failures
7. **gemini-3-pro-preview** - Failed requirements, slow

### Speed (Fastest to Slowest)
1. **gemini-2.5-flash-lite** - 8s ⭐
2. **gemini-2.5-flash** - 9s
3. **grok-4.1-fast** - 23s
4. **kimi-k2-thinking** - 34s
5. **gemini-3-pro-preview** - 38s
6. **glm-4.7** - 54s
7. **gpt-oss:20b-cloud** - 1 min 3s
8. **gemma3:12b** - 1 min 5s
9. **glm-4.7-flash** - 134-143s ❌ (Not competitive)

### Category Title Creativity (Best to Worst)
1. **glm-4.7** - **Most creative** ("The Dress Rehearsal", "Signed, Sealed, Delivered")
2. **grok-4.1-fast** - Excellent engaging titles
3. **gemini-2.5-flash** - Good balance of creative and clear
4. **gemini-2.5-flash-lite** - Slightly more generic
5. **gemma3:12b** - Functional but plain
6. **gpt-oss:20b-cloud** - Poor format, unclear titles

### Factual Accuracy (Best to Worst)
1. **gemini-2.5-flash** - Consistently accurate
2. **gemini-2.5-flash-lite** - Consistently accurate
3. **grok-4.1-fast** - Highly accurate
4. **glm-4.7** - Mostly accurate with **2-3 fixable historical issues** (Anti-Comintern Pact, Rome-Berlin Axis, Spanish coup leadership)
5. **gemma3:12b** - Some errors (Rhineland date)
6. **gpt-oss:20b-cloud** - Scope violations, format issues

### Local/Offline Options (Best to Worst)
1. **gemma3:12b** - Usable with validation
2. **gpt-oss:20b-cloud** - Not recommended for quizzes

---

## Key Findings

### What Quiz Generation Exposes

1. **Factual Drift:** Models often conflate similar historical events
2. **Scope Creep:** Difficulty adhering to date ranges (pre-Sept 1939)
3. **Difficulty Calibration:** Maintaining appropriate challenge levels
4. **Format Consistency:** Some models generate questions instead of answers
5. **Category Coherence:** Keeping clues thematically related
6. **JSON Structure:** Technical ability to output valid nested structures

### Model Behavior Patterns

**Flash Models (gemini-2.5-flash, flash-lite):**
- Optimized for speed without sacrificing quality
- Excellent at following structured output requirements
- Strong fact retrieval within scope constraints
- Best for general quiz generation

**Pro Models (gemini-3-pro-preview):**
- Slower without demonstrable quality improvement
- May be overthinking simple structured tasks
- Failed specific output requirements (title count)

**Local Models (Ollama):**
- Significant performance penalty (60+ seconds vs 8-9 seconds)
- Variable quality depending on training
- Better for privacy/offline use than performance

**Grok Model:**
- More sophisticated/serious approach
- Superior title creativity
- Good for applications where engagement matters more than speed

**GLM 4.7:**
- **Best title creativity** - exceptional wordplay and clever phrasing
- Premium quality with slower speed
- Excellent for high-end trivia applications
- May skip optional fields (team names) - can be generated separately

---

## Recommendations

### For Jeop3 Default Selection
**Recommendation:** `google/gemini-2.5-flash-lite`

**Rationale:**
- Best speed (8 seconds)
- Excellent factual accuracy
- Perfect scope adherence
- Cost-effective
- Consistent JSON formatting

### For Premium/Quality-Focused Applications
**Recommendation:** `google/gemini-2.5-flash`

**Rationale:**
- Slightly better category titles
- Same speed as flash-lite
- Excellent overall quality

### For Creative Title Quality (Best for Trivia Content)
**Recommendation:** `z-ai/glm-4.7` **with validation**

**Rationale:**
- **Most creative titles** - exceptional wordplay ("The Dress Rehearsal", "Signed, Sealed, Delivered")
- Good factual accuracy with 2-3 fixable issues per game
- Strong category coherence
- **Requires:** Quick fact-check pass for competitive trivia use
- **Note:** May skip optional team names; can generate separately via AI features

**Historical Accuracy Score:** 7.5-8/10 (would cause "that's not quite right" moments without validation)

### For Serious Trivia Applications
**Recommendation:** `x-ai/grok-4.1-fast`

**Rationale:**
- Excellent engaging category titles
- Sophisticated content
- Faster than GLM 4.7 (23s vs 54s)
- Good for competitive/serious trivia contexts

### For Local/Offline Usage
**Recommendation:** `ollama:gemma3:12b` with validation

**Rationale:**
- Works without internet
- Decent quality with some factual errors
- Requires post-generation validation
- Consider adding a "fact-check" step in the pipeline

### Models to Avoid
- **z-ai/glm-4.7-flash:** **36-38x slower than Gemini** - "free" but unusable for real-time game generation
- **gpt-oss:20b-cloud:** Format failures, scope violations
- **gemini-3-pro-preview:** Slower, failed requirements, no quality benefit
- **phi3:** Too small for complex JSON generation (based on separate testing)

---

## Implementation Notes

### Recommended .env Configuration
```bash
# Primary models (OpenRouter)
OR_MODELS=google/gemini-2.5-flash-lite,google/gemini-2.5-flash,z-ai/glm-4.7,x-ai/grok-4.1-fast

# Local/Offline models (Ollama)
OLLAMA_MODELS=gemma3:12b

# Default selection
DEFAULT_MODEL=or:google/gemini-2.5-flash-lite
```

### Model Selection Strategy
```typescript
// Default to flash-lite for speed
const defaultModel = 'or:google/gemini-2.5-flash-lite';

// Use flash for premium generation
const premiumModel = 'or:google/gemini-2.5-flash';

// Use GLM 4.7 for best title creativity (slower)
const creativeModel = 'or:z-ai/glm-4.7';

// Use grok for serious trivia (faster than GLM)
const seriousModel = 'or:x-ai/grok-4.1-fast';

// Fall back to local if no internet
const offlineModel = 'ollama:gemma3:12b';

// NOTE: glm-4.7-flash is NOT recommended despite being "free"
// It is 36-38x slower than gemini-2.5-flash-lite and unusable for real-time game generation
```

### Validation Recommendations

For local models (gemma3:12b), consider adding:
1. **Date validation:** Check all events against time range
2. **Format validation:** Ensure responses are answers, not questions
3. **Fact-checking:** Verify critical historical dates
4. **Scope checking:** Flag potential scope violations

---

## Conclusion

This test demonstrates that **flash-optimized models** (gemini-2.5-flash series) are superior for quiz generation applications. They offer:
- Best speed/quality ratio
- Consistent format adherence
- Strong factual accuracy
- Cost-effective operation

**Creative-focused models** (GLM 4.7, Grok) excel at title creativity and engagement but are significantly slower. However, GLM 4.7 requires a validation pass for historical accuracy (7.5-8/10 accuracy score with 2-3 fixable issues per game).

**For competitive trivia:** Use gemini-2.5-flash or grok-4.1-fast for reliability.

**For casual trivia:** GLM 4.7's creative titles make it engaging, but validate facts first.

**Local models** remain viable for offline scenarios but require validation layers and have significant performance penalties.

**Pro/thinking models** show no advantage for structured generation tasks and are slower.

**Model specialization matters:**
- **Flash models:** Fast, accurate, structured output - best default
- **GLM 4.7:** Best title creativity, premium quality, requires validation
- **Grok:** Sophisticated approach, good engagement, reliable accuracy
- **Local:** Privacy/offline capability

---

## Future Testing Recommendations

1. **Test with different eras/topics** to verify patterns hold
2. **Test "easy" and "hard" difficulty** settings
3. **Test single-clue generation** vs full games
4. **Test prompt types:** category-rename, question-generate-single, etc.
5. **Longitudinal testing:** Re-test after model updates
6. **Cost analysis:** Track actual API costs per model

---

---

# 2026-01-19 Update: GLM-4.7-Flash Testing

**Test Date:** 2026-01-19
**Test Focus:** GLM-4.7-Flash (new "free" model from Z.AI)
**Prompt:** "pre ww2 events up to Sept 1939" (2 categories)
**Significance:** GLM-4.7-Flash was advertised as "Lightweight, Completely Free" - testing if it could replace gemini-2.5-flash-lite as the default model.

## Test Results

| Model | Provider | Time (2 cat) | Tokens | Status |
|-------|----------|--------------|--------|--------|
| google/gemini-2.5-flash-lite | OpenRouter | **3.75s** | 978 | ✅ Winner |
| z-ai/glm-4.7-flash | OpenRouter | 143s | 2,655 | ❌ 38x slower |
| z-ai/glm-4.7-flash | Z.AI Direct | 134s | 2,256 | ❌ 36x slower |

## Findings

**GLM-4.7-Flash is NOT competitive for real-time game generation.**

### Speed Comparison
- **gemini-2.5-flash-lite:** 3.75s for 2 categories (~11s for full 6-category game)
- **glm-4.7-flash:** 134-143s for 2 categories (~7-8 minutes for full game)

### Why is GLM-4.7-Flash so slow?

The "Flash" branding appears to be misleading for this use case. Possible explanations:
1. **Different optimization target:** May be optimized for code completion or single-turn responses, not structured JSON generation
2. **Cold start issues:** Z.AI infrastructure may have scaling problems
3. **Chain of Thought:** Even with `thinking: disabled`, the model may still be performing internal reasoning

### Quality Assessment

Despite being slow, GLM-4.7-Flash produced valid output with:
- Good category titles ("Diplomatic Disasters", "The Age of Dictators")
- Proper JSON structure
- Appropriate clue difficulty

However, the speed penalty makes it unusable for real-time game generation where users are waiting.

## Recommendation: NO CHANGE

**Continue using `google/gemini-2.5-flash-lite` as the default model.**

GLM-4.7-Flash being "free" does not justify the 36-38x performance penalty. For game generation, user experience (speed) matters more than API costs.

### Cost Analysis

Even assuming GLM-4.7-Flash is completely free:
- **User experience:** 3.75s vs 134+ seconds waiting
- **Token efficiency:** Gemini uses 2.3x fewer tokens
- **Reliability:** Gemini is proven and consistent

The "free" model would cost more in user frustration and abandoned games.

### When might GLM-4.7-Flash be useful?

- **Batch processing:** Generating games offline for later use
- **Non-interactive scenarios:** Where speed doesn't matter
- **Budget-constrained backends:** If API costs are the primary concern and users can wait

For Jeop3's use case (real-time game creation), these scenarios don't apply.

---

*Document created: 2025-01-14*
*Last updated: 2026-01-19 (added GLM 4.7-Flash test results)*
*Test platform: Jeop3 AI Server + Direct API testing*
*Models tested: 9 (2 Ollama local, 7 OpenRouter/Direct)*
