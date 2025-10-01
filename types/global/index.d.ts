interface ProcessEnv {
  [key: string]: string | undefined;
}

declare const process: {
  env: ProcessEnv;
  exit(code?: number): never;
};

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare const __dirname: string;
