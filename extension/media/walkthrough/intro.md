# Why ImpactFlow exists

AI assistants now generate code faster than humans can review it. The hard part isn't seeing **what changed** — git already shows that. It's seeing **what *behavior* changed**, and which callers should be re-verified before the change lands.

ImpactFlow runs a behavior-diff engine on every save and classifies each change structurally:

- `signature` — parameters or return type changed
- `asyncness` — became (or stopped being) async or a generator
- `return_shape` — new or removed return values
- `branch_logic` — added or removed branches / conditions
- `call_set` — calls a different set of functions
- `throw_set` — throws a different set of errors
- `side_effect_surface` — network / fs / env / DOM / mutation footprint shifted
- `stale_doc` — body changed but the JSDoc/docstring above it did not
- `complexity_jump` — cyclomatic complexity rose by ≥3

It rolls all of that into one **risk score** per modified function, surfaces the impacted callers + tests via the language server, and shows it inline + in the side panel.

## What runs locally

Everything is local. No AI tokens. No source code leaves your machine. The only outbound traffic is the opt-in feedback form.

Open the **ImpactFlow** view on the activity bar to see the live impact panel.
