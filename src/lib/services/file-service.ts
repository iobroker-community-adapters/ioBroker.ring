import path from "path";
import fs from "fs";
import { RingAdapter } from "../../main";
import * as utils from "@iobroker/adapter-core";

export class FileService {
  public static readonly IOBROKER_FILES_REGEX = new RegExp(/.*iobroker-data\/files.*/);
  public static getPath(
    basePath: string,
    extendedPath: string,
    count: number,
    shortId: string,
    fullId: string,
    kind: string
  ): {
      fullPath: string,
      dirname: string,
      filename: string
    } {
    const fullPath = path.join(basePath, fullId, extendedPath)
      .replace("%d", String(Date.now()))
      .replace("%n", String(count))
      .replace("%i", shortId)
      .replace("%k", kind);
    return {
      fullPath: fullPath,
      dirname: path.dirname(fullPath),
      filename: path.basename(fullPath)
    };
  }

  public static async prepareFolder(dirname: string): Promise<boolean> {
    if (this.IOBROKER_FILES_REGEX.test(dirname)) {
      return true;
    }
    return new Promise<boolean>((resolve) => {
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
      adapter.delFile(adapter.namespace, this.reducePath(fullPath, adapter), (r) => {
        if (r) {
          adapter.logCatch(`Failed to delete File '${fullPath}'`, r.message);
        }
      });
      return;
    }
    fs.unlinkSync(fullPath);
  }

  public static async getVisUrl(adapter: RingAdapter, fullId: string, stateName: string): Promise<string> {
    const vis = await adapter.getForeignObjectAsync("system.adapter.web.0").catch((reason) => {
      adapter.logCatch(`Couldn't load "web.0" Adapter object.`, reason);
    });
    if (vis && vis.native) {
      const secure = vis.native.secure ? "https" : "http";
      return `${secure}://${adapter.host}:${vis.native.port
      }/state/${adapter.namespace}.${fullId}.${stateName}`;
    }
    return "";
  }

  public static async getTempDir(adapter: RingAdapter): Promise<string> {
    const tempPath = path.join(utils.getAbsoluteInstanceDataDir(adapter));
    await this.prepareFolder(tempPath);
    return tempPath;
  }

  public static writeFileSync(fullPath: string, data: Buffer, adapter: RingAdapter): void {
    if (this.IOBROKER_FILES_REGEX.test(fullPath)) {
      adapter.writeFile(adapter.namespace, this.reducePath(fullPath, adapter), data, (r) => {
        if (r) {
          adapter.logCatch(`Failed to write Adapter File '${fullPath}'`, r.message);
        }
      });
      return;
    }
    fs.writeFileSync(fullPath, data);
  }

  private static reducePath(fullPath: string, adapter: RingAdapter): string {
    return fullPath.split(adapter.namespace)[1];
  }
}

