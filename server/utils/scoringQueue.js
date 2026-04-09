'use strict';

/**
 * ScoringQueue — Asynchronous, non-blocking pipeline for Gemini AI evaluation.
 *
 * Config (from env or passed options):
 *   AI_BATCH_SIZE     — how many responses per batch  (default: 2)
 *   AI_BATCH_DELAY_MS — ms to wait between batches    (default: 8000)
 *   AI_MAX_RETRIES    — max retries on 429/503        (default: 3)
 */

class ScoringQueue {
  constructor({ batchSize, batchDelayMs, maxRetries, onScored, evaluateFn } = {}) {
    // Configuration (env overrides constructor args)
    this.batchSize    = Number(process.env.AI_BATCH_SIZE)    || batchSize    || 2;
    this.batchDelayMs = Number(process.env.AI_BATCH_DELAY_MS) || batchDelayMs || 8000;
    this.maxRetries   = Number(process.env.AI_MAX_RETRIES)   || maxRetries   || 3;

    /** Called after each successful score with (responseDoc) for real-time push */
    this.onScored   = onScored   || null;
    /** The actual Gemini evaluator — injected to avoid circular deps */
    this.evaluateFn = evaluateFn || null;

    this._queue   = [];   // Array of { responseDoc, questionDoc }
    this._running = false;
    this._stats   = { scored: 0, skipped: 0, errors: 0 };
  }

  /** Enqueue a batch of items. Items with llmScore already set are rejected (idempotency). */
  enqueue(items) {
    let added = 0;
    for (const item of items) {
      if (item.responseDoc.llmScore !== null && item.responseDoc.llmScore !== undefined) {
        console.log(`[Queue] ⏭  Skipping already-scored response ${item.responseDoc._id}`);
        this._stats.skipped++;
        continue;
      }
      this._queue.push(item);
      added++;
    }
    console.log(`[Queue] 📥 Enqueued ${added} responses. Queue length: ${this._queue.length}`);
    return added;
  }

  /** Start draining the queue in the background (non-blocking). */
  start() {
    if (this._running) {
      console.log('[Queue] ⚠️  Queue is already running.');
      return;
    }
    this._running = true;
    this._stats   = { scored: 0, skipped: 0, errors: 0 };
    console.log(`[Queue] ▶️  Starting. Total items: ${this._queue.length}, Batch size: ${this.batchSize}, Delay: ${this.batchDelayMs}ms`);
    // Kick off without blocking the caller
    setImmediate(() => this._drain());
  }

  /** Internal drain loop */
  async _drain() {
    try {
      let batchNum = 0;
      while (this._queue.length > 0) {
        const batch = this._queue.splice(0, this.batchSize);
        batchNum++;
        console.log(`[Queue] 🔄 Processing batch #${batchNum} (${batch.length} items, ${this._queue.length} remaining)...`);

        const results = await Promise.allSettled(
          batch.map(({ responseDoc, questionDoc }) =>
            this._processOne(responseDoc, questionDoc)
          )
        );

        results.forEach(r => {
          if (r.status === 'fulfilled') this._stats.scored++;
          else {
            this._stats.errors++;
            console.error('[Queue] ❌ Batch item failed:', r.reason);
          }
        });

        if (this._queue.length > 0) {
          console.log(`[Queue] ⏳ Waiting ${this.batchDelayMs}ms before next batch...`);
          await this._sleep(this.batchDelayMs);
        }
      }
    } catch (err) {
      console.error('[Queue] 💥 Fatal drain error:', err.message);
    } finally {
      this._running = false;
      console.log(
        `[Queue] ✅ Done. Scored: ${this._stats.scored}, Skipped: ${this._stats.skipped}, Errors: ${this._stats.errors}`
      );
    }
  }

  /** Evaluate one response with retry logic */
  async _processOne(responseDoc, questionDoc, attempt = 0) {
    // Idempotency: re-fetch from DB to ensure it hasn't been scored by another request
    const fresh = await responseDoc.constructor.findById(responseDoc._id);
    if (!fresh) {
      console.warn(`[Queue] ⚠️  Response ${responseDoc._id} no longer exists — skipping.`);
      return;
    }
    if (fresh.llmScore !== null && fresh.llmScore !== undefined) {
      console.log(`[Queue] ⏭  Response ${responseDoc._id} already scored (${fresh.llmScore}) — skipping.`);
      this._stats.skipped++;
      return;
    }

    console.log(`[Queue] 🤖 Evaluating response ${responseDoc._id} (attempt ${attempt + 1}/${this.maxRetries + 1})...`);

    try {
      await this.evaluateFn(fresh, questionDoc);
      console.log(`[Queue] ✅ Scored response ${responseDoc._id} → ${fresh.llmScore}/10`);

      // Inform caller so it can push real-time updates
      if (this.onScored) {
        await this.onScored(fresh);
      }
    } catch (err) {
      const isRateLimited = err.message && (err.message.includes('429') || err.message.includes('503'));

      if (isRateLimited && attempt < this.maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s
        console.warn(`[Queue] ⏳ Rate limited on ${responseDoc._id}. Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${this.maxRetries})...`);
        await this._sleep(waitMs);
        return this._processOne(responseDoc, questionDoc, attempt + 1);
      }

      // Non-retriable or exhausted retries
      console.error(`[Queue] ❌ Failed to score ${responseDoc._id} after ${attempt + 1} attempt(s):`, err.message);

      // Graceful degradation: mark as 0 so it doesn't block leaderboard
      try {
        fresh.llmScore     = 0;
        fresh.llmReasoning = 'SCORING_FAILED: ' + err.message;
        await fresh.save();
      } catch (saveErr) {
        console.error('[Queue] ❌ Failed to save error state:', saveErr.message);
      }
      throw err; // Let Promise.allSettled track as error
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get isRunning() { return this._running; }
  get stats()     { return { ...this._stats }; }
  get queueLength() { return this._queue.length; }
}

module.exports = ScoringQueue;
