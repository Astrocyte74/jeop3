#!/usr/bin/env python3
"""Test glm-4.7-flash directly via Z.AI API"""
from openai import OpenAI
import json
import time
import os

# Use direct Z.AI API
client = OpenAI(
    api_key='1578092c64d84f879016fc6c1e102a43.4jnExZL7UaYICneZ',
    base_url='https://api.z.ai/api/paas/v4/',
)

system_msg = 'You are a Jeopardy game content generator. Always respond with valid JSON only, no prose. No markdown, no explanations, just raw JSON.'

user_msg = '''Generate 2 Jeopardy categories for theme: "pre ww2 events up to Sept 1939".

Difficulty: Balanced difficulty level.

IMPORTANT: Each category needs TWO names:
1. "title" - A creative, catchy display name for players
2. "contentTopic" - The descriptive topic name for AI context

Return JSON format:
{
  "categories": [
    {
      "title": "Creative Display Name",
      "contentTopic": "Descriptive Topic Name",
      "clues": [
        {"value": 200, "clue": "...", "response": "..."},
        {"value": 400, "clue": "...", "response": "..."},
        {"value": 600, "clue": "...", "response": "..."},
        {"value": 800, "clue": "...", "response": "..."},
        {"value": 1000, "clue": "...", "response": "..."}
      ]
    }
  ]
}'''

print("\n" + "="*70)
print("🎯 Testing glm-4.7-flash via DIRECT Z.AI API")
print("   (Not OpenRouter - direct connection)")
print("="*70 + "\n")

print("Prompt: 'pre ww2 events up to Sept 1939' (2 categories)")
print("Sending request...", flush=True)

start = time.time()

response = client.chat.completions.create(
    model='glm-4.7-flash',
    messages=[
        {'role': 'system', 'content': system_msg},
        {'role': 'user', 'content': user_msg},
    ],
    temperature=0.7,
    max_tokens=4000,
    # thinking parameter not supported by OpenAI SDK - Z.AI defaults to disabled
)

duration = time.time() - start
content = response.choices[0].message.content
usage = response.usage

print(f"\n✅ Response received in {duration:.2f}s")
print(f"📝 Tokens: {usage.prompt_tokens} prompt + {usage.completion_tokens} completion = {usage.total_tokens} total\n")

# Clean JSON
content_clean = content.strip()
for prefix in ['```json', '```']:
    if content_clean.startswith(prefix):
        content_clean = content_clean[len(prefix):]
if content_clean.endswith('```'):
    content_clean = content_clean[:-3]
content_clean = content_clean.strip()

try:
    data = json.loads(content_clean)
    cats = data.get('categories', [])

    print(f"📊 Generated {len(cats)} categories:\n")
    for cat in cats:
        print(f"   📁 {cat.get('title', 'N/A')}")
        print(f"      Topic: {cat.get('contentTopic', 'N/A')}")
        if cat.get('clues'):
            clue = cat['clues'][0]
            print(f"      $200: {clue.get('clue', 'N/A')[:50]}...")
            print(f"           Answer: {clue.get('response', 'N/A')}")

    print("\n" + "="*70)
    print("📋 COMPARISON")
    print("="*70)
    print(f"{'Method':<30} {'Time':<12} {'Tokens':<10}")
    print("-"*55)
    print(f"{'Z.AI Direct (glm-4.7-flash)':<30} {duration:>6.2f}s      {usage.total_tokens:<10}")
    print(f"{'OpenRouter (glm-4.7-flash)':<30} {'143.01s':>12} {'2655':<10}")
    print(f"{'OpenRouter (gemini-flash-lite)':<30} {'3.75s':>12} {'978':<10}")

    if duration < 20:
        speedup = 143.01 / duration
        print(f"\n⚡ Z.AI Direct is {speedup:.1f}x faster than OpenRouter for GLM-4.7-Flash!")
    else:
        slowdown = duration / 3.75
        print(f"\n⚠️  Z.AI Direct is {slowdown:.1f}x slower than gemini-flash-lite")

    print("\n" + "="*70)

except Exception as e:
    print(f"❌ Error parsing JSON: {e}")
    print(f"\nRaw response:\n{content[:500]}...")
