"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATE_ID_LIGHT_SWITCH = exports.CHANNEL_NAME_HISTORY = exports.CHANNEL_NAME_LIGHT = exports.CHANNEL_NAME_INFO = exports.COMMON_HISTORY_KIND = exports.COMMON_HISTORY_CREATED_AT = exports.COMMON_HISTORY_URL = exports.COMMON_LIGHT_STATE = exports.COMMON_LIGHT_SWITCH = exports.COMMON_INFO_HAS_SIREN = exports.COMMON_INFO_HAS_BATTERY = exports.COMMON_INFO_HAS_LIGHT = exports.COMMON_INFO_FIRMWARE = exports.COMMON_INFO_LATEST_SIGNAL_CATEGORY = exports.COMMON_INFO_LATEST_SIGNAL_STRENGTH = exports.COMMON_INFO_WIFI_NAME = exports.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY = exports.COMMON_INFO_BATTERY_PERCENTAGE = exports.COMMON_INFO_KIND = exports.COMMON_INFO_EXTERNAL_CONNECTION = exports.COMMON_INFO_DESCRIPTION = exports.COMMON_INFO_ID = void 0;
exports.COMMON_INFO_ID = {
    type: "number",
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
    write: false
};
exports.COMMON_INFO_EXTERNAL_CONNECTION = {
    type: "boolean",
    role: "state",
    name: "External Power",
    read: true,
    write: false
};
exports.COMMON_INFO_KIND = {
    type: "string",
    role: "text",
    name: "Product",
    read: true,
    write: false
};
exports.COMMON_INFO_BATTERY_PERCENTAGE = {
    type: "number",
    role: "value.battery",
    name: "Battery",
    read: true,
    write: false,
    unit: "%",
    def: 0
};
exports.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY = {
    type: "string",
    role: "state",
    name: "Battery Category",
    read: true,
    write: false
};
exports.COMMON_INFO_WIFI_NAME = {
    type: "string",
    role: "text",
    name: "Wifi",
    read: true,
    write: false
};
exports.COMMON_INFO_LATEST_SIGNAL_STRENGTH = {
    type: "number",
    role: "value",
    name: "WLAN Signal",
    read: true,
    write: false,
    unit: "RSSI",
    def: 0
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
exports.CHANNEL_NAME_INFO = "Info";
exports.CHANNEL_NAME_LIGHT = "Light";
exports.CHANNEL_NAME_HISTORY = "History";
exports.STATE_ID_LIGHT_SWITCH = "light_switch";
//# sourceMappingURL=constants.js.map