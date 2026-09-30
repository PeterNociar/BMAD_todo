# Reconcile: docs/PRD.md (initial PRD) vs PRD

Rule from memlog: the brief overrides the initial PRD where they differ.

| # | Item from initial PRD | Status | PRD location |
|---|---|---|---|
| 1 | Simple full-stack todo app for individual users, personal tasks | captured | §1 Vision, §2 |
| 2 | Focus on clarity and ease of use, no unnecessary features or complexity | captured | §1, §6, §7 |
| 3 | Solid technical foundation that future work can extend | weakened | NFR-6 (covers user accounts only) |
| 4 | Create, view, complete, delete todos | captured | FR-1, FR-5, FR-11, FR-13 |
| 5 | Each todo has a short text description, completion status and creation time | captured | §3 Glossary, FR-14 |
| 6 | List visible as soon as the app opens | captured | FR-5 |
| 7 | Usable with no onboarding or explanation | weakened | Implied by §1 and FR-2. No requirement or metric |
| 8 | Fast, responsive UI; changes show instantly | captured | FR-1, FR-16, NFR-2 |
| 9 | Completed tasks are visually distinct from open ones | captured | FR-11 |
| 10 | Works well on desktop and mobile | overridden (brief: laptop first, still usable on a phone) | NFR-3 |
| 11 | Sensible empty, loading and error states | captured | FR-8, FR-5, FR-17, FR-18 |
| 12 | Polished user experience | captured | §6 |
| 13 | Small, well-defined API with basic CRUD | captured (the "update" is only tick/untick; editing overridden by brief) | FR-11..14, addendum; §8.2 |
| 14 | Data consistency and durability across sessions | captured | FR-14, FR-15, SM-4 |
| 15 | No auth or multi-user in v1, but architecture must allow them later | captured | NFR-5, NFR-6, §7 |
| 16 | NFR: simplicity, performance | captured | §6, NFR-2 |
| 17 | NFR: maintainability; easy for future developers to understand, deploy and extend | weakened | Deploy: NFR-4. Understand/extend: missing |
| 18 | Interactions feel instant under normal conditions | captured | NFR-2 |
| 19 | Basic error handling on client and server, handles failures without breaking the user's flow | captured | FR-3, FR-16..18 |
| 20 | Excludes accounts, collaboration, prioritisation, deadlines, notifications | captured | §7, §8.2 |
| 21 | Success: user completes all core actions without guidance | missing | No SM for it |
| 22 | Success: stable across refreshes and sessions | captured | FR-14, SM-4 |
| 23 | Success: clear overall UX | captured (qualitative) | §6 |
| 24 | Intent: should feel like a complete, usable product despite the minimal scope | weakened | §6 covers "simple and sleek", not "complete" |

## Gaps

1. **Maintainability / developer extensibility.** The initial PRD asks for a solution that future developers find "easy to understand ... and extend". NFR-6 covers only adding accounts later. No NFR covers code clarity or maintainability (e.g. layered structure, documented API contract, README).
2. **"Without guidance" success criterion.** No requirement or metric says a first-time user can do every core action with no onboarding. The single user is the author, so this is low risk, but it was an explicit success measure.
3. **"Feels like a complete product" intent.** §6 gives the tone but not the feeling of completeness and polish despite the small scope. Consider one sentence in §6.
