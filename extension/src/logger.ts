import * as vscode from 'vscode';

class Logger {
  private channel: vscode.OutputChannel | undefined;
  private ringBuffer: string[] = [];
  private readonly ringMax = 500;

  init(context: vscode.ExtensionContext): void {
    this.channel = vscode.window.createOutputChannel('ImpactFlow', { log: true });
    context.subscriptions.push(this.channel);
  }

  info(msg: string): void {
    this.write('INFO', msg);
  }
  warn(msg: string): void {
    this.write('WARN', msg);
  }
  error(msg: string, err?: unknown): void {
    const detail =
      err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err ? String(err) : '';
    this.write('ERROR', detail ? `${msg}\n${detail}` : msg);
  }
  debug(msg: string): void {
    this.write('DEBUG', msg);
  }

  recent(n = 200): string[] {
    return this.ringBuffer.slice(-n);
  }

  private write(level: string, msg: string): void {
    const line = `[${new Date().toISOString()}] ${level} ${msg}`;
    this.ringBuffer.push(line);
    if (this.ringBuffer.length > this.ringMax) this.ringBuffer.shift();
    this.channel?.appendLine(line);
  }
}

export const logger = new Logger();
