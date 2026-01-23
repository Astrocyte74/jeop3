#!/usr/bin/env python3
"""
Quick comparison of top models
"""
import os
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from benchmark_models import (
    OpenAI, load_env, build_jeopardy_prompt, evaluate_response,
    fetch_model_pricing, format_cost, MODELS, TEST_CASES
)

# Top models to compare
COMPARE_MODELS = [
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
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "model": "openai/gpt-4o-mini"
    },
    {
        "id": "grok-4.1-fast",
        "name": "Grok 4.1 Fast",
        "model": "x-ai/grok-4.1-fast"
    },
]

def main():
    env = load_env()
    api_key = env.get('OPENROUTER_API_KEY', '')
    base_url = env.get('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1')

    if not api_key:
        print("❌ Error: OPENROUTER_API_KEY not found in .env file")
        return

    print("🔥 QUICK SHOWDOWN: Top Models Comparison")
    print("=" * 60)
    fetch_model_pricing()

    client = OpenAI(api_key=api_key, base_url=base_url)

    results = {}

    for model in COMPARE_MODELS:
        print(f"\n🧪 {model['name']}...")
        model_results = []

        for test_case in TEST_CASES:
            prompt = build_jeopardy_prompt(
                category=test_case["category"],
                content_topic=test_case["content_topic"],
                theme=test_case["theme"],
                difficulty=test_case["difficulty"],
                reference_material=test_case["reference_material"]
            )

            try:
                start = time.time()
                response = client.chat.completions.create(
                    model=model["model"],
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
                response_text = response.choices[0].message.content or ""

                # Clean response
                if response_text.startswith("```"):
                    lines = response_text.split("\n")
                    if len(lines) > 1 and lines[0].startswith("```"):
                        response_text = "\n".join(lines[1:])
                    if response_text.endswith("```"):
                        response_text = response_text[:-3].strip()

                usage = response.usage
                prompt_tokens = usage.prompt_tokens if usage else 0
                completion_tokens = usage.completion_tokens if usage else 0

                evaluation = evaluate_response(
                    response_text, [200, 400, 600, 800, 1000], elapsed,
                    model=model["model"],
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens
                )

                model_results.append({
                    "success": True,
                    "evaluation": evaluation,
                    "test_name": test_case["name"]
                })

                print(f"   ✓ {test_case['name']}: {evaluation['quality_score']}/10 "
                      f"({evaluation['response_time_ms']:.0f}ms, {evaluation['token_usage']['total_tokens']} tokens)")

            except Exception as e:
                print(f"   ✗ {test_case['name']}: {str(e)[:50]}")
                model_results.append({
                    "success": False,
                    "error": str(e),
                    "test_name": test_case["name"]
                })

        results[model["id"]] = {
            "name": model["name"],
            "results": model_results
        }

    # Print summary
    print("\n" + "=" * 70)
    print("📊 FINAL SHOWDOWN RESULTS")
    print("=" * 70)

    print(f"\n{'Model':<25} {'Quality':<10} {'Speed':<12} {'Tokens':<10} {'Success'}")
    print("-" * 70)

    rankings = []
    for model_id, data in results.items():
        valid_results = [r for r in data["results"] if r["success"]]
        avg_quality = sum(r["evaluation"]["quality_score"] for r in valid_results) / len(valid_results) if valid_results else 0
        avg_time = sum(r["evaluation"]["response_time_ms"] for r in valid_results) / len(valid_results) if valid_results else 0
        avg_tokens = sum(r["evaluation"]["token_usage"]["total_tokens"] for r in valid_results) / len(valid_results) if valid_results else 0
        success_rate = len(valid_results) / len(data["results"])

        rankings.append({
            "name": data["name"],
            "avg_quality": avg_quality,
            "avg_time": avg_time,
            "avg_tokens": avg_tokens,
            "success_rate": success_rate
        })

        print(f"{data['name']:<25} {avg_quality:>6.1f}/10  "
              f"{avg_time:>7.0f}ms  {avg_tokens:>6.0f}  {success_rate*100:.0f}%")

    print("-" * 70)
    print("\n🏆 RANKED BY QUALITY:")
    rankings.sort(key=lambda x: x["avg_quality"], reverse=True)
    for i, r in enumerate(rankings, 1):
        print(f"   {i}. {r['name']}: {r['avg_quality']:.1f}/10 ({r['avg_time']:.0f}ms)")

    print("\n⚡ FASTEST:")
    rankings.sort(key=lambda x: x["avg_time"])
    for i, r in enumerate(rankings[:3], 1):
        print(f"   {i}. {r['name']}: {r['avg_time']:.0f}ms ({r['avg_quality']:.1f}/10)")

    print("\n" + "=" * 70)

if __name__ == "__main__":
    main()
