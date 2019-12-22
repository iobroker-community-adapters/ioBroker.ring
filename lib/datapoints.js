'use strict';

let info = {
  'id': {
    type: 'number',
    role: 'state',
    name: 'Device ID',
    read: true,
    write: false,
  },
  'description': {
    type: 'string',
    role: 'text',
    name: 'Device Name',
    read: true,
    write: false
  },
  'external_connection': {
    type: 'boolean',
    role: 'state',
    name: 'External Power',
    read: true,
    write: false
  },
  'kind': {
    type: 'string',
    role: 'text',
    name: 'Product',
    read: true,
    write: false
  }
};

let health = {
  'battery_percentage': {
    type: 'number',
    role: 'value.battery',
    name: 'Battery',
    read: true,
    write: false,
    unit: '%',
    def: 0
  },
  'battery_percentage_category': {
    type: 'string',
    role: 'state',
    name: 'Battery Category',
    read: true,
    write: false
  },
  'wifi_name': {
    type: 'string',
    role: 'text',
    name: 'Wifi',
    read: true,
    write: false
  },
  'latest_signal_strength': {
    type: 'number',
    role: 'value',
    name: 'WLAN Signal',
    read: true,
    write: false,
    unit: 'RSSI',
    def: 0
  },
  'latest_signal_category': {
    type: 'string',
    role: 'state',
    name: 'WLAN Signal Category',
    read: true,
    write: false
  },
  'firmware': {
    type: 'string',
    role: 'text',
    name: 'Firmware',
    read: true,
    write: false
  }
};

let livestream = {
  'snapshot_url': {
    type: 'string',
    role: 'url',
    name: 'Snapshot URL',
    read: true,
    write: false
  },
  'kind': {
    type: 'string',
    role: 'state',
    name: 'Kind',
    read: true,
    write: false
  },
  'sip_server_ip': {
    type: 'string',
    role: 'info.ip',
    name: 'SIP Server IP',
    read: true,
    write: false
  },
  'sip_server_port': {
    type: 'number',
    role: 'info.port',
    name: 'SIP Server Port',
    read: true,
    write: false
  },
  'sip_server_tls': {
    type: 'boolean',
    role: 'state',
    name: 'SIP Server TLS',
    read: true,
    write: false
  },
  'sip_session_id': {
    type: 'string',
    role: 'state',
    name: 'SIP Server Session ID',
    read: true,
    write: false
  },
  'sip_from': {
    type: 'string',
    role: 'text',
    name: 'SIP Server From',
    read: true,
    write: false
  },
  'sip_to': {
    type: 'string',
    role: 'text',
    name: 'SIP Server To',
    read: true,
    write: false
  },
  'expires_in': {
    type: 'number',
    role: 'value',
    name: 'Expire',
    read: true,
    write: false,
    unit: 'sec'
  },
  'created_at': {
    type: 'string',
    role: 'value.time',
    name: 'Created at',
    read: true,
    write: false
  },
  'sip_token': {
    type: 'string',
    role: 'text',
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

};

let dingdong = {
  'livestream': {
    type: 'meta',
    role: 'meta.user',
    name: 'Livestream File',
    read: true,
    write: false
  },
  'livestream_url': {
    type: 'string',
    role: 'url',
    name: 'Livestream URL',
    read: true,
    write: false
  },
  'livestream_file': {
    type: 'string',
    role: 'url',
    name: 'Livestream file',
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
  'snapshot': {
    type: 'meta',
    role: 'meta.user',
    name: 'Snapshot File',
    read: true,
    write: false
  },
  'snapshot_url': {
    type: 'string',
    role: 'url',
    name: 'Snapshot URL',
    read: true,
    write: false
  },
  'snapshot_file': {
    type: 'string',
    role: 'url',
    name: 'Snapshot file',
    read: true,
    write: false
  },
  'snapshotrequest': {
    type: 'boolean',
    role: 'button',
    name: 'New Snapshot Request',
    read: false,
    write: true
  },
  'state': {
    type: 'string',
    role: 'state',
    name: 'Status',
    read: true,
    write: false
  },
  'kind': {
    type: 'string',
    role: 'state',
    name: 'Kind',
    read: true,
    write: false
  },
  'sip_server_ip': {
    type: 'string',
    role: 'info.ip',
    name: 'SIP Server IP',
    read: true,
    write: false
  },
  'sip_server_port': {
    type: 'number',
    role: 'info.port',
    name: 'SIP Server Port',
    read: true,
    write: false
  },
  'sip_server_tls': {
    type: 'boolean',
    role: 'state',
    name: 'SIP Server TLS',
    read: true,
    write: false
  },
  'sip_session_id': {
    type: 'string',
    role: 'state',
    name: 'SIP Server Session ID',
    read: true,
    write: false
  },
  'sip_from': {
    type: 'string',
    role: 'text',
    name: 'SIP Server From',
    read: true,
    write: false
  },
  'sip_to': {
    type: 'string',
    role: 'text',
    name: 'SIP Server To',
    read: true,
    write: false
  },
  'expires_in': {
    type: 'number',
    role: 'value',
    name: 'Expire',
    read: true,
    write: false,
    unit: 'sec'
  },
  'created_at': {
    type: 'string',
    role: 'value.time',
    name: 'Created at',
    read: true,
    write: false
  },
  /*
  'sip_token': {
    type: 'string',
    role: 'text',
    name: 'SIP Token',
    read: true,
    write: false
  },
  */
  'light': {
    type: 'boolean',
    role: 'state',
    name: 'Light on',
    read: true,
    write: true
  }
};

let history = {
  'history_url': {
    type: 'string',
    role: 'url',
    name: 'History URL',
    read: true,
    write: false
  },
  'created_at': {
    type: 'string',
    role: 'value.time',
    name: 'Created at',
    read: true,
    write: false
  },
  'kind': {
    type: 'string',
    role: 'state',
    name: 'Kind',
    read: true,
    write: false
  },
  'snapshot_url': {
    type: 'string',
    role: 'url',
    name: 'Snapshot URL',
    read: true,
    write: false
  }
};

let all = {
  'info': info,
  'livestream': livestream,
  'health': health,
  'dingdong': dingdong,
  'history': history
};

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getAll() {
  let all = copyObject(dingdong);
  all.Info = Object.assign(info, health);
  // all.Livestream = livestream;
  all.History = history;
  return all;
}

// getObjectByName('dingdong')
function getObjectByName(name) {
  return all[name] || null;
}

// getObjectByName('dingdong', 'sip_token') 
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


module.exports = {
  getAll: getAll,
  getObjectByName: getObjectByName,
  getObjectById: getObjectById
};
