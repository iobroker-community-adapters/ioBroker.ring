// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
  namespace ioBroker {
    interface AdapterConfig {
      del_old_livestream: boolean;
      del_old_snapshot: boolean;
      filename_livestream: string;
      filename_snapshot: string;
      path: string;
      pollsec: number;
      recordtime_livestream: number;
      refreshtoken: string;
      twofaceauth: boolean;

    }
  }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
