import path from "path";
import fs from "fs";
import "@iobroker/types";

import { RingAdapter } from "../../main";
import { PathInfo } from "./path-info";

export class FileService {
  public static readonly IOBROKER_FILES_REGEX: RegExp = new RegExp(/.*iobroker-data\/files.*/);

  private static getFormattedDate(): string {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    return `${YYYY}${MM}${DD}`;
  }

  private static getFormattedTime(): string {
    const now = new Date();
    const HH = String(now.getHours()).padStart(2, '0');
    const ii = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${HH}${ii}${ss}`;
  }
  
  public static getPath(
    basePath: string,
    extendedPath: string,
    count: number,
    shortId: string,
    fullId: string,
    kind: string
  ): PathInfo {
    const fullPath: string = path.join(basePath, fullId, extendedPath)
      .replace("%d", String(Date.now()))
      .replace("%g", this.getFormattedDate())
      .replace("%t", this.getFormattedTime())
      .replace("%n", String(count))
      .replace("%i", shortId)
      .replace("%k", kind);

    return {
      fullPath: fullPath,
      dirname: path.dirname(fullPath),
      filename: path.basename(fullPath),
    };
  }

  public static async prepareFolder(dirname: string): Promise<boolean> {
    if (this.IOBROKER_FILES_REGEX.test(dirname)) {
      return true;
    }
    return new Promise<boolean>((resolve: (value: (PromiseLike<boolean> | boolean)) => void): void => {
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, {recursive: true});
        if (!RingAdapter.isWindows) {
          fs.chmodSync(dirname, 508);
        }
      }
      resolve(true);
    });
  }

  public static deleteFileIfExistSync(fullPath: string, adapter: RingAdapter): void {
    if (!fs.existsSync(fullPath)) {
      return;
    }
    if (this.IOBROKER_FILES_REGEX.test(fullPath)) {
      adapter.delFile(adapter.namespace, this.reducePath(fullPath, adapter), (r: NodeJS.ErrnoException | null | undefined): void => {
        if (r) {
          adapter.logCatch(`Failed to delete File '${fullPath}'`, r.message);
        }
      });
      return;
    }
    fs.unlinkSync(fullPath);
  }

  public static async getVisUrl(adapter: RingAdapter, fullId: string, fileName: string): Promise<{
    visURL: string,
    visPath: string,
  }> {
    const vis: ioBroker.InstanceObject | null | void = await adapter.getForeignObjectAsync("system.adapter.web.0")
      .catch((reason: any): void => {
        adapter.logCatch(`Couldn't load "web.0" Adapter object.`, reason);
      });
    if (vis && vis.native) {
      const secure: string = vis.native.secure ? "https" : "http";
      const prefix: string = `${adapter.namespace}/${adapter.name}_${adapter.instance}_${fullId}_${fileName}`;
      return {
        visURL: `${secure}://${adapter.host}:${vis.native.port}/${prefix}`,
        visPath: `${adapter.absoluteDefaultDir}files/${prefix}`,
      };
    }
    return {visURL: "", visPath: ""};
  }

  public static async getTempDir(adapter: RingAdapter): Promise<string> {
    const tempPath: string = path.join(adapter.absoluteInstanceDir);
    await this.prepareFolder(tempPath);
    return tempPath;
  }

  public static async writeFile(fullPath: string, data: Buffer, adapter: RingAdapter): Promise<void> {
    return new Promise((resolve: (value: void) => void, reject: (reason?: any) => void): void => {
      if (!this.IOBROKER_FILES_REGEX.test(fullPath)) {
        fs.writeFile(fullPath, data, (r: NodeJS.ErrnoException | null): void => {
          if (r) {
            adapter.logCatch(`Failed to write File '${fullPath}'`, r.message);
            reject(r);
          } else {
            adapter.log.silly(`File ${fullPath} written!`);
            resolve();
          }
        });
        return;
      }
      adapter.writeFile(
        adapter.namespace,
        this.reducePath(fullPath, adapter),
        data,
        (r: NodeJS.ErrnoException | null | undefined): void => {
          if (r) {
            adapter.logCatch(`Failed to write Adapter File '${fullPath}'`, r.message);
            reject(r);
          } else {
            adapter.log.silly(`Adapter File ${fullPath} written!`);
            resolve(undefined);
          }
        });
    });
  }

  private static reducePath(fullPath: string, adapter: RingAdapter): string {
    return fullPath.split(adapter.namespace)[1];
  }
}

