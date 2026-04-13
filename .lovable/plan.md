

## Plan: RFM Segmentation with Auto-Populated Lists

### What This Does
Automatically calculates RFM (Recency, Frequency, Monetary) scores for every customer based on order data, assigns a segment label (Campeões, Leais, Potenciais, Em Risco, Hibernando), and creates/populates contact lists for each segment that stay in sync every time the e-commerce integration runs.

---

### Phase 1 — Database Function for RFM Calculation

Create a SQL migration with a `calculate_rfm_scores` database function that:
- Takes a `tenant_id` parameter
- Queries the `orders` table to compute per-customer: days since last order (R), total orders (F), total spent (M)
- Assigns quintile scores (1-5) for each dimension using `NTILE(5)`
- Maps the combined RFM score to a segment name:
  - **Campeões**: R≥4, F≥4, M≥4
  - **Leais**: R≥3, F≥3, M≥3
  - **Em Risco**: R≤2, F≥3
  - **Hibernando**: R≤2, F≤2
  - **Potenciais**: everyone else
- Updates `rfm_recency`, `rfm_frequency`, `rfm_monetary`, and `rfm_segment` on the `customers` table

### Phase 2 — Database Function for RFM List Sync

Create a `sync_rfm_lists` database function that:
- For each of the 5 segment names, upserts a `contact_lists` row with `type = 'rfm'` and a fixed naming convention (e.g. "RFM — Campeões")
- Deletes existing `contact_list_members` for those lists
- Re-inserts members based on each customer's current `rfm_segment`
- Updates `customer_count` on each list

### Phase 3 — Call RFM After Sync

Edit `supabase/functions/yampi-sync/index.ts` to call both functions via `supabase.rpc('calculate_rfm_scores', { _tenant_id })` and `supabase.rpc('sync_rfm_lists', { _tenant_id })` at the end of each sync cycle (after orders are synced).

### Phase 4 — UI Updates

- **Lists page**: Show RFM lists with a special badge/icon (e.g. "RFM" badge) and make them read-only (no manual add/remove since they auto-refresh)
- **Customers RFM tab**: Update to pull real counts from the RFM lists instead of filtering the current page of 50 customers

---

### Technical Details

**RFM Scoring SQL (core logic):**
```sql
WITH stats AS (
  SELECT customer_id,
    EXTRACT(DAY FROM now() - MAX(created_at)) AS recency_days,
    COUNT(*) AS frequency,
    SUM(total) AS monetary
  FROM orders WHERE tenant_id = _tenant_id
  GROUP BY customer_id
),
scored AS (
  SELECT customer_id,
    NTILE(5) OVER (ORDER BY recency_days DESC) AS r,
    NTILE(5) OVER (ORDER BY frequency ASC) AS f,
    NTILE(5) OVER (ORDER BY monetary ASC) AS m
  FROM stats
)
UPDATE customers SET
  rfm_recency = r, rfm_frequency = f, rfm_monetary = m,
  rfm_segment = CASE
    WHEN r >= 4 AND f >= 4 AND m >= 4 THEN 'Campeões'
    WHEN r >= 3 AND f >= 3 AND m >= 3 THEN 'Leais'
    WHEN r <= 2 AND f >= 3 THEN 'Em Risco'
    WHEN r <= 2 AND f <= 2 THEN 'Hibernando'
    ELSE 'Potenciais'
  END
FROM scored WHERE customers.id = scored.customer_id;
```

### Files to create/edit
- **New migration**: RFM database functions (`calculate_rfm_scores`, `sync_rfm_lists`)
- `supabase/functions/yampi-sync/index.ts` — add RPC calls post-sync
- `src/pages/Customers.tsx` — fix RFM tab counts
- `src/pages/Lists.tsx` — handle `type = 'rfm'` lists as read-only with badge
