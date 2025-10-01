# WeaveOS — Home Experience Refresh

## Jobs to Be Done
- **Capture intent in seconds.** A household lead wants to jot down a ritual (name, cadence hint, helpful link) without configuring multiple fields.
- **Scan what's coming up.** A user needs a fast read on which rituals exist and whether they auto-complete or need manual follow-up.
- **Notice blockers.** Anyone responsible for rituals should immediately see attention items that need a human touch.
- **Stay confident after actions.** After submitting a new ritual or refreshing data, the user should get clear confirmation and know when information was last updated.

## UX Happy Paths
1. **Create a ritual from the hero form** → Submit → See success copy, empty form, new ritual in the list, dashboard timestamp updates.
2. **Refresh to sync state** → Click “Refresh” → Ritual list and attention list update, counts adjust, “Last updated” timestamp reflects the reload.
3. **Check for blockers** → Land on home → Glance at Needs Attention card → Either see actionable items grouped with their rituals or a calming empty-state.

## Planned Improvements
- Rebrand surface text to **WeaveOS** with clearer hero copy that explains the workflow in plain language.
- Add contextual guidance near the intent form so users know how the parser handles cadence and links.
- Surface live dashboard context (ritual count and last refresh time) in the Upcoming card header for reassurance.
- Redesign ritual list entries to emphasise run behaviour (auto-complete vs manual) and show the latest run status succinctly.
- Refine attention list and empty states with friendlier copy and counts to make triage feel manageable.
