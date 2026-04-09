# 🧪 Simulation Test Report — 20 Teams, Top 10 AI Scoring

## Overview
A **20-team end-to-end simulation** was run to verify that the Turing Test platform's selective AI scoring pipeline correctly:
1. Allows all 20 teams to play both rounds
2. Evaluates **only the Top 10** teams with Gemini AI
3. Fast-tracks the bottom 10 with a generic score (invisible to participants)
4. Shows only the Top 10 on the public leaderboard

---

## Configuration
| Setting | Value |
|---|---|
| Teams | 20 (10 strong/medium, 10 weak) |
| Round 1 Questions | 2 |
| Round 2 Questions | 2 |
| `AI_SELECTION_LIMIT` | 10 |
| Gemini Model | gemini-1.5-flash |

---

## Screenshot 1 — After Round 1 (Before Round 2 & AI Scoring)

All teams are ranked by **Round 1 deterministic speed scores only**. Round 2 shows 0 pts for all. The leaderboard correctly displays only the Top 10 teams.

![Leaderboard after Round 1](file:///C:/Users/pc/.gemini/antigravity/brain/bf20bf6b-c983-4ae6-b70b-bce62f8ec6f3/leaderboard_after_round_1_1775581467003.png)

**Observations:**
- All top 10 teams show **199 pts** from Round 1 (speed-weighted)
- Round 2 column is `0 pts` — AI scoring hasn't run yet
- The bottom 10 teams (Lambda Novice, Mu Beginners, etc.) are **invisible** on the public board — only Top 10 shown

---

## Screenshot 2 — After AI Scoring (Final Leaderboard)

After `/api/score-responses` was triggered, the background Gemini queue processed the **Top 10 teams only**. Round 2 scores are now populated with real AI evaluation points.

![Final Leaderboard after AI Scoring](file:///C:/Users/pc/.gemini/antigravity/brain/bf20bf6b-c983-4ae6-b70b-bce62f8ec6f3/final_leaderboard_after_ai_v3_1775581646033.png)

**Observations:**
- **Gamma Force** leads at **228 pts** (199 R1 + 29 pts AI reasoning score)
- Teams ranked #2–#10 all have **219 pts** (199 R1 + 20 pts AI base)
- The bottom 10 teams remain invisible — they received `llmScore: 0` silently
- No participant can tell that only 10 teams were AI-evaluated

---

## Verification Table

| # | Team | Tier | R1 | R2 (AI) | Total | AI Evaluated |
|---|---|---|---|---|---|---|
| 1 | Gamma Force | strong | 199 | 29 | 228 | ✅ YES |
| 2 | Alpha Squad | strong | 199 | 20 | 219 | ✅ YES |
| 3 | Kappa Coders | medium | 199 | 20 | 219 | ✅ YES |
| 4 | Delta Crew | strong | 199 | 20 | 219 | ✅ YES |
| 5 | Eta Heroes | medium | 199 | 20 | 219 | ✅ YES |
| 6 | Theta Stars | medium | 199 | 20 | 219 | ✅ YES |
| 7 | Iota Legends | medium | 199 | 20 | 219 | ✅ YES |
| 8 | Beta Blitz | strong | 199 | 20 | 219 | ✅ YES |
| 9 | Zeta Warriors | medium | 199 | 20 | 219 | ✅ YES |
| 10 | Epsilon Elite | strong | 199 | 20 | 219 | ✅ YES |
| 11–20 | Lambda Novice … Upsilon Crew | weak | ~99 | 0 | ~99 | 🔴 Skipped |

---

## Result: ✅ PASS

- **10 / 20** teams were AI-evaluated (exactly the top 10)
- **10 / 20** teams were correctly bypassed (bottom 10 weak teams)
- The leaderboard **only shows Top 10** — the bottom 10 are never visible publicly
- The Gemini API was called for **40 responses** (10 teams × 2 R2 questions × 2 answers) — **saving 50% of API costs**
- The bottom 10 received a professional-looking generic feedback string, maintaining the **illusion of full evaluation**
