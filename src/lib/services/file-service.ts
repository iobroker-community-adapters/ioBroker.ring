import path from "path"
import fs from "fs"
import { RingAdapter } from "../../main"
import "@iobroker/types"
import { PathInfo } from "./path-info"

export class FileService {
  public static readonly IOBROKER_FILES_REGEX = new RegExp(/.*iobroker-data\/files.*/);

  public static getPath(
    basePath: string,
    extendedPath: string,
    count: number,
    shortId: string,
    fullId: string,
    kind: string
  ): PathInfo {
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

  public static async getVisUrl(adapter: RingAdapter, fullId: string, fileName: string): Promise<{
    visURL: string,
    visPath: string
  }> {
    const vis = await adapter.getForeignObjectAsync("system.adapter.web.0").catch((reason) => {
      adapter.logCatch(`Couldn't load "web.0" Adapter object.`, reason);
    });
    if (vis && vis.native) {
      const secure = vis.native.secure ? "https" : "http";
      const prefix = `${adapter.namespace}/${adapter.name}_${adapter.instance}_${fullId}_${fileName}`;
      return {
        visURL: `${secure}://${adapter.host}:${vis.native.port}/${prefix}`,
        visPath: `${adapter.absoluteDefaultDir}files/${prefix}`
      };
    }
    return {visURL: "", visPath: ""}
  }

  public static async getTempDir(adapter: RingAdapter): Promise<string> {
    const tempPath = path.join(adapter.absoluteInstanceDir);
    await this.prepareFolder(tempPath);
    return tempPath;
  }

  public static async writeFile(fullPath: string, data: Buffer, adapter: RingAdapter, cb?: ()=>void): Promise<void> {
    if (!this.IOBROKER_FILES_REGEX.test(fullPath)) {
      fs.writeFile(fullPath, data, ()=>{
        if (cb) cb();
      })
      return;
    }
    adapter.writeFile(adapter.namespace, this.reducePath(fullPath, adapter), data, (r) => {
      if (r) {
        adapter.logCatch(`Failed to write Adapter File '${fullPath}'`, r.message)
      } else {
        adapter.log.silly(`Adapter File ${fullPath} written!`)
        if (cb) cb()
      }
    });
  }

  private static reducePath(fullPath: string, adapter: RingAdapter): string {
    return fullPath.split(adapter.namespace)[1];
  }
}

