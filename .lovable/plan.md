

## Plan: Fix Duplicate Automation Queue Entries

### Root Cause
The unique index `idx_aq_unique_cart` only prevents duplicates when status is `pending`, `processing`, or `sent`. Once a queue item reaches `completed` or `failed`, the constraint no longer applies. On the next yampi-sync cycle, the same order re-matches the same trigger and inserts a new queue entry.

Zelyane has 1 order but 3 completed `order_created_pix` entries — one per sync cycle.

### Solution

**Option A (recommended): Expand the unique index to include `completed` status**

Drop and recreate the unique index to also cover `completed` and `failed` statuses:

```sql
DROP INDEX IF EXISTS idx_aq_unique_cart;
CREATE UNIQUE INDEX idx_aq_unique_cart 
  ON automation_queue (customer_id, campaign_id, trigger_type)
  WHERE status IN ('pending', 'processing', 'sent', 'completed', 'failed');
```

This is the simplest fix — the same customer+campaign+trigger combination can never have more than one entry regardless of status.

**Additionally: Add `trigger_data` order reference to the unique check**

Since the same customer could legitimately have multiple Pix orders over time, the index should also include the order identifier. We'll add a generated column or use a functional index on `trigger_data->>'yampi_order_id'`:

```sql
DROP INDEX IF EXISTS idx_aq_unique_cart;
CREATE UNIQUE INDEX idx_aq_unique_trigger 
  ON automation_queue (customer_id, campaign_id, trigger_type, COALESCE((trigger_data->>'yampi_order_id'), id::text));
```

This way:
- Same order + same automation = blocked (no duplicates)
- Different orders + same automation = allowed (legitimate new triggers)

### Files to Change

| File | Change |
|------|--------|
| Migration SQL | Replace unique index to cover all statuses + include order ID |
| Cleanup | Mark the 2 extra Zelyane entries as `skipped` |

### Result
- Each order triggers the automation exactly once
- Multiple distinct orders from the same customer still work
- No more duplicate sends on every sync cycle

