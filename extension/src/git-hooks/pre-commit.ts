/**
 * F7 — Pre-commit hook installer.
 *
 * Safety guarantees (per user direction — never forces):
 *  1. Opt-in only. Never installs automatically.
 *  2. Default mode is "warn" (exit 0). User must opt into "block" (exit 1).
 *  3. `git commit --no-verify` always bypasses — Git's built-in escape hatch.
 *  4. Uninstallable via a dedicated command.
 *  5. Appends to existing hooks without overwriting; uses sentinel comments
 *     so removal only affects our portion.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const SENTINEL_START = '# >>> impactflow pre-commit (managed) >>>';
const SENTINEL_END = '# <<< impactflow pre-commit (managed) <<<';

export interface InstallResult {
  installed: boolean;
  path: string;
  message: string;
}

export async function installPreCommitHook(
  workspaceRoot: string,
  mode: 'warn' | 'block',
): Promise<InstallResult> {
  const hooksDir = join(workspaceRoot, '.git', 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');

  try {
    await fs.access(join(workspaceRoot, '.git'));
  } catch {
    return {
      installed: false,
      path: hookPath,
      message: '.git/ not found — open this folder as a git repo first.',
    };
  }

  await fs.mkdir(hooksDir, { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch {
    /* hook file does not exist yet */
  }

  // Strip any previously managed block (idempotent install).
  existing = stripManagedBlock(existing);

  const ourBlock = buildHookBlock(mode);
  const header = existing.startsWith('#!') ? '' : '#!/usr/bin/env bash\nset -eu\n\n';
  const next = `${header}${existing.trimEnd()}\n\n${ourBlock}\n`.replace(/^\n+/, '');

  await fs.writeFile(hookPath, next, 'utf8');
  await fs.chmod(hookPath, 0o755);

  return {
    installed: true,
    path: hookPath,
    message: `Pre-commit hook installed in "${mode}" mode. Bypass any time with \`git commit --no-verify\`.`,
  };
}

export async function uninstallPreCommitHook(workspaceRoot: string): Promise<InstallResult> {
  const hookPath = join(workspaceRoot, '.git', 'hooks', 'pre-commit');
  let text: string;
  try {
    text = await fs.readFile(hookPath, 'utf8');
  } catch {
    return { installed: false, path: hookPath, message: 'No pre-commit hook to remove.' };
  }
  const stripped = stripManagedBlock(text).trim();
  if (stripped === '' || stripped === '#!/usr/bin/env bash\nset -eu') {
    await fs.unlink(hookPath).catch(() => {});
    return { installed: false, path: hookPath, message: 'Pre-commit hook removed.' };
  }
  await fs.writeFile(hookPath, `${stripped}\n`, 'utf8');
  return {
    installed: false,
    path: hookPath,
    message: 'ImpactFlow section removed. Your other hook content was preserved.',
  };
}

function buildHookBlock(mode: 'warn' | 'block'): string {
  // The hook itself stays simple — it just reads the staged diff via git and
  // optionally exits non-zero. It does NOT invoke our Node bundle (we don't
  // want commit time blocked on a 5 MB extension load).
  return [
    SENTINEL_START,
    `# Mode: ${mode}`,
    '# Reviews staged diff against simple risk heuristics.',
    '# Bypass any time with: git commit --no-verify',
    '',
    'impactflow_check() {',
    '  local staged',
    '  staged=$(git diff --cached --name-only)',
    '  if [ -z "$staged" ]; then return 0; fi',
    '',
    '  local risky=0',
    '  local has_tests=0',
    '  for f in $staged; do',
    '    case "$f" in',
    '      *.test.* | *.spec.* | */__tests__/* | */tests/* | */spec/* | *_test.go | test_*.py | *_test.py )',
    '        has_tests=1 ;;',
    '      *.ts | *.tsx | *.js | *.jsx | *.py | *.go | *.dart | *.java | *.kt | *.kts | *.cs | *.rs | *.php | *.swift | *.m | *.mm | *.scala | *.lua | *.ex | *.exs | *.fs | *.fsx | *.r | *.gd | *.ps1 | *.psm1 )',
    '        # Heuristic: function-shaped changes or new throws lacking tests.',
    '        # Covers TS/JS (function), Py (def), Go/Kotlin (func/fun), Rust (fn),',
    '        # JVM + C# (public/private/protected modifiers preceding a method head),',
    '        # PowerShell (function), and explicit throws across all of them.',
    '        if git diff --cached "$f" | grep -qE \'^\\+.*\\b(function|def|fn|func|fun) \' \\',
    '          || git diff --cached "$f" | grep -qE \'^\\+.*\\b(public|private|protected|internal|override)\\b.*\\([^)]*\\)\\s*\\{?\' \\',
    '          || git diff --cached "$f" | grep -qE \'^\\+.*\\bthrow(s|)\\b\' \\',
    '          || git diff --cached "$f" | grep -qE \'^\\+.*\\b(raise|panic)\\b\'; then',
    '          risky=1',
    '        fi ;;',
    '    esac',
    '  done',
    '',
    '  if [ "$risky" = "1" ] && [ "$has_tests" = "0" ]; then',
    '    echo ""',
    '    echo "ImpactFlow: high-risk change detected but no test file is staged."',
    '    echo "  · Bypass with: git commit --no-verify"',
    mode === 'block'
      ? '    return 1'
      : '    echo "  · (warn-only mode; commit will proceed)"\n    return 0',
    '  fi',
    '  return 0',
    '}',
    '',
    'impactflow_check || exit $?',
    SENTINEL_END,
  ].join('\n');
}

function stripManagedBlock(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inside = false;
  for (const ln of lines) {
    if (ln.includes(SENTINEL_START)) {
      inside = true;
      continue;
    }
    if (ln.includes(SENTINEL_END)) {
      inside = false;
      continue;
    }
    if (!inside) out.push(ln);
  }
  return out.join('\n');
}
