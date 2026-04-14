

## Plan: Multi-Step Flow Executor for All Automations

### The Problem
Currently the `campaign-executor` only finds the **first** `sendWhatsApp` node in a flow and sends it. But automation flows are multi-step graphs like:

```text
Start → Wait 30min → Condition (paid?) → Send WhatsApp #1
                                        → Wait 2h → Condition → Send WhatsApp #2
                                                               → Wait 24h → Send WhatsApp #3
```

Only the Pix automation partially works because it has a hardcoded delay + payment check. All other automations with wait nodes, conditions, and multiple sends are broken.

### Solution: Graph-Walking Executor

Track each customer's position in the flow graph and advance step-by-step on each executor run.

---

### Phase 1 — Add `current_node_id` to `automation_queue`

New migration adding:
- `current_node_id TEXT DEFAULT 'start'` — tracks which node the customer is currently at
- `scheduled_for TIMESTAMPTZ` — when this item should next be processed (set by wait nodes)

### Phase 2 — Rewrite `processAutomationQueue` in `campaign-executor`

Replace the single-send logic with a **graph walker** that:

1. Fetches pending queue items where `scheduled_for <= now()` (or `scheduled_for IS NULL`)
2. For each item, loads the campaign's `flow_data` (nodes + edges)
3. Starting from `current_node_id`, follows edges to the next node and processes it:

   - **`wait` node**: Calculate delay from `waitTime` + `waitUnit` (e.g. "2 hours"), set `scheduled_for = now() + delay`, advance `current_node_id` to next node, keep status `pending`
   - **`condition` node**: Evaluate the condition (payment status, order status, cart purchased, etc.), follow `condition-true` or `condition-false` edge accordingly. If false edge leads to `exit`, mark as `skipped`
   - **`sendWhatsApp` node**: Respect `delay` field if set, then send the message via Meta API. After success, advance `current_node_id` to the next node. If no next node, mark as `done`
   - **`exit` node**: Mark item as `completed`
   - **`addTag` / `removeTag`**: Apply tag to customer, advance to next node

4. Process multiple steps per run (up to the next wait node or end of flow)

### Phase 3 — Condition Evaluator

Create a `evaluateCondition()` function that checks:
- `payment_status` / `last_order_status`: Query `orders` table for the customer's latest order status
- `cart_purchased`: Check if customer placed an order after cart abandonment
- Generic field checks from the condition node config (`conditionField`, `conditionOp`, `conditionValue`)

### Phase 4 — Update Queue Insertion

When `automation-cron` or `yampi-sync` inserts into `automation_queue`, set `current_node_id = 'start'` so the walker begins at the start node and follows the first edge.

### Phase 5 — Fix Unique Constraint

The current unique index `(customer_id, campaign_id, trigger_type)` prevents a customer from re-entering a flow. This is fine — it keeps the "one execution per customer per automation" guarantee.

---

### Files to Create/Edit

| File | Change |
|------|--------|
| **New migration** | Add `current_node_id` and `scheduled_for` columns to `automation_queue` |
| `supabase/functions/campaign-executor/index.ts` | Rewrite `processAutomationQueue` with graph walker, condition evaluator |
| `supabase/functions/automation-cron/index.ts` | Set `current_node_id: 'start'` on inserts |
| `supabase/functions/yampi-sync/index.ts` | Set `current_node_id: 'start'` on cart/order queue inserts |

### How It Works After

Every executor run (cron every 2 min):
1. Pick queue items whose `scheduled_for` has passed
2. Walk from their `current_node_id` through the flow graph
3. Stop at the next `wait` node (set new `scheduled_for`) or end of flow
4. Conditions are evaluated live (query DB for current order/payment status)
5. Each send creates the WhatsApp message + campaign activity as before

This makes **all** automations — Carrinho Abandonado, Pix, Boas-vindas, NPS, Reengajamento — follow the full multi-step flow with delays and conditions.

