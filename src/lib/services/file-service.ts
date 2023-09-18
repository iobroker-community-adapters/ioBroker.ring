import path from "path"
import fs, { WriteStream } from "fs"
import { RingAdapter } from "../../main"
import "@iobroker/types"
import { PathInfo } from "./path-info"
import ffmpeg from "@bropat/fluent-ffmpeg"
import pathToFfmpeg from "ffmpeg-static"
import { Readable, Writable, pipeline } from "stream"
import { buffer } from "stream/consumers";

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

  private static async stream2buffer(stream: WriteStream): Promise<Buffer> {
    const _buf = Array < any > ();
    stream.on("data", chunk => _buf.push(chunk));
    stream.on("end", () => { return Buffer.concat(_buf)});
    return Buffer.concat(Array < any > ())
  }

  public static async writeHDSnapshot(fullPath: string, data: Buffer, adapter: RingAdapter, cb?: ()=>void): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        if (pathToFfmpeg) {
          ffmpeg.setFfmpegPath(pathToFfmpeg)
          ffmpeg()
            .input(Readable.from(data))
            .withProcessOptions({
              detached: true
            })
            .frames(1)
            .outputFormat("mjpeg")
            // .output(stream)
            .output(fullPath)
            .on("error", function(err: { message: any }, stdout: any, stderr: any) {
              adapter.log.error(`writeHDSnapshot(): An error occurred: ${err.message}`)
              adapter.log.error(`writeHDSnapshot(): ffmpeg output:\n${stdout}`)
              adapter.log.error(`writeHDSnapshot(): ffmpeg stderr:\n${stderr}`)
              reject(err);
            })
            .on("end", () => {
              adapter.log.debug("`writeHDSnapshot(): HD Snapshot generated!")
              if (cb) cb()
              resolve();
            })
            .run()
        } else {
          reject(new Error("ffmpeg binary not found"))
        }
      } catch (error) {
        adapter.log.error(`ffmpegPreviewImage(): Error: ${error}`)
        reject(error)
      }
    })
    // await this.writeFile(fullPath, data, adapter, cb)
  }

  private static reducePath(fullPath: string, adapter: RingAdapter): string {
    return fullPath.split(adapter.namespace)[1];
  }
}

