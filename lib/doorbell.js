let RingAPI = require('doorbot');


class Doorbell {

    constructor(adapter) {
        this.adapter = adapter;
        this.ring = null;
        this.init();
    }


    init() {

        let timeoout = this.adapter.config.timeout || 10;

        this.ring = RingAPI({
            email: this.adapter.config.email || '',
            password: this.adapter.config.password || '',
            retries: 10, //authentication retries, optional, defaults to 0
            userAgent: 'My User Agent', //optional, defaults to @android:com.ringapp:2.0.67(423)
            api_version: 11, //optional in case you need to change it from the default of 9
            timeout: (timeoout * 60 * 1000) //Defaults to 5 minutes
        });

    }

    test() {
        
        if (this.ring) {

            let pollsec = this.adapter.config.pollsec || 1;

            this.ring.devices((e, devices) => {

                
                this.adapter.log.info(JSON.stringify(devices));
                //               this.ring.vod(devices.doorbots[0], (e, j) => {
                //               });

                this.ring.history((e, history) => {
                    this.adapter.log.info(e, history);
                    this.ring.recording(history[0].id, (e, recording) => {
                        this.adapter.log.info(recording);
                        const check = () => {
                            // this.adapter.log.info('Checking for ring activity..');
                            this.ring.dings((e, json) => {
                                if (json && json.length > 0) {
                                    this.adapter.log.info(json);
                                }
                            });
                        };
                        setInterval(check, pollsec * 1000);
                        check();
                    });
                });


                //floodlights are under the stickups_cams prop
                if (devices.hasOwnProperty('stickup_cams') &&
                    Array.isArray(devices.stickup_cams) &&
                    devices.stickup_cams.length > 0) {

                    this.ring.lightToggle(devices.stickup_cams[0], (e) => {
                        //Light state has been toggled
                    });
                }
            });

        }

    }

}

module.exports = Doorbell;