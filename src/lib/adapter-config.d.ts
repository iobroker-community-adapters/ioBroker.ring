// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
  namespace ioBroker {
    interface AdapterConfig {
      del_old_livestream: boolean;
      auto_livestream: boolean;
      filename_livestream: string;
      path_livestream: string;
      recordtime_livestream: number;
      recordtime_auto_livestream: number;
      del_old_snapshot: boolean;
      auto_snapshot: boolean;
      filename_snapshot: string;
      path_snapshot: string;
      del_old_HDsnapshot: boolean;
      auto_HDsnapshot: boolean;
      filename_HDsnapshot: string;
      path_HDsnapshot: string;
      pollsec: number;
      refreshtoken: string;
      twofaceauth: boolean;

    }
  }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
