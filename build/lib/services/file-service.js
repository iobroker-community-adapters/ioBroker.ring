"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
require("@iobroker/types");
const main_1 = require("../../main");
class FileService {
    static getFormattedDate() {
        const now = new Date();
        const YYYY = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, "0");
        const DD = String(now.getDate()).padStart(2, "0");
        return `${YYYY}${MM}${DD}`;
    }
    static getFormattedTime() {
        const now = new Date();
        const HH = String(now.getHours()).padStart(2, "0");
        const ii = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        return `${HH}${ii}${ss}`;
    }
    static getPath(basePath, extendedPath, count, shortId, fullId, kind) {
        const fullPath = path_1.default.join(basePath, fullId, extendedPath)
            .replace("%d", String(Date.now()))
            .replace("%g", this.getFormattedDate())
            .replace("%t", this.getFormattedTime())
            .replace("%n", String(count))
            .replace("%i", shortId)
            .replace("%k", kind);
        return {
            fullPath: fullPath,
            dirname: path_1.default.dirname(fullPath),
            filename: path_1.default.basename(fullPath),
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
        const vis = await adapter.getForeignObjectAsync("system.adapter.web.0")
            .catch((reason) => {
            adapter.logCatch(`Couldn't load "web.0" Adapter object.`, reason);
        });
        if (vis && vis.native) {
            const secure = vis.native.secure ? "https" : "http";
            const prefix = `${adapter.namespace}/${adapter.name}_${adapter.instance}_${fullId}_${fileName}`;
            return {
                visURL: `${secure}://${adapter.host}:${vis.native.port}/${prefix}`,
                visPath: `${adapter.absoluteDefaultDir}files/${prefix}`,
            };
        }
        return { visURL: "", visPath: "" };
    }
    static async getTempDir(adapter) {
        const tempPath = path_1.default.join(adapter.absoluteInstanceDir);
        await this.prepareFolder(tempPath);
        return tempPath;
    }
    static async writeFile(fullPath, data, adapter) {
        return new Promise((resolve, reject) => {
            if (!this.IOBROKER_FILES_REGEX.test(fullPath)) {
                fs_1.default.writeFile(fullPath, data, (r) => {
                    if (r) {
                        adapter.logCatch(`Failed to write File '${fullPath}'`, r.message);
                        reject(r);
                    }
                    else {
                        adapter.log.silly(`File ${fullPath} written!`);
                        resolve();
                    }
                });
                return;
            }
            adapter.writeFile(adapter.namespace, this.reducePath(fullPath, adapter), data, (r) => {
                if (r) {
                    adapter.logCatch(`Failed to write Adapter File '${fullPath}'`, r.message);
                    reject(r);
                }
                else {
                    adapter.log.silly(`Adapter File ${fullPath} written!`);
                    resolve(undefined);
                }
            });
        });
    }
    static reducePath(fullPath, adapter) {
        return fullPath.split(adapter.namespace)[1];
    }
}
exports.FileService = FileService;
FileService.IOBROKER_FILES_REGEX = new RegExp(/.*iobroker-data\/files.*/);
//# sourceMappingURL=file-service.js.map