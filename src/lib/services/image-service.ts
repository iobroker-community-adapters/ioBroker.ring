import type Sharp from 'sharp';
import type { RingAdapter } from '../../main';
import { TextService } from './text-service';

export class ImageService {
    /** "sharp" is loaded on first use, see loadSharp() */
    private static _sharp: Promise<typeof Sharp | null> | undefined;

    /**
     * "sharp" is a native module. Where its binary cannot be loaded, a static import crashes the whole
     * adapter on start (#1024, #797) - but it is only needed for the text overlay of snapshots and to
     * sharpen HD snapshots. So it is loaded on demand, once for all cameras; if that fails, the images
     * are stored without overlay and unsharpened. Never import it statically, test/package.js checks that.
     */
    public static loadSharp(adapter: RingAdapter): Promise<typeof Sharp | null> {
        ImageService._sharp ??= import('sharp')
            .then((module): typeof Sharp => module.default)
            .catch((reason: any): null => {
                adapter.log.warn(
                    `Image library "sharp" could not be loaded, snapshots get no text overlay and HD snapshots are not sharpened: ${reason?.message ?? reason}`,
                );
                if (reason?.stack !== undefined) {
                    adapter.log.debug(`Error Stack: ${reason.stack}`);
                }
                return null;
            });
        return ImageService._sharp;
    }

    public static videoFilter(
        overlay: boolean,
        dateFormat: string,
        language?: string,
        mainText: string = '',
        startTime: number = 0,
    ): string[] {
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
                      text=%{localtime\\:${TextService.getTodayName(language)}, ${TextService.getDateFormat(dateFormat)} %T}'`;
        return overlay && startTime > 0
            ? ['-ss', start, '-vf', filter]
            : overlay
              ? ['-vf', filter]
              : startTime > 0
                ? ['-ss', start]
                : [];
    }

    /** @returns the image with the texts, or the unchanged image if "sharp" is not available */
    public static async addTextToJpgBuffer(
        adapter: RingAdapter,
        jpg: Buffer,
        mainText: string,
        secondaryText: string,
    ): Promise<Buffer> {
        const sharp: typeof Sharp | null = await ImageService.loadSharp(adapter);
        if (!sharp) {
            return jpg;
        }
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

        const svgBuffer: Buffer = Buffer.from(svgText);

        return sharp(jpg)
            .composite([{ input: svgBuffer, left: 0, top: 0 }])
            .toBuffer();
    }
}
