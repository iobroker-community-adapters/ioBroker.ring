/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';

const events = require('events');
const semver = require('semver');
const fs = require('fs');
const { RingApi } = require('ring-client-api');
const { bindToRandomPort, getSsrc } = require('ring-client-api');
const { RtpOptions, SipSession } = require('ring-client-api');
const { ReplaySubject } = require('rxjs');
const { filter, map, take } = require('rxjs/operators');
const { createSocket } = require('dgram');
const { spawn } = require('child_process');
const path = require('path');
const express = require('express');
const RtspServer = require('rtsp-streaming-server').default;

class PacketParser {
  // part = Buffer.from([])
  packetReceived(message) {
    const row0 = message.readUInt32BE(0),
      // version = (row0 & parseInt('11000000000000000000000000000000', 2)) >>> 30,
      // padding = (row0 & parseInt('00100000000000000000000000000000', 2)) >>> 29,
      // extension =
      //   (row0 & parseInt('00010000000000000000000000000000', 2)) >>> 28,
      csrcCount =
        (row0 & parseInt('00001111000000000000000000000000', 2)) >>> 24,
      // marker = (row0 & parseInt('00000000100000000000000000000000', 2)) >>> 23,
      payloadType =
        (row0 & parseInt('00000000011111110000000000000000', 2)) >>> 16,
      // sequenceNum =
      //   (row0 & parseInt('00000000000000001111111111111111', 2)) >>> 0,
      isH264 = payloadType === 99; // Defined in our SIP INVITE.
    if (!isH264) {
      return;
    }

    const //timestamp = message.readUInt32BE(4),
      // ssrc = message.readUInt32BE(8),
      payloadStartOffset = 12 + 4 * csrcCount,
      nalUnitHeader = message.readUInt8(payloadStartOffset),
      forbidden = (nalUnitHeader & parseInt('10000000', 2)) >>> 7, // Must be zero.
      nri = (nalUnitHeader & parseInt('01100000', 2)) >>> 5,
      nalType = (nalUnitHeader & parseInt('00011111', 2)) >>> 0;

    if (forbidden !== 0) {
      return;
    }

    if (nalType >= 1 && nalType <= 23) {
      // Standard NAL Unit
      return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x01]),
        message.subarray(payloadStartOffset)
      ]);
    } else if (nalType === 24) {
      return; // STAP-A ignore for now.
    } else if (nalType === 28) {
      // FU-A
      // eventually: check that we didn't drop pieces of the fragment.
      const fragmentHeader = message.readUInt8(payloadStartOffset + 1),
        start = (fragmentHeader & parseInt('10000000', 2)) >>> 7,
        // end = (fragmentHeader & parseInt('01000000', 2)) >>> 6,
        reserved = (fragmentHeader & parseInt('00100000', 2)) >>> 5;
      if (reserved !== 0) {
        return;
      }
      const fragmentNalType = (fragmentHeader & parseInt('00011111', 2)) >>> 0
      if (start === 1) {
        const reconstructedHeader =
          (forbidden << 7) | (nri << 5) | (fragmentNalType << 0)

        return Buffer.concat([
          Buffer.from([0x00, 0x00, 0x00, 0x01]),
          Buffer.from([reconstructedHeader]),
          message.subarray(payloadStartOffset + 2)
        ]);
      }
      return message.subarray(payloadStartOffset + 2);
    }
    return;
  }
}

class RingApiClient {

  constructor(adapter) {
    this.adapter = adapter;
    this.eventEmitter = new events.EventEmitter();
    this.ring = null;
    this.kind = {};
    this.ring = this.getRing();
  }

  // okay
  errorMessage(text, error) {
    if (Array.isArray(error)) {
      error.push(text);
      return error;
    } else {
      return [error, text];
    }
  }

  // okay
  setKind(id, kind) {
    this.kind[id] = kind;
  }

  // okay
  getKind(id) {
    return this.kind[id];
  }

  getSnapshotFilename(id) {
    let kind = this.getKind(id);
    let deviceId = kind + '_' + id;
    let snapshotfile = __dirname + '/../snapshot/' + deviceId + '.snapshot.jpg';
    return snapshotfile;
  }

  // okday
  getRing() {
    try {
      if (!this.ring) {
        this.ring = new RingApi({
          email: this.adapter.config.email,
          password: this.adapter.config.password,
          cameraStatusPollingSeconds: 20,
          cameraDingsPollingSeconds: 2
        });
      }
      this.adapter.log.debug('Ring: ' + JSON.stringify(this.ring));
      return this.ring;
    } catch (error) {
      // throw (this.errorMessage('Could not get ring instance in method getRing(). ', error));
      throw ('Could not get ring instance in method getRing(). ' + error);
    }
  }

  // okay
  async getLocations() {
    let locations;
    try {
      let ring = await this.getRing();
      locations = await ring.getLocations();
      // this.adapter.log.debug('Devices: ' + JSON.stringify(locations));
      return locations;
    } catch (error) {
      // throw (this.errorMessage('Could not get device instance in method getDevices(). ', error));
      throw ('Could not get device instance in method getDevices(). ' + error);
    }
  }

  // okay
  async getAllRingsDeviceObjects() {
    try {
      let alls = [];
      let ring = await this.getRing();
      let locations = await this.getLocations();
      for (let i in locations) {
        let location = locations[i];
        // let devices = await location.getDevices(); 
        // let cameras = await ring.getCameras();
        if (location.cameras) {
          for (let j in location.cameras) {
            let camera = location.cameras[j];
            if (camera && camera.isDoorbot) {
              this.setKind(camera.id, 'doorbell');
              alls.push(camera);
              this.adapter.log.debug('Doorbell: ' + JSON.stringify(camera.data));
            }
          }
        }
        if (location.devices) {
          for (let j in location.devices) {
            let device = location.devices[j];
            if (device && device.isDoorbot) {
              this.setKind(device.id, 'doorbell');
              alls.push(device);
              this.adapter.log.debug('Doorbell: ' + JSON.stringify(device.data));
            }
          }
        }
      }
      return alls;
    } catch (error) {
      throw ('Could not get all doorbell devices in getAllRingsDeviceObjects(). ' + error);
    }
  }

  // okay
  async getAllRingsDeviceObject(id) {
    try {
      let alls = await this.getAllRingsDeviceObjects();
      for (let i in alls) {
        if (alls[i].id == id) {
          this.adapter.log.debug('Doorbell for Id: ' + id + ' = ' + JSON.stringify(alls[i].data));
          return alls[i];
        }
      }
      return null;
    } catch (error) {
      throw ('Could not get Doorbell for ' + id + ' in getAllRingsDeviceObject(id). ' + error);
    }
  }

  async getAllRingsDevices() {
    try {
      let alls = await this.getAllRingsDeviceObjects();
      let datas = [];
      for (let i in alls) {
        datas.push(alls[i].data);
      }
      return datas;
    } catch (error) {
      throw ('Could not get Doorbell for ' + id + ' in getAllRingsDeviceObject(id). ' + error);
    }
  }

  async getAllRingsDevice(id) {
    try {
      let devices = await this.getAllRingsDevices();
      if (devices) {
        for (let i in devices) {
          let device = devices[i];
          if (device.id == id) {
            return device;
          }
        }
      }
      return null;
    } catch (error) {
      throw ('Could not get Doorbell for ' + id + ' in etAllRingsDevice(id). ' + error);
    }
  }

  async getLiveStream(id) {
    try {
      let doorbell = await this.getAllRingsDeviceObject(id);
      if (doorbell) {
        await doorbell.startVideoOnDemand();
        let stream = await doorbell.startVideoOnDemand();
        let sipSession = await doorbell.createSipSession();
        return SipSession;
      }
    } catch (error) {
      // throw (this.errorMessage('Could not get Livestram for ' + id + ' in getLiveStream(id). ', error));
      throw ('Could not get Livestram for ' + id + ' in getLiveStream(id). ' + error);
    }
  }


  async rtpServer() {
    const server = new RtspServer({
      serverPort: 11113,
      clientPort: 11112,
      rtpPortStart: 10000,
      rtpPortCount: 10000
    });

    try {
      await server.start();
    } catch (e) {
      this.adapter.log.error(e);
    }
  }


  async getLiveStreamRTP(id) {
    try {
      let doorbell = await this.getAllRingsDeviceObject(id);
      if (doorbell && !this.stream) {
        this.stream = 1;
        this.rtpServer();
        /*
        const app = express();
        app.use('/', express.static('/Users/thorsten.stueben/Downloads/public'));
        app.listen(3000, () => {
          this.adapter.log.info('listening on port 3000');
        });
        */
        let start = await doorbell.startVideoOnDemand();
        let sipSession = await doorbell.createSipSession();
        const OUTPUT_PATH = '/Users/thorsten.stueben/Downloads/public';
        // const OUTPUT_PATH = path.join('/','tmp', 'output');
        if (!fs.existsSync(OUTPUT_PATH)) {
          fs.mkdirSync(OUTPUT_PATH);
        }
        const ffmpegSocket = createSocket('udp4'),
          ffmpeg = spawn('ffmpeg', [
            '-i',
            'udp://0.0.0.0:11111',
            '-preset',
            'veryfast',
            '-g',
            '25',
            '-sc_threshold',
            '0',
            '-f',
            'hls',
            '-hls_time',
            '2',
            '-hls_list_size',
            '6',
            '-hls_flags',
            'delete_segments',
            path.join(OUTPUT_PATH, 'stream.m3u8')
          ]);
        /*
        ffmpeg = spawn('ffmpeg', [
          '-i',
          'udp://0.0.0.0:11111',
          '-c',
          'copy',
          '-flags',
          '+global_header',
          '-f',
          'segment',
          '-segment_time',
          '10',
          '-segment_format_options',
          'movflags=+faststart',
          '-reset_timestamps',
          '1',
          path.join(OUTPUT_PATH, 'part%d.mp4')
        ]);
        */

        ffmpeg.stderr.on('data', (data) => {
          this.adapter.log.error(`stderr: ${data}`);
        });
        ffmpeg.on('close', (code) => {
          this.adapter.log.error(`child process exited with code ${code}`);
        });
        const exitHandler = () => {
          ffmpeg.stderr.pause();
          ffmpeg.stdout.pause();
          ffmpeg.kill();
        };
        process.on('SIGINT', () => {
          exitHandler();
        });
        process.on('exit', () => {
          exitHandler();
        });

        const packetParser = new PacketParser();
        sipSession.videoStream.onRtpPacket.subscribe((rtpPacket) => {
          const decoded = packetParser.packetReceived(rtpPacket.message);
          // ffmpegSocket.send(rtpPacket.message, 11112);
          if (decoded) {
            let a = decoded;
            ffmpegSocket.send(decoded, 11111);
            // ffmpegSocket.send(decoded, 11113);
          }
        });

        const localPort = await bindToRandomPort(ffmpegSocket);

        sipSession.onCallEnded.subscribe(() => {
          this.adapter.log.info('Call has ended');
          exitHandler();
          // process.exit();
        });
        const rtpOptions = await sipSession.start();
        this.adapter.log.info('Call Started.  Remote RTP details:', rtpOptions);
        setTimeout(async () => {
          await sipSession.stop();
        }, 5 * 60 * 1000);
        return null;
      }
      this.adapter.log.debug('No LiveStream: ');
      return null;
    } catch (error) {
      // throw (this.errorMessage('Could not get Livestram for ' + id + ' in getLiveStream(id). ', error));
      throw ('Could not get Livestram for ' + id + ' in getLiveStream(id). ' + error);
    }
  }

  // okay
  async getSnapshot(id) {
    try {
      this.adapter.log.info('Making snapshot');
      this.adapter.log.debug('Snapshot ID: ' + JSON.stringify(id));
      let doorbell = await this.getAllRingsDeviceObject(id);
      let image = await doorbell.getSnapshot();
      // fs.writeFileSync(this.snapshotfile, image);
      // await this.adapter.writeFileAsync(this.adapter.namespace, 'tts.userfiles/test.jpg', image);
      return image;
    } catch (error) {
      // throw ('Could not get Snapshot for ' + id + ' in getSnapshot(). ' + error);
      return undefined;
    }

  }

  // okay
  async getHealthSummarie(id) {
    try {
      let doorbell = await this.getAllRingsDeviceObject(id);
      if (doorbell) {
        let health = await doorbell.getHealth();
        this.adapter.log.debug('Health: ' + JSON.stringify(health));
        return health;
      }
      this.adapter.log.debug('No Health Message');
      return null;
    } catch (error) {
      // throw (this.errorMessage('Could not get Health for ' + id + ' in getHealthSummarie(id). ' , error));
      throw ('Could not get Health for ' + id + ' in getHealthSummarie(id). ' + error);
    }
  }

  // okay
  async getHistory(id) {
    try {
      let histories = [];
      let doorbell = await this.getAllRingsDeviceObject(id);
      if (doorbell) {
        histories = await doorbell.getHistory(50);
      }
      return histories;
    } catch (error) {
      // throw (this.errorMessage('Could noch get Hisotry for ' + id + ' in getHistory(id).' , error));
      throw ('Could noch get Hisotry for ' + id + ' in getHistory(id).' + error);
    }
  }

  // okay
  async getLastVideos(id) {
    try {
      let videos = [];
      let doorbell = await this.getAllRingsDeviceObject(id);
      let locations = await this.getLocations();
      for (let i in locations) {
        let location = locations[i];
        let events = await location.getEvents(10);
        if (events && events.events) {
          for (let j in events.events) {
            let event = events.events[j];
            if (event.doorbot_id == id) {
              let video = await doorbell.getRecording(event.ding_id_str);
              this.adapter.log.debug('Video: ' + JSON.stringify(video));
              videos.push(video);
            }
          }
        }
      }
      return videos;
    } catch (error) {
      // throw (this.errorMessage('Could not get Last Video ' + id + ' in getLastVideos(id). ' , error));
      throw ('Could not get Last Video ' + id + ' in getLastVideos(id). ' + error);
    }
  }

  // okay
  async setLight(id, value) {
    try {
      let camera = await this.getAllRingsDeviceObject(id) || [];
      if (camera) {
        camera.setLight(value);
      }
    } catch (error) {
      throw ('Could not get Last Video ' + id + ' in etLight(id). ' + error);
    }
  }

  event(id, callback) {
    return (async (resolve, reject) => {
      try {
        let doorbell = await this.getAllRingsDeviceObject(id);
        doorbell.onData.subscribe((data) => {
          
          this.adapter.log.debug('Ding Dong for Id ' + id + JSON.stringify(data));
          callback && callback(data);
        });
      } catch (error) {
        // throw (this.errorMessage('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' , error));
        throw ('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' + error);
      }
    })();
  }

}

module.exports = {
  RingApiClient: RingApiClient
};