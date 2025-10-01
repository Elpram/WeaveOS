declare module 'node:http' {
  export interface IncomingMessage {
    method?: string | null;
    url?: string | null;
    headers: Record<string, string | string[] | undefined>;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(payload?: string): void;
  }

  export interface ListenOptions {
    port: number;
    host: string;
  }

  export interface ServerAddress {
    port: number;
    address: string;
  }

  export interface Server {
    listen(options: ListenOptions, callback?: () => void): Server;
    close(callback?: (error?: Error) => void): void;
    address(): ServerAddress | null;
    on(event: 'error', listener: (error: Error) => void): Server;
  }

  export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void;

  export function createServer(listener: RequestListener): Server;
}
