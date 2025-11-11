declare module 'jwks-client' {
  export interface SigningKey {
    getPublicKey(): string;
  }

  export interface JwksClient {
    getKeys(callback: (err: Error | null, keys: any) => void): void;
    getSigningKey(kid: string, callback: (err: Error | null, key: SigningKey) => void): void;
  }

  export interface JwksClientOptions {
    jwksUri: string;
    cache?: boolean;
    cacheMaxAge?: number;
    rateLimit?: boolean;
    jwksRequestsPerMinute?: number;
  }

  function jwksClient(options: JwksClientOptions): JwksClient;
  export = jwksClient;
}
