import path from "path";
import fs  from "fs";
import { RingAdapter } from "../../main";

export class FileService {
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

  public static prepareFolder(dirname: string): Promise<boolean> {
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

  public static deleteFileIfExist(fullPath: string): void {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
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
}

