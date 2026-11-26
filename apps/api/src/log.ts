import { createLogger, type Logger, type LogMeta } from "@easyjobs/contract/node";

const ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof ORDER;

/** Contract logger (LOG_FORMAT=json → JSON lines) with a LOG_LEVEL floor: debug | info | warn | error. */
export function createApiLogger(scope = "api", level: string | undefined = process.env.LOG_LEVEL): Logger {
  const base = createLogger(scope);
  const min = ORDER[(level as Level) ?? "info"] ?? ORDER.info;
  const at =
    (lvl: Level) =>
    (msg: string, meta?: LogMeta): void => {
      if (ORDER[lvl] >= min) base[lvl](msg, meta);
    };
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (s) => createApiLogger(`${scope}:${s}`, level),
  };
}

/** Logger that drops everything (tests). */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
