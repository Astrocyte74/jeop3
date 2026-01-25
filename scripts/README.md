# Jeop3 AI Model Benchmark Scripts

Scripts for testing and comparing AI models on Jeopardy question generation.

## Files

- **`benchmark_models.py`** - Full benchmark suite testing multiple models on multiple test cases
- **`quick_test.py`** - Quick single test to verify API key and test individual models
- **`README.md`** - This file

## Setup

1. Ensure `.env` file exists in the project root with:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   ```

2. Install dependencies:
   ```bash
   pip install openai
   ```

## Usage

### Quick Test
Test one model quickly to verify setup:
```bash
python scripts/quick_test.py
```

### Full Benchmark
Test all models on all test cases:
```bash
python scripts/benchmark_models.py
```

Results are saved to `benchmark_results_YYYYMMDD_HHMMSS.json` in the project root.

## Models Tested

The benchmark tests these models (configurable in `benchmark_models.py`):

- Gemini 2.5 Flash Lite (free tier)
- Gemini 2.5 Flash (free tier)
- GLM-4.7 Flash
- GPT-4o Mini
- Claude 3.5 Haiku

## Evaluation Criteria

Each model response is evaluated on:

- **JSON Validity** - Response is parseable JSON
- **All Values Present** - All 5 clue values (200, 400, 600, 800, 1000) are generated
- **Unique Answers** - No duplicate responses across clues
- **Response Time** - How fast the model responds
- **Quality Score** - Composite score 0-10 based on above criteria

## Test Cases

1. **Simple Category (No Source)** - "U.S. Presidents" - tests general knowledge
2. **Source Material Category** - "Solar System Facts" - tests using provided reference text
3. **Pop Culture Category** - "Marvel Movies" - tests contemporary knowledge

## Customization

To test additional models:

1. Add model config to `MODELS` list in `benchmark_models.py`:
```python
{
    "id": "model-id",
    "name": "Display Name",
    "model": "or:provider/model-name"
}
```

2. To test with free tier models on OpenRouter, use:
   - `or:google/gemini-2.0-flash-exp:free`
   - `or:google/gemini-2.0-flash-thinking-exp:free`
   - `or:meta-llama/llama-3.3-8b-instruct:free`

## Security

- Scripts read API key from `.env` file (never hardcode keys)
- `.env` files are in `.gitignore`
- Benchmark results truncate response text for safety
