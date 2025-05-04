import { z } from "zod";

// Expected parameters by the search JSON API
export const ShareRequest = z.object({
  content: z.string().nonempty(),
});

// `.infer` gives the resulting type (after validation), where `.input` would give the input
// (expected) type, so the next line doesn't show to optional nature of the language field
// export type ShareRequest = z.infer<typeof ShareRequest>;
// or: (smaller tooltip when hovering the interface than the type)
// export interface SearchSchema extends z.infer<typeof SearchSchema> {};

export interface ShareResult {
  response: {
    result: boolean;
    queued: boolean;
  };
}

export interface StateResult {
  response: {
    id: number;
    vehicle_id: number;
    vin: string;
    color?: string;
    access_type: string;
    display_name: string;
    option_codes?: string;
    granular_access: {
      hide_private: boolean;
    };
    tokens: string[];
    state: string;
    in_service: boolean;
    id_s: string;
    calendar_enabled: boolean;
    api_version: number;
    backseat_token?: string;
    backseat_token_updated_at?: string;
    ble_autopair_enrolled: boolean;
  };
}

export interface PreconditionResult {
  response: {
    result: boolean;
    queued: boolean;
  };
}

export interface FrunkOpeningResult {
  response: {
    result: boolean;
    reason: string;
  };
}

export interface Credentials {
  token: string;
  refreshToken: string;
  clientID: string;
  VIN: string;
  basicAuth: {
    username: string;
    password: string;
  };
}

export interface TokenAnswer {
  access_token: string;
  refresh_token: string;
}
