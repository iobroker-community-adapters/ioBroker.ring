const RingAPI = require('doorbot');
  
const ring = RingAPI({
    email: 'xxxxx',
    password: 'xxxxx',
    retries: 10, //authentication retries, optional, defaults to 0
    userAgent: 'My User Agent', //optional, defaults to @android:com.ringapp:2.0.67(423)
    api_version: 11, //optional in case you need to change it from the default of 9
    timeout: (10 * 60 * 1000) //Defaults to 5 minutes
});

ring.devices((e, devices) => {
    adapter.log.info(e, devices);

// ring.vod(devices, (e, j) => {
//});

    ring.history((e, history) => {
        adapter.log.info(e, history);
        ring.recording(history[0].id, (e, recording) => {
            adapter.log.info(e, recording);
            const check = () => {
                adapter.log.info('Checking for ring activity..');
                ring.dings((e, json) => {
                    adapter.log.info(e, json);
                });
            };
            setInterval(check, 1 * 1000);
            check();
        });
    });


    //floodlights are under the stickups_cams prop
    if (devices.hasOwnProperty('stickup_cams') &&
        Array.isArray(devices.stickup_cams) &&
        devices.stickup_cams.length > 0) {

        ring.lightToggle(devices.stickup_cams[0], (e) => {
            //Light state has been toggled
        });
    }
});
