declare module 'node:path' {
  function join(...segments: string[]): string;
  function resolve(...segments: string[]): string;
  function extname(path: string): string;
}
