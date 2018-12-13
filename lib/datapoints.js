'use strict';

let info = {
    "id": {
        type: 'number',
        role: 'level',
        name: 'Device ID',
        read: true,
        write: false,
    },
    "description": {
        type: 'string',
        role: 'level',
        name: 'Device Name',
        read: true,
        write: false
    },
    "external_connection": {
        type: 'boolean',
        role: 'level',
        name: 'External Power',
        read: true,
        write: false
    },
    "kind": {
        type: 'string',
        role: 'level',
        name: 'Product',
        read: true,
        write: false
    }
}

let health = {
    "battery_percentage": {
        type: 'number',
        role: 'level',
        name: 'Battery',
        read: true,
        write: false,
        unit: '%',
        def: 0
    },
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

let livestream = {
    "snapshot_url": {
        type: 'string',
        role: 'level',
        name: 'Snapshot URL',
        read: true,
        write: false
    },
    "kind": {
        type: 'string',
        role: 'level',
        name: 'Kinde',
        read: true,
        write: false
    },
    "sip_server_ip": {
        type: 'string',
        role: 'level',
        name: 'SIP Server IP',
        read: true,
        write: false
    },
    "sip_server_port": {
        type: 'number',
        role: 'level',
        name: 'SIP Server Port',
        read: true,
        write: false
    },
    "sip_server_tls": {
        type: 'boolean',
        role: 'level',
        name: 'SIP Server TLS',
        read: true,
        write: false
    },
    "sip_session_id": {
        type: 'string',
        role: 'level',
        name: 'SIP Server Session ID',
        read: true,
        write: false
    },
    "sip_from": {
        type: 'string',
        role: 'level',
        name: 'SIP Server From',
        read: true,
        write: false
    },
    "sip_to": {
        type: 'string',
        role: 'level',
        name: 'SIP Server To',
        read: true,
        write: false
    },
    "expires_in": {
        type: 'number',
        role: 'level',
        name: 'Expire',
        read: true,
        write: false
    },
    "sip_token": {
        type: 'string',
        role: 'level',
        name: 'SIP Token',
        read: true,
        write: false
    },
    'livestreamrequest': {
        type: 'boolean',
        role: 'button',
        name: 'New Livestream Request',
        read: false,
        write: true
    },

}


let dingdong = {
    "snapshot_url": {
        type: 'string',
        role: 'level',
        name: 'Snapshot URL',
        read: true,
        write: false
    },
    "kind": {
        type: 'string',
        role: 'level',
        name: 'Kinde',
        read: true,
        write: false
    },
    "sip_server_ip": {
        type: 'string',
        role: 'level',
        name: 'SIP Server IP',
        read: true,
        write: false
    },
    "sip_server_port": {
        type: 'number',
        role: 'level',
        name: 'SIP Server Port',
        read: true,
        write: false
    },
    "sip_server_tls": {
        type: 'boolean',
        role: 'level',
        name: 'SIP Server TLS',
        read: true,
        write: false
    },
    "sip_session_id": {
        type: 'string',
        role: 'level',
        name: 'SIP Server Session ID',
        read: true,
        write: false
    },
    "sip_from": {
        type: 'string',
        role: 'level',
        name: 'SIP Server From',
        read: true,
        write: false
    },
    "sip_to": {
        type: 'string',
        role: 'level',
        name: 'SIP Server To',
        read: true,
        write: false
    },
    "expires_in": {
        type: 'number',
        role: 'level',
        name: 'Expire',
        read: true,
        write: false
    },
    "sip_token": {
        type: 'string',
        role: 'level',
        name: 'SIP Token',
        read: true,
        write: false
    },
}


let all = {
    "info": info,
    "livestream": livestream,
    "health": health,
    "dingdong": dingdong
}

function copyObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getAll() {
    return all;
}

// getObjectByName("dingdong")
function getObjectByName(name) {
    return all[name] || null;
}

// getObjectByName("dingdong", "sip_token") 
function getObjectById(name, id) {
    let obj = getObjectByName(name);
    if (obj) {
        return obj[id] || null;
    }
    return null;
}


function getHealts() {
    let healthObj = copyObject(health);
    for (let i in healthObj) {
        healthObj[i].id ? healthObj[i].id : i;
    }
    return getHealts;
}

function getHealt(id) {
    if (id && health[id]) {
        let healthObj = copyObject(health[id]);
        healthObj[i].id ? healthObj[i].id : id;
        return getHealts;
    }
    return null;
}


module.exports = {
    getAll: getAll,
    getObjectByName: getObjectByName,
    getObjectById: getObjectById
};
