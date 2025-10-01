declare module 'node:fs' {
  namespace promises {
    type BinaryLike = { toString(encoding?: string): string };

    function readFile(path: string, options?: { encoding?: string }): Promise<BinaryLike | string>;
  }
}
