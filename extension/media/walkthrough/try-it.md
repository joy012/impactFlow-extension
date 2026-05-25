# Try it on your code

1. **Open the side panel.** Click the ImpactFlow icon on the activity bar.
2. **Edit any function** in a supported file (19 languages — TypeScript, JavaScript, Python, Go, Java, Kotlin, Rust, C#, PHP, Scala, Dart, Swift, Lua, Elixir, Objective-C, F#, R, GDScript, PowerShell).
3. **Watch the panel update** within ~400 ms of your last keystroke.

You'll see:

- The **modified function** with a risk badge (`HIGH` / `MEDIUM` / `LOW`)
- A **per-detector breakdown** — what kind of behavior change ImpactFlow detected
- **Likely-affected callers** — split into `impacted` and `impactedTests` so you know exactly what to re-run
- A **progress bar** at the top of the panel while analysis is running

## Useful commands

- `ImpactFlow: Compare Branches` — full behavior diff between any two refs
- `ImpactFlow: Summarize Staged Changes` — paste-ready PR description
- `ImpactFlow: Toggle Focus Mode` — dim everything outside ±10 lines of your changes
- `ImpactFlow: Find Dead Code` — workspace-wide unused-symbol scan
- `ImpactFlow: Install Pre-Commit Hook (warn)` — surface high-risk changes before commit

All commands are searchable via the command palette: `Cmd/Ctrl + Shift + P` → "ImpactFlow".
