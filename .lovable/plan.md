

## Problem

There's a mismatch between the **editor** and the **campaigns list** for status values:

- **Editor** (`CampaignFlowEditor.tsx`): toggles between `"running"` / `"draft"`
- **List** (`Campaigns.tsx`): expects `"scheduled"` / `"draft"` and has no concept of `"running"`

When you activate inside the editor, it saves `"running"` to the DB, but the list page doesn't recognize that status — so it shows as inactive/unknown.

## Fix

Align both pages to use `"scheduled"` as the active status for campaigns (keeping `"running"` only for automations):

### 1. Update `CampaignFlowEditor.tsx` — Smart status toggle
- When `isAutomation` is true, toggle between `"running"` / `"draft"` (automations)
- When it's a campaign, toggle between `"scheduled"` / `"draft"`

### 2. Update `Campaigns.tsx` — Add `"running"` to statusConfig
- Add `running: { label: "Ativa", icon: Zap, className: "bg-green-100 text-green-700" }` to `statusConfig` as a safety net
- Add `"running"` to the Switch `checked` condition so it also shows as active

This two-pronged approach ensures:
- New activations from the editor use the correct status per context
- Any existing `"running"` records in the DB still display correctly

### Files to edit
- `src/pages/CampaignFlowEditor.tsx` (1 line change in the Switch handler)
- `src/pages/Campaigns.tsx` (add `"running"` to statusConfig + Switch checked conditions)

