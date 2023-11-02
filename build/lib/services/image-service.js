"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageService = void 0;
const sharp_1 = __importDefault(require("sharp"));
const text_service_1 = require("./text-service");
class ImageService {
    static videoFilter(overlay, dateFormat, language, mainText = "", startTime = 0) {
        const start = `00:00:0${startTime.toString()}`;
        const filter = `drawtext='
                      fontsize=30:
                      fontcolor=white:
                      x=(main_w-text_w-20):
                      y=20:shadowcolor=black:
                      shadowx=2:
                      shadowy=2:
                      text=${mainText}',
                    drawtext='
                      fontsize=30:
                      fontcolor=white:
                      x=20:
                      y=(main_h-text_h-20):
                      shadowcolor=black:
                      shadowx=2:
                      shadowy=2:
                      text=%{localtime\\:${text_service_1.TextService.getTodayName(language)}, ${text_service_1.TextService.getDateFormat(dateFormat)} %T}'`;
        return (overlay && startTime > 0 ? ["-ss", start, "-vf", filter] :
            (overlay ? ["-vf", filter] :
                (startTime > 0 ? ["-ss", start] : [])));
    }
    static async addTextToJpgBuffer(jpg, mainText, secondaryText) {
        const width = 640;
        const height = 360;
        const font_size = 15;
        const border_dist = 10;
        const svgText = `
      <svg width="${width}" height="${height}">
        <style>
          .title { fill: white; font-size: ${font_size}px; filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.9))}
        </style>
        <text x="${width - border_dist}" y="${border_dist + font_size}" text-anchor="end" class="title">${mainText}</text>
        <text x="10" y="${height - border_dist}" text-anchor="start" class="title">${secondaryText}</text>
      </svg>`;
        const svgBuffer = Buffer.from(svgText);
        return (0, sharp_1.default)(jpg)
            .composite([{ input: svgBuffer, left: 0, top: 0 }])
            .toBuffer();
    }
}
exports.ImageService = ImageService;
//# sourceMappingURL=image-service.js.map