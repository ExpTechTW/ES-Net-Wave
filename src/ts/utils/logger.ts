class Logger {
  private static instance: Logger;
  private levelStyles!: Record<string, string>;

  constructor() {
    if (Logger.instance) return Logger.instance;
    Logger.instance = this;
    this.levelStyles = {
      info: "color: #2ecc71; font-weight: 600;", // green
      debug: "color: #3498db; font-weight: 600;", // blue
      warn: "color: #f39c12; font-weight: 600;", // orange
      error: "color: #e74c3c; font-weight: 600;", // red
      ts: "color: #7f8c8d;", // grey
    };
  }

  private formatTs(): string {
    const d = new Date();
    const hh = this.twoDigits(d.getHours());
    const mm = this.twoDigits(d.getMinutes());
    const ss = this.twoDigits(d.getSeconds());
    return `${hh}:${mm}:${ss}`;
  }

  private twoDigits(n: number): string {
    return n < 10 ? "0" + n : "" + n;
  }

  private hasObjectArg(args: any[]): boolean {
    return Array.from(args).some(
      (a) => (a && typeof a === "object") || typeof a === "function",
    );
  }

  private prefix(level: string): { ts: string; level: string } {
    const ts = this.formatTs();
    return { ts, level };
  }

  private logToConsole(level: string, consoleFn: (...data: any[]) => void, args: any[]): void {
    const { ts } = this.prefix(level);
    const styleTs = this.levelStyles.ts;
    const styleLvl = this.levelStyles[level] || "";

    try {
      const fmtParts: string[] = [`%c[${ts}]%c[${level}]`];
      const params: any[] = [styleTs, styleLvl];

      if (args.length) {
        fmtParts.push("%c");
        params.push("");
      }

      for (const a of args) {
        if (a && (typeof a === "object" || typeof a === "function")) {
          fmtParts.push(" %o");
          params.push(a);
        } else {
          fmtParts.push(" %s");
          params.push(String(a));
        }
      }

      consoleFn(fmtParts.join(""), ...params);
      return;
    } catch (e) {
      // fallback
    }

    consoleFn(`%c[${ts}]%c[${level}]`, styleTs, styleLvl, ...args);
  }

  info(...args: any[]): any {
    this.logToConsole("info", console.info.bind(console), args);
    return args.length === 1 ? args[0] : args;
  }

  debug(...args: any[]): any {
    this.logToConsole("debug", console.log.bind(console), args);
    return args.length === 1 ? args[0] : args;
  }

  warn(...args: any[]): any {
    this.logToConsole("warn", console.warn.bind(console), args);
    return args.length === 1 ? args[0] : args;
  }

  error(...args: any[]): any {
    this.logToConsole("error", console.error.bind(console), args);
    return args.length === 1 ? args[0] : args;
  }
}

const logger = new Logger();

export { logger };
