import Sharp from "sharp";
import { TextService } from "./text-service";

export class ImageService {
  public static videoFilter(
    overlay: boolean,
    dateFormat: string,
    language?: string,
    mainText: string = "",
    startTime: number = 0
  ): string[] {
    const start: string = `00:00:0${startTime.toString()}`;
    const filter: string = `drawtext='
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
                      text=%{localtime\\:${TextService.getTodayName(language)}, ${TextService.getDateFormat(dateFormat)} %T}'`;
    return (overlay && startTime > 0 ? ["-ss", start, "-vf", filter] :
      (overlay ? ["-vf", filter] :
        (startTime > 0 ? ["-ss", start] : [])));
  }

  public static async addTextToJpgBuffer(jpg: Buffer, mainText: string, secondaryText: string): Promise<Buffer> {
    const width: number = 640;
    const height: number = 360;
    const font_size: number = 15;
    const border_dist: number = 10;

    const svgText: string = `
      <svg width="${width}" height="${height}">
        <style>
          .title { fill: white; font-size: ${font_size}px; filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.9))}
        </style>
        <text x="${width - border_dist}" y="${border_dist + font_size}" text-anchor="end" class="title">${mainText}</text>
        <text x="10" y="${height - border_dist}" text-anchor="start" class="title">${secondaryText}</text>
      </svg>`;

    const svgBuffer: Buffer = Buffer.from(svgText);

    return Sharp(jpg)
      .composite([{input: svgBuffer, left: 0, top: 0}])
      .toBuffer();
  }
}
