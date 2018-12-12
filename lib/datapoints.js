'use strict';

let health = {
    "battery_percentage_category": {
        type: 'string',
        role: 'level',
        name: 'Battery Category',
        read: true,
        write: false,
        unit: '%',
        def: 0
    },
    "wifi_name": {
        type: 'string',
        role: 'level',
        name: 'Wifi',
        read: true,
        write: false
    },
    "battery_percentage": {
        type: 'number',
        role: 'level',
        name: 'Battery',
        read: true,
        write: false,
        unit: '%',
        def: 0
    },
    "latest_signal_strength": {
        type: 'number',
        role: 'level',
        name: 'WLAN Signal',
        read: true,
        write: false,
        unit: 'RSSI',
        def: 0
    },
    "latest_signal_category": {
        type: 'string',
        role: 'level',
        name: 'WLAN Signal Category',
        read: true,
        write: false
    },
    "firmware": {
        type: 'string',
        role: 'level',
        name: 'Firmware',
        read: true,
        write: false
    }
}


function copyObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getHealts() {
    let healthObj = copyObject(health);
    for (let i in healthObj) {
        healthObj[i].id ? healthObj[i].id: i;
    }
    return getHealts;
}

function getHealt(id) {
    if (id && health[id]) {
        let healthObj = copyObject(health[id]);
        healthObj[i].id ? healthObj[i].id: id;
        return getHealts;
    }
    return null;
}
