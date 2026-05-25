import * as vscode from 'vscode';
import { logger } from './logger.js';
import type { Pipeline } from './pipeline.js';

// Process-level snapshot at extension activation, used as the baseline so we
// can show DELTAs (more useful than absolutes when comparing across sessions).
let baselineMem: NodeJS.MemoryUsage | undefined;
let baselineCpu: NodeJS.CpuUsage | undefined;
let activatedAt = 0;

export const markActivation = (): void => {
  baselineMem = process.memoryUsage();
  baselineCpu = process.cpuUsage();
  activatedAt = Date.now();
};

interface ProcessMetrics {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  deltaSinceActivationMb: number;
}

interface CpuMetrics {
  userSec: number;
  systemSec: number;
}

const toMb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

const collectProcess = (): ProcessMetrics => {
  const m = process.memoryUsage();
  return {
    rssMb: toMb(m.rss),
    heapUsedMb: toMb(m.heapUsed),
    heapTotalMb: toMb(m.heapTotal),
    externalMb: toMb(m.external),
    arrayBuffersMb: toMb(m.arrayBuffers),
    deltaSinceActivationMb: baselineMem ? toMb(m.heapUsed - baselineMem.heapUsed) : 0,
  };
};

const collectCpu = (): CpuMetrics => {
  const c = process.cpuUsage(baselineCpu);
  return {
    userSec: Math.round((c.user / 1_000_000) * 10) / 10,
    systemSec: Math.round((c.system / 1_000_000) * 10) / 10,
  };
};

const formatUptime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

export const renderDiagnostics = (pipeline: Pipeline): string => {
  const mem = collectProcess();
  const cpu = collectCpu();
  const perf = pipeline.perfStats();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const uptime = activatedAt ? formatUptime(Date.now() - activatedAt) : 'unknown';

  const lines: string[] = [
    '# ImpactFlow — Performance Diagnostics',
    '',
    `Generated ${new Date().toISOString()}`,
    '',
    '## Extension host process',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Uptime since ImpactFlow activated | **${uptime}** |`,
    `| RSS (total process memory) | **${mem.rssMb} MB** |`,
    `| Heap used | **${mem.heapUsedMb} MB** of ${mem.heapTotalMb} MB |`,
    `| Heap delta since activation | **${mem.deltaSinceActivationMb >= 0 ? '+' : ''}${mem.deltaSinceActivationMb} MB** |`,
    `| External (Buffer/wasm) | ${mem.externalMb} MB |`,
    `| ArrayBuffers | ${mem.arrayBuffersMb} MB |`,
    `| CPU user time since activation | **${cpu.userSec} s** |`,
    `| CPU system time since activation | ${cpu.systemSec} s |`,
    '',
    '> RSS includes the **entire VS Code extension host process**, which runs every installed extension. The "Heap delta since activation" line is the most honest measure of *ImpactFlow\'s* contribution — though some growth comes from tree-sitter grammars loaded on demand.',
    '',
    '## Pipeline',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Analysis samples collected | ${perf.samples} |`,
    `| p50 per-file analysis time | **${perf.p50.toFixed(1)} ms** |`,
    `| p95 per-file analysis time | **${perf.p95.toFixed(1)} ms** |`,
    `| Last analysis time | ${perf.last == null ? '–' : `${perf.last.toFixed(1)} ms`} |`,
    `| Open workspace folders | ${folders.length} |`,
    '',
    '## What to share if you hit slowness',
    '',
    'Copy this whole report into a GitHub issue. The most diagnostic lines are:',
    '- **Heap delta since activation** > ~80 MB suggests a leak or stuck caches.',
    '- **p95 per-file** > 250 ms suggests a slow parser or LSP query bottleneck.',
    '- **CPU user time** rising while idle suggests an unintended background loop.',
    '',
    '## Reset state if anything looks wrong',
    '',
    '- `ImpactFlow: Reset Baseline` — drops snapshots and re-analyzes.',
    '- `ImpactFlow: AI: Clear Response Cache` — drops the AI cache + rate-limit windows.',
    '- `Developer: Reload Window` — full reset including grammar cache.',
  ];

  logger.info(
    `Diagnostics: rss=${mem.rssMb}MB · heap=${mem.heapUsedMb}MB (Δ${mem.deltaSinceActivationMb}MB) · p50=${perf.p50.toFixed(1)}ms · p95=${perf.p95.toFixed(1)}ms`,
  );

  return lines.join('\n');
};
