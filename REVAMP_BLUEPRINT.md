# NARRATIQ 2.0: THE EVR ARBITRAGE ENGINE
## Full Architecture & Logic Blueprint

### 1. MISSION STATEMENT
Transform the application from a "News Summarizer" into an **Expectation vs. Reality (EVR) Engine**. The system identifies alpha by measuring the **Divergence** between what the crowd expects (Narrative) and what the institutions are doing (The Tape).

---

### 2. CORE LOGIC: THE "SURPRISE FACTOR"
In institutional trading, "Good News" is bearish if the price fails to rise.
- **Signal Definition:** `Signal = |Narrative Sentiment - Price Reality|`
- **Goal:** Detect Institutional Accumulation (Price rises on bad news) or Distribution (Price stays flat/drops on good news).

---

### 3. THE "TRIAD" SYSTEM (Three-Layer Pipeline)

#### Layer 1: The Quant Auditor (The "Reality")
- **File:** `agents/quantAuditor.js`
- **Logic:** Pure Mathematical Engine (No LLM).
- **Functions:** - Calculates **ATR** (Average True Range) to define volatility bounds.
    - Calculates **RVOL** (Relative Volume) to detect "Smart Money" footprints.
    - Measures 5-day momentum slopes.
- **Output:** The "Tape" reality.

#### Layer 2: The Sentiment Aggregator (The "Expectation")
- **File:** `agents/sentimentAggregator.js`
- **Logic:** Single-pass LLM context window.
- **Functions:** - Aggregates raw JSON from Finnhub (News) and StockTwits/Social.
    - Scores sentiment from -10 to +10.
    - Identifies the "Main Hype Driver."
- **Output:** The "Crowd" expectation.

#### Layer 3: The Arbitrator (The "IB Brain")
- **File:** `agents/arbitratorAgent.js`
- **Logic:** Agentic Reasoning + Memory Injection.
- **Functions:** - Cross-examines Layer 1 (Math) and Layer 2 (Narrative).
    - Checks the **3-Tier RAG Memory** for historical precedents.
- **Output:** The Final Divergence Score and Actionable Signal (Buy/Sell/Distribution).

---

### 4. AGENTIC RAG MEMORY (The 3-Tier Vault)
Every query triggers a three-step search before the Arbitrator makes a decision:

1. **Tier 1: VectorDB (Historical Context)**
    - *Query:* "How did $NVDA act last time sentiment was > 8 but volume was low?"
    - *Data:* Stored in `memory_logs` via `pgvector`.
2. **Tier 2: Knowledge Graph (Relational Logic)**
    - *Query:* "Are there supply-chain bottlenecks or sector-mate correlations (e.g., $ASML) affecting this ticker?"
    - *Data:* Stored in `knowledge_graph`.
3. **Tier 3: Verification Tooling**
    - *Logic:* Final "Self-Audit" by the machine to check for hallucinations or data inconsistencies.

---

### 5. THE SELF-LEARNING LOOP (24h Audit)
The system becomes smarter every 24 hours without manual training:
1. **The Snapshot:** Every signal is saved to `market_sessions`.
2. **The 24h Audit:** A script (`performanceAuditor.js`) compares the prediction to the actual price movement 24 hours later.
3. **Meta-Rule Generation:** If the prediction was wrong, the LLM generates a "Meta-Rule" (e.g., "Social sentiment for $TSLA is currently a lagging indicator").
4. **Vector Storage:** The rule is embedded and saved to `memory_logs` for future RAG retrieval.

---

### 6. TECHNICAL STACK & INFRASTRUCTURE
- **Database:** Supabase with `pgvector` extension.
- **Orchestration:** `lib/pipelineRunner.js` (Executing Layer 1 & 2 in parallel, followed by Layer 3).
- **Utility:** `lib/vectorMemory.js` for handling the 3-tier RAG retrieval.
- **Memory Storage:** `memory_logs` table with 1536-dim embeddings.

---

### 7. INSTITUTIONAL DEFENSE (The "Director's" logic)
- **Standard Defense:** "We don't rely on sentiment being 'accurate'; we rely on the market's *failure* to react to it as a leading indicator of institutional reversal."
- **Quant Defense:** "The LLM does not perform calculations. It interprets the divergence between hard math and soft narrative."

---
**END OF BLUEPRINT**
