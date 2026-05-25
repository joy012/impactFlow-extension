// Shared JVM effect patterns — used by Java and Kotlin.
import type { EffectKind } from '../../behavior-diff/effect-patterns.js';

export const JVM_EFFECT_PATTERNS: Array<{ kind: EffectKind; match: RegExp }> = [
  { kind: 'network', match: /\b(HttpClient|HttpURLConnection|URL|Socket)\s*[(.]/ },
  { kind: 'network', match: /\b(RestTemplate|WebClient|OkHttpClient)\s*[(.]/ },
  {
    kind: 'fs',
    match: /\b(File|FileInputStream|FileOutputStream|FileReader|FileWriter|Files)\s*[(.]/,
  },
  { kind: 'fs', match: /\b(Path|Paths)\.(get|of)\s*\(/ },
  { kind: 'env', match: /\bSystem\.(getenv|getProperty|setProperty)\s*\(/ },
  { kind: 'env', match: /\bRuntime\.getRuntime\(\)\.exec\s*\(/ },
  { kind: 'env', match: /\bProcessBuilder\s*\(/ },
  { kind: 'console', match: /\bSystem\.(out|err)\.(print|println|printf)\s*\(/ },
  { kind: 'console', match: /\b(Logger|Log)\.(debug|info|warn|error|trace)\s*\(/ },
  { kind: 'console', match: /\bprintln\s*\(/ }, // Kotlin top-level
  // Persistence (SQL / ORM)
  {
    kind: 'fs',
    match: /\b(EntityManager|JdbcTemplate|Connection|Statement|PreparedStatement)\s*[(.]/,
  },
];
