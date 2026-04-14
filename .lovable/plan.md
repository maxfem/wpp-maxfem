

## Plan: Add Pagination to Automation Activity Log

### Problem
The activity log table currently loads all activities from today only, with no pagination. The user wants to control how many records are displayed (10, 20, 50, 100) and see all historical data — not just today's.

### Changes

**File: `src/pages/AutomationDetails.tsx`**

1. **Remove the `todayStart` filter** from the activities query — fetch all activities for this automation, not just today's.

2. **Add server-side pagination** using Supabase `.range()`:
   - Add state for `pageSize` (default 20) and `currentPage` (default 0)
   - Query with `.range(currentPage * pageSize, (currentPage + 1) * pageSize - 1)`
   - Also fetch total count with `{ count: 'exact' }`

3. **Add a page size selector** (10, 20, 50, 100) above the table using a `<Select>` component.

4. **Add pagination controls** below the table (Previous/Next buttons + "Página X de Y" label).

5. **Keep metrics based on all data**: Add a separate lightweight query for metrics (counts only) that isn't paginated, or compute from the full count.

6. **Update the subtitle** to remove "a partir de hoje" text since we're now showing all data.

### UI Layout (Log tab)

```text
┌─────────────────────────────────────────────┐
│ Log de Atividades (total)   [10|20|50|100▼] │
├─────────────────────────────────────────────┤
│ Cliente | Telefone | Enviado | Entregue ... │
│ ...rows...                                  │
├─────────────────────────────────────────────┤
│ ◀ Anterior    Página 1 de 5    Próxima ▶    │
└─────────────────────────────────────────────┘
```

### Technical Details

- Use two queries: one for paginated log display, one for metrics (all activities count/sums)
- Page size selector resets to page 0 on change
- Supabase `count: 'exact'` returns total without fetching all rows

