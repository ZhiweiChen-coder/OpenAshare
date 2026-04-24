# Trading Manager Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first usable half-automatic trading manager loop by adding market regime guidance, trade-plan snapshots, and holding action guidance without introducing new tabs.

**Architecture:** Add a small backend market-regime service plus structured trade-plan fields on strategy holdings. Reuse the existing Hotspots and Portfolio pages as the single opportunity-discovery and position-management surfaces by rendering a shared market banner and surfacing plan data in the existing strategy flow.

**Tech Stack:** FastAPI, Pydantic, Next.js App Router, React client components, SQLite store, pytest

---

### Task 1: Add market regime domain models and API surface

**Files:**
- Modify: `api/schemas.py`
- Modify: `lib/types.ts`
- Modify: `lib/api.ts`
- Modify: `api/main.py`
- Test: `tests/test_api_app.py`

**Step 1: Write the failing test**

Add an API test for `GET /api/market-regime` that expects a three-state regime payload, score, action guidance, and index snapshot list.

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_api_app.py -q -k market_regime`
Expected: FAIL with missing route or missing response model fields

**Step 3: Write minimal implementation**

Add `MarketIndexSnapshot` and `MarketRegimeResponse` to `api/schemas.py` and mirrored TS types to `lib/types.ts`. Add `getMarketRegime()` to `lib/api.ts`. Expose `GET /api/market-regime` in `api/main.py`.

**Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_api_app.py -q -k market_regime`
Expected: PASS

**Step 5: Commit**

```bash
git add api/schemas.py lib/types.ts lib/api.ts api/main.py tests/test_api_app.py
git commit -m "feat: add market regime api surface"
```

### Task 2: Implement market regime service logic

**Files:**
- Modify: `api/services.py`
- Test: `tests/test_api_app.py`

**Step 1: Write the failing test**

Add a service/API test that stubs index analysis and verifies the market regime becomes `risk_on`, `neutral`, or `risk_off` based on index trend and breadth-like signals.

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_api_app.py -q -k market_regime`
Expected: FAIL on incorrect or missing regime scoring

**Step 3: Write minimal implementation**

Add `MarketService` in `api/services.py` that reuses `StockAnalysisService.get_stock_analysis()` for major indices, computes a `market_score`, derives `regime`, `action_bias`, `position_guidance`, and summary notes, then wire it into `api/main.py`.

**Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_api_app.py -q -k market_regime`
Expected: PASS

**Step 5: Commit**

```bash
git add api/services.py api/main.py tests/test_api_app.py
git commit -m "feat: implement market regime scoring"
```

### Task 3: Persist trade-plan snapshot fields on strategy holdings

**Files:**
- Modify: `api/schemas.py`
- Modify: `lib/types.ts`
- Modify: `api/services.py`
- Test: `tests/test_api_app.py`

**Step 1: Write the failing test**

Add a store test that creates a `StrategyHolding` with plan fields such as `source_topic`, `plan_entry_zone`, `plan_stop_loss`, and `plan_take_profit`, then verifies they round-trip through SQLite.

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_api_app.py -q -k strategy_holding_store`
Expected: FAIL because the columns or schema fields do not exist

**Step 3: Write minimal implementation**

Extend `StrategyHolding` with structured plan snapshot fields. Update `StrategyHoldingStore` table creation, column migration, list/create/update behavior, and keep `api/schemas.py` and `lib/types.ts` aligned.

**Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_api_app.py -q -k strategy_holding_store`
Expected: PASS

**Step 5: Commit**

```bash
git add api/schemas.py lib/types.ts api/services.py tests/test_api_app.py
git commit -m "feat: persist trade plan snapshots"
```

### Task 4: Add holding action guidance to strategy analysis

**Files:**
- Modify: `api/schemas.py`
- Modify: `lib/types.ts`
- Modify: `api/services.py`
- Test: `tests/test_api_app.py`

**Step 1: Write the failing test**

Add a test that verifies analyzed holdings now include an action suggestion such as `继续持有`, `减仓观察`, `禁止加仓`, or `触发卖出`, plus a short reason.

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_api_app.py -q -k strategy_holdings_endpoints`
Expected: FAIL because the new fields are absent

**Step 3: Write minimal implementation**

Extend `StrategyHoldingAnalysis` with action guidance fields and compute them in `StrategyService.analyze_holdings()` by combining thesis status, market regime, and trade-plan thresholds.

**Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_api_app.py -q -k strategy_holdings_endpoints`
Expected: PASS

**Step 5: Commit**

```bash
git add api/schemas.py lib/types.ts api/services.py tests/test_api_app.py
git commit -m "feat: add holding action guidance"
```

### Task 5: Render shared market banner and trade-plan UI in Hotspots and Portfolio

**Files:**
- Create: `components/market-regime-banner.tsx`
- Modify: `app/hotspots/hotspots-page-client.tsx`
- Modify: `app/portfolio/page.tsx`
- Modify: `components/portfolio-shell.tsx`
- Modify: `app/globals.css`

**Step 1: Write the failing test**

Skip UI snapshot tests for now and instead define acceptance criteria in code comments:
- Hotspots page shows the market regime banner
- Strategy candidates expose a trade-plan summary and “按计划买入” entry path
- Portfolio page shows the same market regime banner plus plan snapshot and action guidance per holding

**Step 2: Run build to verify current baseline**

Run: `npm run build`
Expected: PASS before edits

**Step 3: Write minimal implementation**

Create a reusable market banner component. Load market regime on Hotspots and Portfolio. Replace direct “加入策略持股” phrasing in Hotspots with plan-oriented copy and URL-prefilled trade-plan fields. Extend the strategy holding form and cards in `components/portfolio-shell.tsx` to edit, display, and reason about the saved trade plan.

**Step 4: Run build to verify it passes**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add components/market-regime-banner.tsx app/hotspots/hotspots-page-client.tsx app/portfolio/page.tsx components/portfolio-shell.tsx app/globals.css
git commit -m "feat: surface market regime and trade plans in workflow"
```

### Task 6: Run focused verification

**Files:**
- Modify: `tests/test_api_app.py` if needed

**Step 1: Run focused backend tests**

Run: `python3 -m pytest tests/test_api_app.py -q -k "market_regime or strategy_holdings"`
Expected: PASS

**Step 2: Run frontend build**

Run: `npm run build`
Expected: PASS

**Step 3: Document known gaps**

Record that later phases should add watchlist/planned states, automated refresh jobs, and post-trade review cards.

**Step 4: Commit**

```bash
git add docs/plans/2026-04-20-trading-manager-phase1.md tests/test_api_app.py
git commit -m "docs: add trading manager phase 1 plan"
```
