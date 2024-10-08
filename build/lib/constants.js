"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNEL_NAME_INFO = exports.COMMON_LOCATIONMODE = exports.COMMON_OLD_TOKEN = exports.COMMON_NEW_TOKEN = exports.COMMON_INTERCOM_UNLOCK_REQUEST = exports.COMMON_DEBUG_REQUEST = exports.COMMON_EVENTS_MOMENT = exports.COMMON_EVENTS_MESSAGE = exports.COMMON_EVENTS_DETECTIONTYPE = exports.COMMON_EVENTS_TYPE = exports.COMMON_EVENTS_INTERCOM_DING = exports.COMMON_EVENTS_DOORBELL = exports.COMMON_ON_DEMAND = exports.COMMON_MOTION = exports.COMMON_LIVESTREAM_FILE = exports.COMMON_LIVESTREAM_URL = exports.COMMON_LIVESTREAM_DURATION = exports.COMMON_LIVESTREAM_AUTO = exports.COMMON_LIVESTREAM_REQUEST = exports.COMMON_LIVESTREAM_MOMENT = exports.COMMON_HDSNAPSHOT_MOMENT = exports.COMMON_HDSNAPSHOT_AUTO = exports.COMMON_HDSNAPSHOT_REQUEST = exports.COMMON_HDSNAPSHOT_FILE = exports.COMMON_HDSNAPSHOT_URL = exports.COMMON_SNAPSHOT_MOMENT = exports.COMMON_SNAPSHOT_AUTO = exports.COMMON_SNAPSHOT_REQUEST = exports.COMMON_SNAPSHOT_FILE = exports.COMMON_SNAPSHOT_URL = exports.COMMON_HISTORY_KIND = exports.COMMON_HISTORY_CREATED_AT = exports.COMMON_HISTORY_URL = exports.COMMON_SIREN_SWITCH = exports.COMMON_LIGHT_STATE = exports.COMMON_LIGHT_SWITCH = exports.COMMON_INFO_HAS_SIREN = exports.COMMON_INFO_HAS_BATTERY = exports.COMMON_INFO_HAS_LIGHT = exports.COMMON_INFO_FIRMWARE = exports.COMMON_INFO_LATEST_SIGNAL_CATEGORY = exports.COMMON_INFO_LATEST_SIGNAL_STRENGTH = exports.COMMON_INFO_WIFI_NAME = exports.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY = exports.COMMON_INFO_BATTERY_PERCENTAGE = exports.COMMON_INFO_KIND = exports.COMMON_INFO_EXTERNAL_CONNECTION = exports.COMMON_INFO_DESCRIPTION = exports.COMMON_INFO_ID = exports.LOCATION_MODE_OPTIONS = void 0;
exports.STATE_ID_LOCATIONMODE = exports.STATE_ID_INTERCOM_UNLOCK = exports.STATE_ID_DEBUG_REQUEST = exports.STATE_ID_LIVESTREAM_DURATION = exports.STATE_ID_LIVESTREAM_REQUEST = exports.STATE_ID_HDSNAPSHOT_REQUEST = exports.STATE_ID_SNAPSHOT_REQUEST = exports.STATE_ID_LIGHT_SWITCH = exports.STATE_ID_SIREN_SWITCH = exports.CHANNEL_NAME_SIREN = exports.CHANNEL_NAME_EVENTS = exports.CHANNEL_NAME_LIVESTREAM = exports.CHANNEL_NAME_HDSNAPSHOT = exports.CHANNEL_NAME_SNAPSHOT = exports.CHANNEL_NAME_LIGHT = exports.CHANNEL_NAME_HISTORY = void 0;
exports.LOCATION_MODE_OPTIONS = ["home", "away", "disarmed", "disabled", "unset"];
exports.COMMON_INFO_ID = {
    type: "string",
    role: "state",
    name: "Device ID",
    read: true,
    write: false,
};
exports.COMMON_INFO_DESCRIPTION = {
    type: "string",
    role: "text",
    name: "Device Name",
    read: true,
    write: false,
};
exports.COMMON_INFO_EXTERNAL_CONNECTION = {
    type: "boolean",
    role: "state",
    name: "External Power",
    read: true,
    write: false,
};
exports.COMMON_INFO_KIND = {
    type: "string",
    role: "text",
    name: "Product",
    read: true,
    write: false,
};
exports.COMMON_INFO_BATTERY_PERCENTAGE = {
    type: "number",
    role: "value.battery",
    name: "Battery",
    read: true,
    write: false,
    unit: "%",
};
exports.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY = {
    type: "string",
    role: "state",
    name: "Battery Category",
    read: true,
    write: false,
};
exports.COMMON_INFO_WIFI_NAME = {
    type: "string",
    role: "text",
    name: "Wifi",
    read: true,
    write: false,
};
exports.COMMON_INFO_LATEST_SIGNAL_STRENGTH = {
    type: "number",
    role: "value",
    name: "WLAN Signal",
    read: true,
    write: false,
    unit: "RSSI"
};
exports.COMMON_INFO_LATEST_SIGNAL_CATEGORY = {
    type: "string",
    role: "state",
    name: "WLAN Signal Category",
    read: true,
    write: false
};
exports.COMMON_INFO_FIRMWARE = {
    type: "string",
    role: "text",
    name: "Firmware",
    read: true,
    write: false
};
exports.COMMON_INFO_HAS_LIGHT = {
    type: "boolean",
    role: "state",
    name: "Has Light",
    read: true,
    write: false
};
exports.COMMON_INFO_HAS_BATTERY = {
    type: "boolean",
    role: "state",
    name: "Has Battery",
    read: true,
    write: false
};
exports.COMMON_INFO_HAS_SIREN = {
    type: "boolean",
    role: "state",
    name: "Has Siren",
    read: true,
    write: false
};
exports.COMMON_LIGHT_SWITCH = {
    type: "boolean",
    role: "switch",
    name: "Set Floodlight",
    read: false,
    write: true
};
exports.COMMON_LIGHT_STATE = {
    type: "boolean",
    role: "state",
    name: "Floodlight State",
    read: true,
    write: false
};
exports.COMMON_SIREN_SWITCH = {
    type: "boolean",
    role: "switch",
    name: "Control the siren",
    read: true,
    write: true,
    desc: "Activate or deactivate the camera's siren",
};
exports.COMMON_HISTORY_URL = {
    type: "string",
    role: "url",
    name: "History URL",
    read: true,
    write: false
};
exports.COMMON_HISTORY_CREATED_AT = {
    type: "string",
    role: "value.time",
    name: "Created at",
    read: true,
    write: false
};
exports.COMMON_HISTORY_KIND = {
    type: "string",
    role: "state",
    name: "Kind",
    read: true,
    write: false
};
exports.COMMON_SNAPSHOT_URL = {
    type: "string",
    role: "url",
    name: "Snapshot URL",
    read: true,
    write: false
};
exports.COMMON_SNAPSHOT_FILE = {
    type: "string",
    role: "url",
    name: "Snapshot file",
    read: true,
    write: false
};
exports.COMMON_SNAPSHOT_REQUEST = {
    type: "boolean",
    role: "button",
    name: "New Snapshot Request",
    read: false,
    write: true
};
exports.COMMON_SNAPSHOT_AUTO = {
    type: "boolean",
    role: "value",
    name: "Snapshot auto?",
    read: false,
    write: false
};
exports.COMMON_SNAPSHOT_MOMENT = {
    type: "number",
    role: "date",
    name: "The moment of the snapshot",
    read: true,
    write: false
};
exports.COMMON_HDSNAPSHOT_URL = {
    type: "string",
    role: "url",
    name: "HD Snapshot URL",
    read: true,
    write: false
};
exports.COMMON_HDSNAPSHOT_FILE = {
    type: "string",
    role: "url",
    name: "HD Snapshot file",
    read: true,
    write: false
};
exports.COMMON_HDSNAPSHOT_REQUEST = {
    type: "boolean",
    role: "button",
    name: "New HD Snapshot Request",
    read: false,
    write: true
};
exports.COMMON_HDSNAPSHOT_AUTO = {
    type: "boolean",
    role: "value",
    name: "HD Snapshot auto?",
    read: false,
    write: false
};
exports.COMMON_HDSNAPSHOT_MOMENT = {
    type: "number",
    role: "date",
    name: "The moment of the HD snapshot",
    read: true,
    write: false
};
exports.COMMON_LIVESTREAM_MOMENT = {
    type: "number",
    role: "date",
    name: "The moment of the livestream",
    read: true,
    write: false
};
exports.COMMON_LIVESTREAM_REQUEST = {
    type: "boolean",
    role: "button",
    name: "New Livestream Request",
    read: false,
    write: true
};
exports.COMMON_LIVESTREAM_AUTO = {
    type: "boolean",
    role: "value",
    name: "Automatically start Livestream on event?",
    read: false,
    write: false
};
exports.COMMON_LIVESTREAM_DURATION = {
    type: "number",
    role: "value",
    name: "Set duration of Livestream",
    read: false,
    write: true
};
exports.COMMON_LIVESTREAM_URL = {
    type: "string",
    role: "text.url",
    name: "Livestream URL",
    read: true,
    write: false
};
exports.COMMON_LIVESTREAM_FILE = {
    type: "string",
    role: "url",
    name: "Livestream file",
    read: true,
    write: false
};
exports.COMMON_MOTION = {
    type: "boolean",
    role: "sensor.motion",
    name: "If there is a Motion Event",
    read: true,
    write: false
};
exports.COMMON_ON_DEMAND = {
    type: "boolean",
    role: "sensor.on_demand",
    name: "If there is an On Demand Event",
    read: true,
    write: false
};
exports.COMMON_EVENTS_DOORBELL = {
    type: "boolean",
    role: "sensor.door",
    name: "If there is a Doorbell Press Event",
    read: true,
    write: false
};
exports.COMMON_EVENTS_INTERCOM_DING = {
    type: "boolean",
    role: "sensor.door",
    name: "If there is a Ding event on Intercom",
    read: true,
    write: false
};
exports.COMMON_EVENTS_TYPE = {
    type: "string",
    role: "text",
    name: "The Kind of the Ding Event",
    read: true,
    write: false
};
exports.COMMON_EVENTS_DETECTIONTYPE = {
    type: "string",
    role: "text",
    name: "The detection type of the Ding Event",
    read: true,
    write: false
};
exports.COMMON_EVENTS_MESSAGE = {
    type: "string",
    role: "text",
    name: "The Notification message",
    read: true,
    write: false
};
exports.COMMON_EVENTS_MOMENT = {
    type: "number",
    role: "date",
    name: "The moment the ding event occured",
    read: true,
    write: false
};
exports.COMMON_DEBUG_REQUEST = {
    type: "boolean",
    role: "button",
    name: "Request Debug Output",
    read: false,
    write: true
};
exports.COMMON_INTERCOM_UNLOCK_REQUEST = {
    type: "boolean",
    role: "button",
    name: "Request Intercom door unlock",
    read: false,
    write: true
};
exports.COMMON_NEW_TOKEN = {
    type: "string",
    role: "text",
    name: "Next Refresh Token",
    read: true,
    write: false
};
exports.COMMON_OLD_TOKEN = {
    type: "string",
    role: "text",
    name: "Outdated user token",
    read: true,
    write: false
};
exports.COMMON_LOCATIONMODE = {
    type: "string",
    role: "text",
    name: "Location Mode",
    read: true,
    write: true,
    states: exports.LOCATION_MODE_OPTIONS
};
exports.CHANNEL_NAME_INFO = "Info";
exports.CHANNEL_NAME_HISTORY = "History";
exports.CHANNEL_NAME_LIGHT = "Light";
exports.CHANNEL_NAME_SNAPSHOT = "Snapshot";
exports.CHANNEL_NAME_HDSNAPSHOT = "HD Snapshot";
exports.CHANNEL_NAME_LIVESTREAM = "Livestream";
exports.CHANNEL_NAME_EVENTS = "Events";
exports.CHANNEL_NAME_SIREN = "Siren";
exports.STATE_ID_SIREN_SWITCH = "siren_switch";
exports.STATE_ID_LIGHT_SWITCH = "light_switch";
exports.STATE_ID_SNAPSHOT_REQUEST = "request";
exports.STATE_ID_HDSNAPSHOT_REQUEST = "request";
exports.STATE_ID_LIVESTREAM_REQUEST = "request";
exports.STATE_ID_LIVESTREAM_DURATION = "duration";
exports.STATE_ID_DEBUG_REQUEST = "debug_request";
exports.STATE_ID_INTERCOM_UNLOCK = "intercom_unlock_request";
exports.STATE_ID_LOCATIONMODE = "locationMode";
//# sourceMappingURL=constants.js.map