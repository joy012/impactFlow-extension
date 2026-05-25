import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
  'impactflow.analyzeNow',
  'impactflow.summarizeStaged',
  'impactflow.compareBranches',
  'impactflow.toggleFocusMode',
  'impactflow.findDeadCode',
  'impactflow.cleanupDeadCode',
  'impactflow.refreshCoverage',
  'impactflow.draftCommitMessage',
  'impactflow.draftPrDescription',
  'impactflow.installPreCommit',
  'impactflow.installPreCommitBlock',
  'impactflow.uninstallPreCommit',
  'impactflow.resetBaseline',
  'impactflow.resetDismissals',
  'impactflow.showPerf',
  'impactflow.sendFeedback',
  'impactflow.reportBug',
  'impactflow.requestFeature',
  'impactflow.ai.explainChange',
  'impactflow.ai.suggestTests',
  'impactflow.ai.reviewHighRisk',
  'impactflow.ai.updateDocs',
  'impactflow.ai.whyRisk',
  'impactflow.ai.triage',
  'impactflow.ai.clearCache',
  'impactflow.jumpToFn',
  'impactflow.cycleSeverity',
  'impactflow.showCallerTree',
  'impactflow.showCallerTreeVisual',
];

suite('ImpactFlow extension', () => {
  test('activates and registers every declared command', async () => {
    const ext = vscode.extensions.getExtension('joy012.extension');
    assert.ok(ext, 'extension not found');
    await ext.activate();
    const all = await vscode.commands.getCommands(true);
    for (const cmd of EXPECTED_COMMANDS) {
      assert.ok(all.includes(cmd), `command not registered: ${cmd}`);
    }
  });

  test('Show Performance Diagnostics command does not throw on empty workspace', async () => {
    // The command shows an info message; we only care that it resolves cleanly.
    await vscode.commands.executeCommand('impactflow.showPerf');
  });

  test('settings are present + sane defaults', () => {
    const cfg = vscode.workspace.getConfiguration('impactflow');
    assert.strictEqual(cfg.get('enable'), true);
    assert.strictEqual(cfg.get('telemetry'), false);
    assert.strictEqual(cfg.get('ai.enable'), false);
  });
});
