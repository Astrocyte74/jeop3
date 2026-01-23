#!/usr/bin/env python3
"""
Side-by-side comparison of clue quality between models
Shows actual generated clues for qualitative assessment
"""
import os
import sys
import json
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from benchmark_models import OpenAI, load_env, build_jeopardy_prompt, fetch_model_pricing

# Models to compare
MODELS_TO_COMPARE = [
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
        "id": "gemini-3-flash-preview",
        "name": "Gemini 3 Flash Preview",
        "model": "google/gemini-3-flash-preview"
    },
]

# Test categories for quality comparison
TEST_CATEGORIES = [
    {
        "name": "U.S. Presidents",
        "content_topic": "U.S. Presidents",
        "theme": "American History",
        "difficulty": "normal",
        "reference_material": None
    },
    {
        "name": "World Capitals",
        "content_topic": "World Capitals",
        "theme": "Geography",
        "difficulty": "normal",
        "reference_material": None
    },
    {
        "name": "Shakespeare",
        "content_topic": "William Shakespeare",
        "theme": "Literature",
        "difficulty": "normal",
        "reference_material": None
    },
]

def clean_response(response_text):
    """Clean markdown code blocks from response"""
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        if len(lines) > 1 and lines[0].startswith("```"):
            response_text = "\n".join(lines[1:])
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()
    return response_text

def generate_clues(client, model_config, category):
    """Generate clues for a category"""
    prompt = build_jeopardy_prompt(
        category=category["name"],
        content_topic=category["content_topic"],
        theme=category["theme"],
        difficulty=category["difficulty"],
        reference_material=category["reference_material"]
    )

    try:
        start = time.time()
        response = client.chat.completions.create(
            model=model_config["model"],
            messages=[
                {
                    "role": "system",
                    "content": "You are a Jeopardy game content generator. Always respond with valid JSON only, no prose. No markdown, no explanations, just raw JSON."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
        )
        elapsed = time.time() - start
        response_text = clean_response(response.choices[0].message.content or "")

        data = json.loads(response_text)
        return {
            "success": True,
            "clues": data.get("clues", []),
            "time_ms": elapsed * 1000
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "clues": []
        }

def print_comparison(category_name, results):
    """Print side-by-side comparison for a category"""

    print(f"\n{'=' * 140}")
    print(f"📂 CATEGORY: {category_name}")
    print(f"{'=' * 140}")

    # For each value level (200, 400, 600, 800, 1000)
    for value in [200, 400, 600, 800, 1000]:
        print(f"\n{'─' * 140}")
        print(f"  💰 ${value} CLUES")
        print(f"{'─' * 140}")

        for model_result in results:
            model_name = model_result["model"]["name"]
            clues = model_result["clues"]

            # Find the clue for this value
            clue = next((c for c in clues if c.get("value") == value), None)

            if clue:
                clue_text = clue.get("clue", "")[:70] + "..." if len(clue.get("clue", "")) > 70 else clue.get("clue", "")
                answer = clue.get("response", "")

                print(f"\n  🤖 {model_name}")
                print(f"     Clue: {clue_text}")
                print(f"     → {answer}")
            else:
                print(f"\n  🤖 {model_name}")
                print(f"     ❌ No clue generated for ${value}")

        print()  # blank line between value levels

def assess_quality(results):
    """Provide subjective quality assessment"""
    print(f"\n{'=' * 140}")
    print("🎯 QUALITY ASSESSMENT")
    print(f"{'=' * 140}\n")

    for category_results in results:
        category_name = category_results["category"]
        models_data = category_results["models"]

        print(f"📂 {category_name}:\n")

        for model_data in models_data:
            model_name = model_data["model"]["name"]
            clues = model_data["clues"]

            if not clues:
                print(f"  ❌ {model_name}: Failed to generate clues\n")
                continue

            # Quality criteria
            print(f"  🤖 {model_name}:")

            # 1. Variety - are answers unique?
            answers = [c.get("response", "").lower().strip() for c in clues]
            unique_answers = len(set(answers))
            print(f"     Variety: {unique_answers}/5 unique answers")

            # 2. Clue length - Jeopardy clues should be concise but descriptive
            avg_length = sum(len(c.get("clue", "")) for c in clues) / len(clues)
            print(f"     Clue Length: avg {avg_length:.0f} chars {'✓' if 40 < avg_length < 150 else '⚠️'}")

            # 3. Value appropriateness - check if clues match difficulty
            # (Simple heuristic: longer clues often = harder/more detail)
            print(f"     Value Progression: {clues[0].get('clue', '')[:40]}... → {clues[-1].get('clue', '')[:40]}...")

            # 4. Jeopardy-ness - do clues sound like Jeopardy?
            # Check for common Jeopardy patterns
            jeopardy_style_count = 0
            for clue in clues:
                clue_text = clue.get("clue", "")
                # Good indicators
                if any(phrase in clue_text.lower() for phrase in ["this", "these", "who", "what", "where", "for", "known as"]):
                    jeopardy_style_count += 1
            print(f"     Jeopardy Style: {jeopardy_style_count}/5 clues {'✓' if jeopardy_style_count >= 4 else '⚠️'}")

            print()

def main():
    env = load_env()
    api_key = env.get('OPENROUTER_API_KEY', '')
    base_url = env.get('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1')

    if not api_key:
        print("❌ Error: OPENROUTER_API_KEY not found in .env file")
        return

    print("🎨 CLUE QUALITY COMPARISON")
    print("=" * 140)
    print("Comparing Gemini 2.5 Flash Lite vs 2.5 Flash vs 3 Flash Preview")
    print("Focus on actual question quality, creativity, and Jeopardy-style\n")

    fetch_model_pricing()
    client = OpenAI(api_key=api_key, base_url=base_url)

    all_results = []

    for category in TEST_CATEGORIES:
        print(f"\n⏳ Generating clues for: {category['name']}...")

        category_results = {
            "category": category["name"],
            "models": []
        }

        for model in MODELS_TO_COMPARE:
            print(f"   → {model['name']}...", end="", flush=True)
            result = generate_clues(client, model, category)

            category_results["models"].append({
                "model": model,
                "clues": result.get("clues", []),
                "success": result["success"]
            })

            if result["success"]:
                print(f" ✓ ({result['time_ms']:.0f}ms)")
            else:
                print(f" ✗ FAILED")

        all_results.append(category_results)

    # Print side-by-side comparisons
    for category_result in all_results:
        print_comparison(category_result["category"], category_result["models"])

    # Quality assessment
    assess_quality(all_results)

    print(f"\n{'=' * 140}")
    print("✅ Comparison complete!")
    print(f"{'=' * 140}\n")

if __name__ == "__main__":
    main()
