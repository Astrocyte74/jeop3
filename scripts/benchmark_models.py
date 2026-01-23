#!/usr/bin/env python3
"""
AI Model Benchmark for Jeop3 Jeopardy Question Generation

This script tests various AI models on their ability to generate
high-quality Jeopardy questions, evaluating:
- JSON format adherence
- Question quality and clarity
- Response time
- Completeness (all 5 clue values)
- Answer uniqueness

Usage:
    python scripts/benchmark_models.py
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional
from openai import OpenAI
import requests

# Load environment variables
def load_env():
    """Load .env file and return variables"""
    env_file = Path(__file__).parent.parent / ".env"
    env_vars = {}

    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    # Handle ${VAR} references
                    if '${' in line:
                        var_name = line.split('${')[1].split('}')[0]
                        line = line.replace(f'${{{var_name}}}', env_vars.get(var_name, ''))

                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()

    return env_vars

# Load environment
env = load_env()
OPENROUTER_API_KEY = env.get('OPENROUTER_API_KEY', '')
OPENAI_BASE_URL = env.get('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1')

# Cache for model pricing
MODEL_PRICING: Dict[str, Dict[str, float]] = {}

def fetch_model_pricing() -> Dict[str, Dict[str, float]]:
    """Fetch model pricing from OpenRouter API"""
    global MODEL_PRICING

    if MODEL_PRICING:
        return MODEL_PRICING

    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        for model in data.get("data", []):
            model_id = model.get("id", "")
            pricing = model.get("pricing", {})
            if pricing:
                MODEL_PRICING[model_id] = {
                    "prompt": float(pricing.get("prompt", 0)),
                    "completion": float(pricing.get("completion", 0)),
                }

        print(f"✓ Fetched pricing for {len(MODEL_PRICING)} models")
    except Exception as e:
        print(f"⚠️  Could not fetch pricing: {e}")
        print("    Continuing without cost tracking")

    return MODEL_PRICING

def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate cost in USD for a given model and token usage"""
    pricing = MODEL_PRICING.get(model, {})
    if not pricing:
        return 0.0

    prompt_cost = (prompt_tokens / 1_000_000) * pricing.get("prompt", 0)
    completion_cost = (completion_tokens / 1_000_000) * pricing.get("completion", 0)

    return prompt_cost + completion_cost

def format_cost(cost: float) -> str:
    """Format cost for display"""
    if cost == 0:
        return "N/A"
    elif cost < 0.001:
        return f"${cost * 1_000_000:.1f}μ"
    elif cost < 0.01:
        return f"${cost * 1000:.2f}m"
    else:
        return f"${cost:.4f}"

# Models to benchmark
# Note: Check https://openrouter.ai/models for current model list and pricing
MODELS = [
    {
        "id": "gemini-3-flash-preview",
        "name": "Gemini 3 Flash Preview",
        "model": "google/gemini-3-flash-preview"
    },
    {
        "id": "gemini-2.5-flash-lite",
        "name": "Gemini 2.5 Flash Lite",
        "model": "google/gemini-2.5-flash-lite"
    },
    {
        "id": "gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "model": "google/gemini-2.5-flash"
    },
    {
        "id": "glm-4.7-flash",
        "name": "GLM 4.7 Flash",
        "model": "z-ai/glm-4.7-flash"
    },
    {
        "id": "glm-4.7",
        "name": "GLM 4.7",
        "model": "z-ai/glm-4.7"
    },
    {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "model": "openai/gpt-4o-mini"
    },
    {
        "id": "grok-4.1-fast",
        "name": "Grok 4.1 Fast",
        "model": "x-ai/grok-4.1-fast"
    },
    {
        "id": "kimi-k2-thinking",
        "name": "Kimi K2 Thinking",
        "model": "moonshotai/kimi-k2-thinking"
    },
]

# Test prompts based on Jeop3's actual prompts
TEST_CASES = [
    {
        "name": "Simple Category (No Source)",
        "category": "U.S. Presidents",
        "content_topic": "U.S. Presidents",
        "theme": "American History",
        "difficulty": "normal",
        "reference_material": None,
    },
    {
        "name": "Complex Category with Source Material",
        "category": "Solar System Facts",
        "content_topic": "Solar System",
        "theme": "Space Science",
        "difficulty": "normal",
        "reference_material": """
The solar system consists of the Sun and eight planets: Mercury, Venus, Earth, Mars,
Jupiter, Saturn, Uranus, and Neptune. Jupiter is the largest planet with a mass
greater than all other planets combined. Saturn is famous for its prominent ring
system made of ice and rock. Mars is known as the Red Planet due to iron oxide on
its surface. Venus is the hottest planet with surface temperatures around 900°F.
Mercury is the smallest planet and closest to the Sun. Neptune is the windiest
planet with speeds up to 1,200 mph. Uranus rotates on its side with an axial tilt
of 98 degrees. Earth is the only planet known to support life.
        """.strip(),
    },
    {
        "name": "Pop Culture Category",
        "category": "Marvel Movies",
        "content_topic": "Marvel Cinematic Universe",
        "theme": "Pop Culture",
        "difficulty": "normal",
        "reference_material": None,
    },
]

def build_jeopardy_prompt(category: str, content_topic: str, theme: str,
                          difficulty: str = "normal",
                          reference_material: str = None) -> str:
    """Build a Jeopardy prompt similar to Jeop3's actual prompts"""

    difficulty_text = {
        'easy': 'Make questions accessible and straightforward.',
        'normal': 'Balanced difficulty level.',
        'hard': 'Make questions challenging and specific.'
    }.get(difficulty, 'Balanced difficulty level.')

    value_guidance = {
        200: "Obvious / very well-known facts",
        400: "Common knowledge within topic",
        600: "Requires familiarity with the topic",
        800: "Niche or specific details",
        1000: "Deep cuts / less obvious information"
    }

    guidance_text = "\n".join([f"- ${v}: {value_guidance[v]}" for v in [200, 400, 600, 800, 1000]])

    ref_material_text = ""
    if reference_material:
        ref_material_text = f"""
Source material to use for questions:
{reference_material[:3000]}

All clues must be answerable from the source material above.
"""

    return f"""Generate 5 Jeopardy-style clues for the category: "{category}"

Content Topic: "{content_topic}"
Theme: {theme}

{difficulty_text}

Value guidelines:
{guidance_text}
{ref_material_text}
REQUIREMENTS:
- Each clue must have a DIFFERENT unique answer
- Clues must be in proper Jeopardy form (answers given as questions)
- Clues should be clear, accurate, and engaging
- Do NOT use the category name or any form of it in your clues

Return JSON format:
{{
  "clues": [
    {{"value": 200, "clue": "...", "response": "..."}},
    {{"value": 400, "clue": "...", "response": "..."}},
    {{"value": 600, "clue": "...", "response": "..."}},
    {{"value": 800, "clue": "...", "response": "..."}},
    {{"value": 1000, "clue": "...", "response": "..."}}
  ]
}}"""

def evaluate_response(response_text: str, expected_values: List[int],
                      elapsed_time: float, model: str = "",
                      prompt_tokens: int = 0, completion_tokens: int = 0) -> Dict[str, Any]:
    """Evaluate the AI response on multiple criteria"""

    result = {
        "valid_json": False,
        "parse_error": None,
        "all_values_present": False,
        "missing_values": [],
        "unique_answers": False,
        "duplicate_answers": [],
        "clue_count": 0,
        "response_time_ms": round(elapsed_time * 1000, 2),
        "clues": [],
        "quality_score": 0,
        "token_usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        "cost_usd": calculate_cost(model, prompt_tokens, completion_tokens),
    }

    # Try to parse JSON
    try:
        data = json.loads(response_text)
        result["valid_json"] = True

        # Extract clues
        clues = data.get("clues", [])
        result["clue_count"] = len(clues)
        result["clues"] = clues

        if not clues:
            result["parse_error"] = "No clues found in response"
            return result

        # Check all values present
        present_values = [c.get("value") for c in clues if "value" in c]
        missing = [v for v in expected_values if v not in present_values]
        result["missing_values"] = missing
        result["all_values_present"] = len(missing) == 0

        # Check unique answers
        responses = [c.get("response", "").strip().lower() for c in clues if c.get("response")]
        unique_responses = set(responses)

        # Find duplicates
        seen = {}
        duplicates = []
        for i, r in enumerate(responses):
            if r in seen:
                duplicates.append(f"Value {clues[i].get('value')}: {r}")
            seen[r] = seen.get(r, 0) + 1

        result["unique_answers"] = len(responses) == len(unique_responses)
        result["duplicate_answers"] = duplicates

        # Quality scoring (0-10)
        score = 10

        # Penalty for missing values
        score -= len(missing) * 2

        # Penalty for duplicates
        score -= len(duplicates) * 3

        # Penalty for missing fields
        for clue in clues:
            if not clue.get("clue"):
                score -= 1
            if not clue.get("response"):
                score -= 1

        # Penalty for too few clues
        if len(clues) < 5:
            score -= (5 - len(clues)) * 1

        result["quality_score"] = max(0, min(10, score))

    except json.JSONDecodeError as e:
        result["parse_error"] = f"JSON parse error: {str(e)[:50]}"

    return result

def test_model(model_config: Dict, test_case: Dict, client: OpenAI) -> Dict[str, Any]:
    """Test a single model on a single test case"""

    prompt = build_jeopardy_prompt(
        category=test_case["category"],
        content_topic=test_case["content_topic"],
        theme=test_case["theme"],
        difficulty=test_case["difficulty"],
        reference_material=test_case["reference_material"]
    )

    start_time = time.time()

    try:
        response = client.chat.completions.create(
            model=model_config["model"],
            messages=[
                {
                    "role": "system",
                    "content": "You are a Jeopardy game content generator. Always respond with valid JSON only, no prose. No markdown, no explanations, just raw JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=2000,
        )

        elapsed = time.time() - start_time
        response_text = response.choices[0].message.content or ""

        # Extract token usage
        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0

        # Clean response (remove markdown code blocks if present)
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            if len(lines) > 1 and lines[0].startswith("```"):
                response_text = "\n".join(lines[1:])
            if response_text.endswith("```"):
                response_text = response_text[:-3].strip()

        evaluation = evaluate_response(
            response_text,
            [200, 400, 600, 800, 1000],
            elapsed,
            model=model_config["model"],
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens
        )

        return {
            "success": True,
            "response_text": response_text,
            "evaluation": evaluation,
            "error": None,
        }

    except Exception as e:
        elapsed = time.time() - start_time
        return {
            "success": False,
            "response_text": None,
            "evaluation": {
                "valid_json": False,
                "parse_error": str(e),
                "response_time_ms": round(elapsed * 1000, 2),
                "quality_score": 0,
                "token_usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                },
                "cost_usd": 0.0,
            },
            "error": str(e),
        }

def print_results(results: Dict):
    """Print benchmark results in a nice format"""

    print("\n" + "=" * 100)
    print("JEOPARDY AI MODEL BENCHMARK RESULTS")
    print("=" * 100)

    # Summary table
    print("\n📊 SUMMARY TABLE")
    print("-" * 110)
    print(f"{'Model':<28} {'Valid':<8} {'Values':<8} {'Unique':<8} {'Time':<10} {'Quality':<10} {'Cost/Gen':<12} {'Total Cost':<12}")
    print("-" * 110)

    for model_id, model_results in results.items():
        valid_count = sum(1 for r in model_results["results"] if r["evaluation"]["valid_json"])
        all_values_count = sum(1 for r in model_results["results"] if r["evaluation"]["all_values_present"])
        unique_count = sum(1 for r in model_results["results"] if r["evaluation"]["unique_answers"])
        avg_time = sum(r["evaluation"]["response_time_ms"] for r in model_results["results"]) / len(model_results["results"])
        avg_quality = sum(r["evaluation"]["quality_score"] for r in model_results["results"]) / len(model_results["results"])
        total_cost = sum(r["evaluation"]["cost_usd"] for r in model_results["results"])
        avg_cost = total_cost / len(model_results["results"])

        print(f"{model_results['name']:<28} {valid_count}/{len(model_results['results']):<7} "
              f"{all_values_count}/{len(model_results['results']):<7} "
              f"{unique_count}/{len(model_results['results']):<7} "
              f"{avg_time:>7.0f}ms  {avg_quality:>6.1f}/10  "
              f"{format_cost(avg_cost):<12} {format_cost(total_cost):<12}")

    print("-" * 110)

    # Detailed results per model
    for model_id, model_results in results.items():
        print(f"\n{'=' * 100}")
        print(f"🤖 {model_results['name']} ({model_id})")
        print(f"{'=' * 100}")

        for i, test_result in enumerate(model_results["results"]):
            test_case = TEST_CASES[i]
            eval_result = test_result["evaluation"]

            print(f"\n📝 Test: {test_case['name']}")
            print(f"   Category: {test_case['category']}")

            if not test_result["success"]:
                print(f"   ❌ ERROR: {test_result['error']}")
                continue

            status = "✅" if eval_result["valid_json"] else "❌"
            print(f"   {status} JSON Valid: {eval_result['valid_json']}")

            if eval_result["parse_error"]:
                print(f"   ⚠️  Parse Error: {eval_result['parse_error']}")

            print(f"   {'✅' if eval_result['all_values_present'] else '❌'} All Values Present: {eval_result['all_values_present']}")
            if eval_result["missing_values"]:
                print(f"      Missing: {eval_result['missing_values']}")

            print(f"   {'✅' if eval_result['unique_answers'] else '❌'} Unique Answers: {eval_result['unique_answers']}")
            if eval_result["duplicate_answers"]:
                print(f"      Duplicates: {eval_result['duplicate_answers']}")

            print(f"   ⏱️  Response Time: {eval_result['response_time_ms']}ms")
            print(f"   ⭐ Quality Score: {eval_result['quality_score']}/10")
            print(f"   💰 Cost: {format_cost(eval_result['cost_usd'])} "
                  f"({eval_result['token_usage']['total_tokens']} tokens)")

            if eval_result["clues"]:
                print(f"\n   Generated Clues:")
                for clue in eval_result["clues"]:
                    value = clue.get("value", "?")
                    clue_text = clue.get("clue", "")[:60] + "..." if len(clue.get("clue", "")) > 60 else clue.get("clue", "")
                    response = clue.get("response", "")[:40] + "..." if len(clue.get("response", "")) > 40 else clue.get("response", "")
                    print(f"      ${value}: {clue_text}")
                    print(f"         → {response}")

    # Recommendations
    print(f"\n{'=' * 100}")
    print("💡 RECOMMENDATIONS")
    print(f"{'=' * 100}")

    # Calculate overall scores
    model_scores = []
    for model_id, model_results in results.items():
        avg_quality = sum(r["evaluation"]["quality_score"] for r in model_results["results"]) / len(model_results["results"])
        success_rate = sum(1 for r in model_results["results"] if r["evaluation"]["valid_json"]) / len(model_results["results"])
        avg_time = sum(r["evaluation"]["response_time_ms"] for r in model_results["results"]) / len(model_results["results"])
        total_cost = sum(r["evaluation"]["cost_usd"] for r in model_results["results"])

        model_scores.append({
            "id": model_id,
            "name": model_results["name"],
            "avg_quality": avg_quality,
            "success_rate": success_rate,
            "avg_time": avg_time,
            "total_cost": total_cost,
        })

    # Sort by quality score
    model_scores.sort(key=lambda x: x["avg_quality"], reverse=True)

    print("\n🏆 Ranked by Quality Score:")
    for i, model in enumerate(model_scores, 1):
        print(f"   {i}. {model['name']}: {model['avg_quality']:.1f}/10 "
              f"({model['success_rate']*100:.0f}% success, {model['avg_time']:.0f}ms avg, {format_cost(model['total_cost'])} total)")

    print("\n⚡ Fastest Models:")
    model_scores_sorted_speed = sorted(model_scores, key=lambda x: x["avg_time"])
    for i, model in enumerate(model_scores_sorted_speed[:3], 1):
        print(f"   {i}. {model['name']}: {model['avg_time']:.0f}ms avg ({format_cost(model['total_cost'])})")

    print("\n💸 Most Cost-Effective (Quality per dollar):")
    # Calculate value score (quality / cost * 1000 for better numbers)
    for model in model_scores:
        if model['total_cost'] > 0:
            model['value_score'] = (model['avg_quality'] / model['total_cost']) if model['total_cost'] > 0 else 0
        else:
            model['value_score'] = model['avg_quality'] * 1000  # Free models get bonus

    model_scores_sorted_value = sorted(model_scores, key=lambda x: x['value_score'], reverse=True)
    for i, model in enumerate(model_scores_sorted_value[:3], 1):
        cost_str = "FREE" if model['total_cost'] == 0 else format_cost(model['total_cost'])
        print(f"   {i}. {model['name']}: {model['avg_quality']:.1f}/10 for {cost_str}")

    print("\n" + "=" * 100)

def main():
    """Main benchmark function"""

    if not OPENROUTER_API_KEY:
        print("❌ Error: OPENROUTER_API_KEY not found in .env file")
        return

    print("🚀 Starting Jeop3 AI Model Benchmark...")
    print(f"Testing {len(MODELS)} models on {len(TEST_CASES)} test cases")
    print(f"API Base: {OPENAI_BASE_URL}")

    # Fetch model pricing
    print("\n📊 Fetching model pricing...")
    fetch_model_pricing()

    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENAI_BASE_URL,
    )

    results = {}

    for model in MODELS:
        print(f"\n🧪 Testing {model['name']}...")
        model_results = {
            "name": model["name"],
            "model": model["model"],
            "results": []
        }

        for test_case in TEST_CASES:
            print(f"   → {test_case['name']}")
            test_result = test_model(model, test_case, client)
            model_results["results"].append(test_result)

        results[model["id"]] = model_results

    # Print results
    print_results(results)

    # Save results to file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_file = Path(__file__).parent.parent / f"benchmark_results_{timestamp}.json"

    # Clean results for JSON serialization
    clean_results = {}
    for model_id, model_data in results.items():
        clean_results[model_id] = {
            "name": model_data["name"],
            "model": model_data["model"],
            "results": []
        }
        for r in model_data["results"]:
            clean_results[model_id]["results"].append({
                "success": r["success"],
                "evaluation": r["evaluation"],
                "error": r["error"],
                "response_text": r["response_text"][:500] if r["response_text"] else None,  # Truncate for file
            })

    with open(results_file, "w") as f:
        json.dump(clean_results, f, indent=2)

    print(f"\n💾 Results saved to: {results_file}")

if __name__ == "__main__":
    main()
