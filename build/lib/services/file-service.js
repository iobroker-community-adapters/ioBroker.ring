"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const main_1 = require("../../main");
require("@iobroker/types");
const fluent_ffmpeg_1 = __importDefault(require("@bropat/fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const stream_1 = require("stream");
class FileService {
    static getPath(basePath, extendedPath, count, shortId, fullId, kind) {
        const fullPath = path_1.default.join(basePath, fullId, extendedPath)
            .replace("%d", String(Date.now()))
            .replace("%n", String(count))
            .replace("%i", shortId)
            .replace("%k", kind);
        return {
            fullPath: fullPath,
            dirname: path_1.default.dirname(fullPath),
            filename: path_1.default.basename(fullPath)
        };
    }
    static async prepareFolder(dirname) {
        if (this.IOBROKER_FILES_REGEX.test(dirname)) {
            return true;
        }
        return new Promise((resolve) => {
            if (!fs_1.default.existsSync(dirname)) {
                fs_1.default.mkdirSync(dirname, { recursive: true });
                if (!main_1.RingAdapter.isWindows) {
                    fs_1.default.chmodSync(dirname, 508);
                }
            }
            resolve(true);
        });
    }
    static deleteFileIfExistSync(fullPath, adapter) {
        if (!fs_1.default.existsSync(fullPath)) {
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
        fs_1.default.unlinkSync(fullPath);
    }
    static async getVisUrl(adapter, fullId, fileName) {
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
        return { visURL: "", visPath: "" };
    }
    static async getTempDir(adapter) {
        const tempPath = path_1.default.join(adapter.absoluteInstanceDir);
        await this.prepareFolder(tempPath);
        return tempPath;
    }
    static async writeFile(fullPath, data, adapter, cb) {
        if (!this.IOBROKER_FILES_REGEX.test(fullPath)) {
            fs_1.default.writeFile(fullPath, data, () => {
                if (cb)
                    cb();
            });
            return;
        }
        adapter.writeFile(adapter.namespace, this.reducePath(fullPath, adapter), data, (r) => {
            if (r) {
                adapter.logCatch(`Failed to write Adapter File '${fullPath}'`, r.message);
            }
            else {
                adapter.log.silly(`Adapter File ${fullPath} written!`);
                if (cb)
                    cb();
            }
        });
    }
    static async stream2buffer(stream) {
        const _buf = Array();
        stream.on("data", chunk => _buf.push(chunk));
        stream.on("end", () => { return Buffer.concat(_buf); });
        return Buffer.concat(Array());
    }
    static async writeHDSnapshot(fullPath, data, adapter, cb) {
        await new Promise((resolve, reject) => {
            try {
                if (ffmpeg_static_1.default) {
                    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
                    (0, fluent_ffmpeg_1.default)()
                        .input(stream_1.Readable.from(data))
                        .withProcessOptions({
                        detached: true
                    })
                        .frames(1)
                        .outputFormat("mjpeg")
                        // .output(stream)
                        .output(fullPath)
                        .on("error", function (err, stdout, stderr) {
                        adapter.log.error(`writeHDSnapshot(): An error occurred: ${err.message}`);
                        adapter.log.error(`writeHDSnapshot(): ffmpeg output:\n${stdout}`);
                        adapter.log.error(`writeHDSnapshot(): ffmpeg stderr:\n${stderr}`);
                        reject(err);
                    })
                        .on("end", () => {
                        adapter.log.debug("`writeHDSnapshot(): HD Snapshot generated!");
                        if (cb)
                            cb();
                        resolve();
                    })
                        .run();
                }
                else {
                    reject(new Error("ffmpeg binary not found"));
                }
            }
            catch (error) {
                adapter.log.error(`ffmpegPreviewImage(): Error: ${error}`);
                reject(error);
            }
        });
        // await this.writeFile(fullPath, data, adapter, cb)
    }
    static reducePath(fullPath, adapter) {
        return fullPath.split(adapter.namespace)[1];
    }
}
exports.FileService = FileService;
FileService.IOBROKER_FILES_REGEX = new RegExp(/.*iobroker-data\/files.*/);
//# sourceMappingURL=file-service.js.map