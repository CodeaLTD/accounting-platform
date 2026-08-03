"use client";

import { MESSAGES } from "@/app/messages";
import {
  PARTNER_COUNTRIES,
  REGIONS_OF_CONSUMPTION,
  TRANSPORT_MODES,
  type PartnerCountry,
  type RegionOfConsumption,
  type TransportMode,
} from "@/core/constants";
import type { CustomerProfile } from "@/core/types";

export interface ConfigFormValue {
  partnerCountry: PartnerCountry | "";
  modeOfTransport: TransportMode | "";
  regionOfConsumption: RegionOfConsumption | "";
}

export const EMPTY_CONFIG_FORM_VALUE: ConfigFormValue = {
  partnerCountry: "",
  modeOfTransport: "",
  regionOfConsumption: "",
};

export function isConfigComplete(
  value: ConfigFormValue,
): value is ConfigFormValue & CustomerProfile {
  return (
    value.partnerCountry !== "" &&
    value.modeOfTransport !== "" &&
    value.regionOfConsumption !== ""
  );
}

interface ConfigFormProps {
  value: ConfigFormValue;
  onChange: (value: ConfigFormValue) => void;
}

export function ConfigForm({ value, onChange }: ConfigFormProps) {
  return (
    <fieldset className="flex flex-col gap-4 sm:flex-row">
      <label className="flex flex-col gap-1">
        {MESSAGES.labels.partnerCountry}
        <select
          value={value.partnerCountry}
          onChange={(e) =>
            onChange({
              ...value,
              partnerCountry: e.target.value as PartnerCountry,
            })
          }
        >
          <option value="" disabled>
            —
          </option>
          {PARTNER_COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        {MESSAGES.labels.modeOfTransport}
        <select
          value={value.modeOfTransport}
          onChange={(e) =>
            onChange({
              ...value,
              modeOfTransport: e.target.value as TransportMode,
            })
          }
        >
          <option value="" disabled>
            —
          </option>
          {TRANSPORT_MODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        {MESSAGES.labels.regionOfConsumption}
        <select
          value={value.regionOfConsumption}
          onChange={(e) =>
            onChange({
              ...value,
              regionOfConsumption: e.target.value as RegionOfConsumption,
            })
          }
        >
          <option value="" disabled>
            —
          </option>
          {REGIONS_OF_CONSUMPTION.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
