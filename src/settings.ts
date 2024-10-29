export const PLATFORM_NAME = 'YaleLock';
export const PLUGIN_NAME = '@sbs44/homebridge-yale-lock';

export interface SeamLockDevice {
  device_id: string;
  device_type: string;
  properties: {
    name: string;
    locked: boolean;
    online: boolean;
    battery_level: number;
    door_open?: boolean;
  };
}

export interface SeamLockRequest {
  device_id: string;
  sync?: boolean;
}

export interface SeamError extends Error {
  code?: string;
  status?: number;
}