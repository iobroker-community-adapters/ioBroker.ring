export const LOCATION_MODE_OPTIONS = ["home", "away", "disarmed", "disabled", "unset"];

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
  unit: "%"
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
  unit: "RSSI"
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
export const COMMON_SNAPSHOT_SNAPSHOT: ioBroker.StateCommon = {
  type: "file",
  role: "file",
  name: "The current snapshot image",
  read: true,
  write: true
}
export const COMMON_SNAPSHOT_MOMENT: ioBroker.StateCommon = {
  type: "number",
  role: "date",
  name: "The moment of the snapshot",
  read: true,
  write: false
}
export const COMMON_LIVESTREAM_LIVESTREAM: ioBroker.StateCommon = {
  type: "file",
  role: "file",
  name: "The current Livestream Video",
  read: true,
  write: true
}
export const COMMON_LIVESTREAM_MOMENT: ioBroker.StateCommon = {
  type: "number",
  role: "date",
  name: "The moment of the livestream",
  read: true,
  write: false
}
export const COMMON_LIVESTREAM_REQUEST: Partial<ioBroker.StateCommon> = {
  type: "boolean",
  role: "button",
  name: "New Livestream Request",
  read: false,
  write: true
}
export const COMMON_LIVESTREAM_DURATION: Partial<ioBroker.StateCommon> = {
  type: "number",
  role: "value",
  name: "Set duration of Livestream",
  read: false,
  write: true
};
export const COMMON_LIVESTREAM_URL: Partial<ioBroker.StateCommon> = {
  type: "string",
  role: "text.url",
  name: "Livestream URL",
  read: true,
  write: false
}
export const COMMON_LIVESTREAM_FILE: Partial<ioBroker.StateCommon> = {
  type: "string",
  role: "url",
  name: "Livestream file",
  read: true,
  write: false
}
export const COMMON_LIVESTREAM_100MS_FILE: Partial<ioBroker.StateCommon> = {
  type: "string",
  role: "url",
  name: "100 ms Second Livestream file",
  read: true,
  write: false
}
export const COMMON_MOTION: ioBroker.StateCommon = {
  type: "boolean",
  role: "sensor.motion",
  name: "If there is a Motion Event",
  read: true,
  write: false
}
export const COMMON_EVENTS_DOORBELL: ioBroker.StateCommon = {
  type: "boolean",
  role: "sensor.door",
  name: "If there is a Doorbell Press Event",
  read: true,
  write: false
}
export const COMMON_EVENTS_INTERCOM_DING: ioBroker.StateCommon = {
  type: "boolean",
  role: "sensor.door",
  name: "If there is a Ding event on Intercom",
  read: true,
  write: false
}
export const COMMON_EVENTS_TYPE: ioBroker.StateCommon = {
  type: "string",
  role: "text",
  name: "The Kind of the Ding Event",
  read: true,
  write: false
}
export const COMMON_EVENTS_DETECTIONTYPE: ioBroker.StateCommon = {
  type: "string",
  role: "text",
  name: "The detection type of the Ding Event",
  read: true,
  write: false
}
export const COMMON_EVENTS_MESSAGE: ioBroker.StateCommon = {
  type: "string",
  role: "text",
  name: "The Notification message",
  read: true,
  write: false
}
export const COMMON_EVENTS_MOMENT: ioBroker.StateCommon = {
  type: "number",
  role: "date",
  name: "The moment the ding event occured",
  read: true,
  write: false
}
export const COMMON_DEBUG_REQUEST: ioBroker.StateCommon = {
  type: "boolean",
  role: "button",
  name: "Request Debug Output",
  read: false,
  write: true
}
export const COMMON_INTERCOM_UNLOCK_REQUEST: ioBroker.StateCommon = {
  type: "boolean",
  role: "button",
  name: "Request Intercom door unlock",
  read: false,
  write: true
}
export const COMMON_NEW_TOKEN: ioBroker.StateCommon = {
  type: "string",
  role: "text",
  name: "Next Refresh Token",
  read: true,
  write: false
}
export const COMMON_OLD_TOKEN: ioBroker.StateCommon = {
  type: "string",
  role: "text",
  name: "Outdated user token",
  read: true,
  write: false
}
export const COMMON_LOCATIONMODE: ioBroker.StateCommon = {
  type: "string",
  role: "text",
  name: "Location Mode",
  read: true,
  write: true,
  states: LOCATION_MODE_OPTIONS
}
export const CHANNEL_NAME_INFO = "Info";
export const CHANNEL_NAME_HISTORY = "History";
export const CHANNEL_NAME_LIGHT = "Light";
export const CHANNEL_NAME_SNAPSHOT = "Snapshot";
export const CHANNEL_NAME_LIVESTREAM = "Livestream";
export const CHANNEL_NAME_EVENTS = "Events";

export const STATE_ID_LIGHT_SWITCH = "light_switch";
export const STATE_ID_SNAPSHOT_REQUEST = "snapshot_request";
export const STATE_ID_LIVESTREAM_REQUEST = "livestream_request";
export const STATE_ID_LIVESTREAM_DURATION = "livestream_duration";
export const STATE_ID_DEBUG_REQUEST = "debug_request";
export const STATE_ID_INTERCOM_UNLOCK = "intercom_unlock_request";
export const STATE_ID_LOCATIONMODE = "locationMode";
