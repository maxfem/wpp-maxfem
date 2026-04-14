

## Plan: Fix Automation Queue — Process Only From Activation Date Forward

### Problem
Two issues:
1. The `todayCutoff` filter (`created_at >= today 00:00 UTC`) blocks items created yesterday that have a future `scheduled_for` (wait nodes). This breaks multi-day flows.
2. Old/legacy queue items should never be processed — only items created after the automation was activated.

### Solution

**File: `supabase/functions/campaign-executor/index.ts`**

Remove the `todayCutoff` / `.gte("created_at", ...)` filter from the queue query. Items are already gated by:
- `status = 'pending'` — only unprocessed items
- `scheduled_for <= now() OR scheduled_for IS NULL` — respects wait timers
- Campaign `status = 'running'` check — inactive automations are skipped

This is sufficient. The cutoff logic should live at **insertion time** (in `yampi-sync` and `automation-cron`), not at processing time.

**File: `supabase/functions/yampi-sync/index.ts`**

Add a check: when inserting into `automation_queue`, compare the event timestamp (cart creation, order creation) against the campaign's `start_date` or `updated_at`. Only enqueue if the event happened **after** the automation was activated. This prevents old historical events from entering the queue.

**File: `supabase/functions/automation-cron/index.ts`**

Already only processes today's events (birthday today, inactivity window today), so no legacy items enter. No change needed.

**Data cleanup**: Mark any remaining old `pending` items as `skipped` to clear the queue.

### Files to Edit

| File | Change |
|------|--------|
| `supabase/functions/campaign-executor/index.ts` | Remove `todayCutoff` filter (lines 293-295, 303) — process by `scheduled_for` only |
| `supabase/functions/yampi-sync/index.ts` | Add activation-date check before inserting into queue |
| Data cleanup | Mark old pending items as `skipped` |

### Result
- Multi-day flows (wait nodes spanning days) will work correctly
- Only events occurring after activation enter the queue
- No retroactive processing of historical data

