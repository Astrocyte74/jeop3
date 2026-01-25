#!/usr/bin/env python3
"""
Quick test - run one model on one test case
Useful for verifying API key and testing new models
"""

import os
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from benchmark_models import (
    MODELS, TEST_CASES, OpenAI, load_env, build_jeopardy_prompt,
    evaluate_response, fetch_model_pricing, format_cost
)

# Quick test configuration
# Change index to test different models:
# 0 = Gemini 3 Flash Preview
# 1 = Gemini 2.5 Flash Lite
# 2 = Gemini 2.5 Flash
# 3 = GLM 4.7 Flash
# 4 = GLM 4.7
# 5 = GPT-4o Mini
# 6 = Grok 4.1 Fast
# 7 = Kimi K2 Thinking
TEST_MODEL = MODELS[0]  # Gemini 3 Flash Preview
TEST_CASE = TEST_CASES[0]  # First test case: Simple Category

def main():
    env = load_env()
    api_key = env.get('OPENROUTER_API_KEY', '')
    base_url = env.get('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1')

    if not api_key:
        print("❌ Error: OPENROUTER_API_KEY not found in .env file")
        return

    print(f"🧪 Quick Test: {TEST_MODEL['name']}")
    print(f"📝 Test Case: {TEST_CASE['name']}")
    print(f"📂 Category: {TEST_CASE['category']}\n")

    # Fetch pricing
    fetch_model_pricing()

    client = OpenAI(api_key=api_key, base_url=base_url)

    prompt = build_jeopardy_prompt(
        category=TEST_CASE["category"],
        content_topic=TEST_CASE["content_topic"],
        theme=TEST_CASE["theme"],
        difficulty=TEST_CASE["difficulty"],
        reference_material=TEST_CASE["reference_material"]
    )

    print("Sending request...\n")

    try:
        import time
        start = time.time()
        response = client.chat.completions.create(
            model=TEST_MODEL["model"],
            messages=[
                {
                    "role": "system",
                    "content": "You are a Jeopardy game content generator. Always respond with valid JSON only, no prose."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
        )
        elapsed = time.time() - start

        response_text = response.choices[0].message.content or ""

        # Extract token usage
        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0

        # Clean response
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            if len(lines) > 1 and lines[0].startswith("```"):
                response_text = "\n".join(lines[1:])
            if response_text.endswith("```"):
                response_text = response_text[:-3].strip()

        print("✅ Response received!")
        print(f"⏱️  Time: {elapsed*1000:.0f}ms\n")
        print("Raw Response:")
        print("-" * 60)
        print(response_text[:1000])
        if len(response_text) > 1000:
            print("... (truncated)")
        print("-" * 60)

        evaluation = evaluate_response(
            response_text,
            [200, 400, 600, 800, 1000],
            elapsed,
            model=TEST_MODEL["model"],
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens
        )

        print("\n📊 Evaluation:")
        print(f"   Valid JSON: {'✅' if evaluation['valid_json'] else '❌'}")
        print(f"   All Values: {'✅' if evaluation['all_values_present'] else '❌'}")
        print(f"   Unique Answers: {'✅' if evaluation['unique_answers'] else '❌'}")
        print(f"   Quality Score: {evaluation['quality_score']}/10")
        print(f"   Tokens: {evaluation['token_usage']['total_tokens']} "
              f"({evaluation['token_usage']['prompt_tokens']} prompt + "
              f"{evaluation['token_usage']['completion_tokens']} completion)")
        print(f"   Cost: {format_cost(evaluation['cost_usd'])}")

        if evaluation['clues']:
            print("\n📝 Generated Clues:")
            for clue in evaluation['clues']:
                value = clue.get("value", "?")
                c = clue.get("clue", "")[:70] + "..." if len(clue.get("clue", "")) > 70 else clue.get("clue", "")
                r = clue.get("response", "")
                print(f"   ${value}: {c}")
                print(f"      → {r}")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
