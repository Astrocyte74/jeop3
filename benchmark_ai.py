#!/usr/bin/env python3
"""
Jeop3 AI Model Benchmark Script

Compares GLM-4.7-Flash vs Gemini-2.5-Flash-Lite for Jeopardy game generation.
Uses OpenRouter API for both models to keep comparison fair.

Usage: python benchmark_ai.py
"""

import json
import time
import os
from datetime import datetime
from openai import OpenAI

# Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")

MODELS_TO_TEST = [
    "google/gemini-2.5-flash-lite",
    "z-ai/glm-4.7-flash",
]

# Use the same prompt as the original comparison
TEST_PROMPT = {
    "promptType": "categories-generate",
    "context": {
        "theme": "pre ww2 events up to Sept 1939",
        "count": 6
    },
    "difficulty": "normal"
}

# The prompt template from the server
def build_prompt(type, context, difficulty):
    SYSTEM_INSTRUCTION = "You are a Jeopardy game content generator. Always respond with valid JSON only, no prose. No markdown, no explanations, just raw JSON."

    VALUE_GUIDANCE = {
        200: "Obvious / very well-known facts",
        400: "Common knowledge within topic",
        600: "Requires familiarity with the topic",
        800: "Niche or specific details",
        1000: "Deep cuts / less obvious information"
    }

    difficulty_text = 'Balanced difficulty level.'

    if type == 'categories-generate':
        user_prompt = f"""Generate {context.get('count', 6)} Jeopardy categories for theme: "{context.get('theme', 'general')}".

Difficulty: {difficulty_text}

Value guidelines:
- 200: {VALUE_GUIDANCE[200]}
- 400: {VALUE_GUIDANCE[400]}
- 600: {VALUE_GUIDANCE[600]}
- 800: {VALUE_GUIDANCE[800]}
- 1000: {VALUE_GUIDANCE[1000]}

IMPORTANT: Each category needs TWO names:
1. "title" - A creative, catchy display name for players (e.g., "Geography Genius", "Word Wizards")
2. "contentTopic" - The descriptive topic name for AI context (e.g., "World Capitals", "Literary Terms")

The title should be fun and creative while the contentTopic should be clear and descriptive.

Return JSON format:
{{
  "categories": [
    {{
      "title": "Creative Display Name",
      "contentTopic": "Descriptive Topic Name",
      "clues": [
        {{"value": 200, "clue": "...", "response": "..."}},
        {{"value": 400, "clue": "...", "response": "..."}},
        {{"value": 600, "clue": "...", "response": "..."}},
        {{"value": 800, "clue": "...", "response": "..."}},
        {{"value": 1000, "clue": "...", "response": "..."}}
      ]
    }}
  ]
}}"""

        return {
            "system": SYSTEM_INSTRUCTION,
            "user": user_prompt
        }

    return {"system": SYSTEM_INSTRUCTION, "user": "Generate Jeopardy content."}


def call_openrouter(model, system_prompt, user_prompt):
    """Call OpenRouter API with the given model and prompts."""
    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )

    start_time = time.time()

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=8000,
    )

    duration = time.time() - start_time
    content = response.choices[0].message.content

    # Get token usage from response
    usage = response.usage if hasattr(response, 'usage') else None

    return content, duration, usage


def extract_json(content):
    """Extract JSON from AI response, handling markdown code blocks."""
    content = content.strip()

    # Remove markdown code blocks if present
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]

    if content.endswith("```"):
        content = content[:-3]

    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"  ⚠️  JSON parse error: {e}")
        print(f"  Raw content preview: {content[:200]}...")
        return None


def evaluate_quality(data):
    """Evaluate the quality of generated content."""
    if not data or "categories" not in data:
        return {
            "valid_json": False,
            "has_categories": False,
            "category_count": 0,
            "total_clues": 0,
            "complete_clues": 0,
            "issues": ["No valid JSON or missing categories"]
        }

    categories = data.get("categories", [])
    issues = []

    # Check category count
    expected_categories = 6
    actual_categories = len(categories)
    if actual_categories != expected_categories:
        issues.append(f"Expected {expected_categories} categories, got {actual_categories}")

    # Check each category
    total_clues = 0
    complete_clues = 0
    title_creativity = []

    for cat in categories:
        clues = cat.get("clues", [])
        total_clues += len(clues)

        # Check if category has all 5 clues
        if len(clues) == 5:
            complete_clues += 1
        elif len(clues) != 5:
            issues.append(f"Category '{cat.get('title', 'unknown')}' has {len(clues)} clues instead of 5")

        # Check each clue
        expected_values = [200, 400, 600, 800, 1000]
        actual_values = [c.get("value") for c in clues]

        if sorted(actual_values) != sorted(expected_values):
            issues.append(f"Category '{cat.get('title', 'unknown')}' has incorrect values: {actual_values}")

        # Check for required fields
        for clue in clues:
            if not clue.get("clue"):
                issues.append(f"Missing clue text in category '{cat.get('title', 'unknown')}'")
            if not clue.get("response"):
                issues.append(f"Missing response in category '{cat.get('title', 'unknown')}'")

        # Assess title creativity (simple heuristic)
        title = cat.get("title", "")
        content_topic = cat.get("contentTopic", "")
        if not title or not content_topic:
            issues.append(f"Missing title or contentTopic in category")

        # Bonus for creative titles (not just repeating the topic)
        if title and content_topic and title.lower() not in content_topic.lower():
            title_creativity.append(title)

    return {
        "valid_json": True,
        "has_categories": len(categories) > 0,
        "category_count": len(categories),
        "total_clues": total_clues,
        "complete_clues": complete_clues,
        "creative_titles": len(title_creativity),
        "issues": issues
    }


def print_result(model, content, duration, usage, quality):
    """Print test result for a single model."""
    print(f"\n{'='*70}")
    print(f"📊 Model: {model}")
    print(f"{'='*70}")
    print(f"⏱️  Time: {duration:.2f}s")
    if usage:
        print(f"📝 Tokens: {usage.prompt_tokens} prompt + {usage.completion_tokens} completion = {usage.total_tokens} total")

    # Quality metrics
    status = "✅ PASS" if quality["valid_json"] and quality["complete_clues"] == 6 else "⚠️  ISSUES"
    print(f"📈 Status: {status}")
    print(f"   - Valid JSON: {quality['valid_json']}")
    print(f"   - Categories: {quality['category_count']}/6 complete")
    print(f"   - Total clues: {quality['total_clues']}/30")
    print(f"   - Creative titles: {quality['creative_titles']}/6")

    if quality["issues"]:
        print(f"\n⚠️  Issues:")
        for issue in quality["issues"][:5]:  # Show first 5 issues
            print(f"   - {issue}")
        if len(quality["issues"]) > 5:
            print(f"   - ... and {len(quality['issues']) - 5} more")

    return status == "✅ PASS"


def main():
    """Run the benchmark comparison."""
    print("\n" + "="*70)
    print("🎯 Jeop3 AI Model Benchmark")
    print("   Comparing GLM-4.7-Flash vs Gemini-2.5-Flash-Lite")
    print("   Test prompt: 'pre ww2 events up to Sept 1939'")
    print("="*70)

    # Build the prompt
    prompt = build_prompt(
        TEST_PROMPT["promptType"],
        TEST_PROMPT["context"],
        TEST_PROMPT["difficulty"]
    )

    results = []

    for model in MODELS_TO_TEST:
        print(f"\n🔄 Testing {model}...")
        try:
            content, duration, usage = call_openrouter(
                model,
                prompt["system"],
                prompt["user"]
            )

            # Parse and evaluate
            data = extract_json(content)
            quality = evaluate_quality(data)

            # Print result
            passed = print_result(model, content, duration, usage, quality)

            results.append({
                "model": model,
                "duration": duration,
                "usage": {
                    "prompt_tokens": usage.prompt_tokens if usage else 0,
                    "completion_tokens": usage.completion_tokens if usage else 0,
                    "total_tokens": usage.total_tokens if usage else 0,
                } if usage else None,
                "quality": quality,
                "passed": passed,
                "content": data
            })

        except Exception as e:
            print(f"\n❌ Error testing {model}: {e}")
            results.append({
                "model": model,
                "error": str(e)
            })

    # Print summary comparison
    print("\n" + "="*70)
    print("📋 SUMMARY COMPARISON")
    print("="*70)

    # Sort by duration
    valid_results = [r for r in results if "error" not in r]
    valid_results.sort(key=lambda x: x["duration"])

    print(f"\n{'Model':<40} {'Time':<10} {'Status':<10} {'Creative':<10}")
    print("-"*70)

    for r in valid_results:
        model_short = r["model"].split("/")[-1]
        time_str = f"{r['duration']:.1f}s"
        status_str = "✅ PASS" if r["passed"] else "⚠️  FAIL"
        creative_str = f"{r['quality']['creative_titles']}/6"
        print(f"{model_short:<40} {time_str:<10} {status_str:<10} {creative_str:<10}")

    # Speed comparison
    if len(valid_results) >= 2:
        fastest = valid_results[0]
        slowest = valid_results[-1]
        speedup = slowest["duration"] / fastest["duration"]
        print(f"\n⚡ Speed: {fastest['model'].split('/')[-1]} is {speedup:.1f}x faster than {slowest['model'].split('/')[-1]}")

    # Cost estimate (OpenRouter pricing as of Jan 2025)
    print(f"\n💰 Estimated Cost (per 1M tokens):")
    print(f"   - gemini-2.5-flash-lite: ~$0.075 input / ~$0.30 output")
    print(f"   - glm-4.7-flash: ~$0.07 input / ~$0.20 output (estimated)")

    # Save results to file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"benchmark_results_{timestamp}.json"
    with open(filename, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n💾 Results saved to: {filename}")

    # Print sample content from the fastest model
    if valid_results:
        fastest = valid_results[0]
        print(f"\n📄 Sample output from {fastest['model'].split('/')[-1]}:")
        print("-"*70)
        if fastest.get("content") and "categories" in fastest["content"]:
            for i, cat in enumerate(fastest["content"]["categories"][:2], 1):
                print(f"\nCategory {i}: {cat.get('title', 'N/A')}")
                print(f"  Topic: {cat.get('contentTopic', 'N/A')}")
                if cat.get("clues"):
                    clue = cat["clues"][0]
                    print(f"  $200: {clue.get('clue', 'N/A')[:60]}...")
                    print(f"       Answer: {clue.get('response', 'N/A')}")

    print("\n" + "="*70)
    print("✅ Benchmark complete!")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
