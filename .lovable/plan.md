

## Plan: Fix Critical & Medium Bugs from Technical Report

This plan focuses on the high-impact, actionable bugs. Security items related to hosting infrastructure (CSP headers, SRI) and localStorage JWT are outside the scope of what can be changed in the app code. Meta tag and UX polish items are included as quick wins.

---

### Phase 1 — Dashboard Chart Date Fix (Bugs #1 and #2)

**Problem:** Charts use `format(date, "dd")` (day-only, e.g. "31", "01") as the grouping key. Days from different months collide and sort incorrectly.

**Fix in `src/pages/Dashboard.tsx`:**
- Change the chart grouping key from `"dd"` to `"MM/dd"` (e.g. `"03/31"`, `"04/01"`) so each day is unique across months and naturally sorts in chronological order.
- Display label on XAxis as just the day (`"dd"`) but use the full `"yyyy-MM-dd"` as the internal key.
- Apply the same fix to both `dayMap` and `customerDayMap`.

### Phase 2 — Number Formatting (Bug #18)

**Fix in `src/pages/Dashboard.tsx`:**
- Change `fmt()` from `"1.0k"` to Brazilian format: numbers < 10k show full with dot separator (e.g. `"1.023"`), larger numbers show `"163,5 mil"`.
- Add a `tickFormatter` to YAxis on both charts to format values as `"R$ 45.000"`.

### Phase 3 — Customer Table Pagination (Bug #5)

**Fix in `src/pages/Customers.tsx`:**
- Add server-side pagination with 50 rows per page.
- Add pagination controls (Previous/Next) below the table.
- Use `.range(from, to)` in the Supabase query and track page state.

### Phase 4 — Meta Tags Fix (Bug #15)

**Fix in `index.html`:**
- Update `og:title` and `twitter:title` to `"Maxfem — Saúde íntima de dentro para fora"`.
- Update `og:description` and `twitter:description` to match the Maxfem brand.
- Add `<link rel="canonical" />` (Bug #16).

### Phase 5 — Activities Empty State CTA (Bug #19)

**Fix in `src/pages/Activities.tsx`:**
- Add a "Criar Campanha" button below the empty state message, linking to `/campaigns`.

### Phase 6 — Code Splitting (Bug #20)

**Fix in `src/App.tsx`:**
- Wrap all page imports with `React.lazy()` and wrap routes in `<Suspense>` with a loading spinner fallback.

### Phase 7 — Accessibility Quick Wins (Bugs #7, #8)

**Fix across `src/pages/Campaigns.tsx` and `src/components/AppSidebar.tsx`:**
- Add `aria-label` to all `<Switch>` components with campaign/automation name.
- Add `aria-label` to the sign-out icon button in the sidebar.

---

### Technical Details

**Chart date key change (Phase 1):**
```typescript
// Before: format(date, "dd") → "31"
// After:  format(date, "yyyy-MM-dd") → "2026-03-31" as key, "31/03" as label
const dayKey = format(date, "yyyy-MM-dd");
const dayLabel = format(date, "dd/MM");
```

**Pagination (Phase 3):**
```typescript
const PAGE_SIZE = 50;
const [page, setPage] = useState(0);
// Query uses .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
```

**Code splitting (Phase 6):**
```typescript
const Dashboard = lazy(() => import("./pages/Dashboard"));
// Wrap in <Suspense fallback={<Spinner />}>
```

### Files to edit
- `src/pages/Dashboard.tsx` (Phases 1, 2)
- `src/pages/Customers.tsx` (Phase 3)
- `index.html` (Phase 4)
- `src/pages/Activities.tsx` (Phase 5)
- `src/App.tsx` (Phase 6)
- `src/pages/Campaigns.tsx` (Phase 7)
- `src/components/AppSidebar.tsx` (Phase 7)

