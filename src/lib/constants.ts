export const COMMON_INFO_ID: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "state",
    name: "Device ID",
    read: true,
    write: false,
}
export const COMMON_INFO_DESCRIPTION: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "text",
    name: "Device Name",
    read: true,
    write: false
}
export const COMMON_INFO_EXTERNAL_CONNECTION: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "state",
    name: "External Power",
    read: true,
    write: false
}
export const COMMON_INFO_KIND: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "text",
    name: "Product",
    read: true,
    write: false
}
export const COMMON_INFO_BATTERY_PERCENTAGE: Partial<ioBroker.StateCommon> = {
    type: "number",
    role: "value.battery",
    name: "Battery",
    read: true,
    write: false,
    unit: "%",
    def: 0
}
export const COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "state",
    name: "Battery Category",
    read: true,
    write: false
}
export const COMMON_INFO_WIFI_NAME: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "text",
    name: "Wifi",
    read: true,
    write: false
}
export const COMMON_INFO_LATEST_SIGNAL_STRENGTH: Partial<ioBroker.StateCommon> = {
    type: "number",
    role: "value",
    name: "WLAN Signal",
    read: true,
    write: false,
    unit: "RSSI",
    def: 0
}
export const COMMON_INFO_LATEST_SIGNAL_CATEGORY: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "state",
    name: "WLAN Signal Category",
    read: true,
    write: false
}
export const COMMON_INFO_FIRMWARE: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "text",
    name: "Firmware",
    read: true,
    write: false
}
export const COMMON_INFO_HAS_LIGHT: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "state",
    name: "Has Light",
    read: true,
    write: false
}
export const COMMON_INFO_HAS_BATTERY: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "state",
    name: "Has Battery",
    read: true,
    write: false
}
export const COMMON_INFO_HAS_SIREN: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "state",
    name: "Has Siren",
    read: true,
    write: false
}
export const COMMON_LIGHT_SWITCH: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "switch",
    name: "Set Floodlight",
    read: false,
    write: true
}
export const COMMON_LIGHT_STATE: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "state",
    name: "Floodlight State",
    read: true,
    write: false
}


export const COMMON_HISTORY_URL: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "url",
    name: "History URL",
    read: true,
    write: false
}
export const COMMON_HISTORY_CREATED_AT: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "value.time",
    name: "Created at",
    read: true,
    write: false
}
export const COMMON_HISTORY_KIND: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "state",
    name: "Kind",
    read: true,
    write: false
}
export const COMMON_SNAPSHOT_URL: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "url",
    name: "Snapshot URL",
    read: true,
    write: false
}
export const COMMON_SNAPSHOT_FILE: Partial<ioBroker.StateCommon> = {
    type: "string",
    role: "url",
    name: "Snapshot file",
    read: true,
    write: false
}
export const COMMON_SNAPSHOT_REQUEST: Partial<ioBroker.StateCommon> = {
    type: "boolean",
    role: "button",
    name: "New Snapshot Request",
    read: false,
    write: true
}
export const COMMON_SNAPSHOT_SNAPSHOT: Partial<ioBroker.StateCommon> = {
    type: "file",
    role: "file",
    name: "The current snapshot",
    read: true,
    write: true
}
export const CHANNEL_NAME_INFO = "Info";
export const CHANNEL_NAME_HISTORY = "History";
export const CHANNEL_NAME_LIGHT = "Light";
export const CHANNEL_NAME_SNAPSHOT = "Snapshot";


export const STATE_ID_LIGHT_SWITCH = "light_switch";
export const STATE_ID_SNAPSHOT_REQUEST = "snapshot_request";
