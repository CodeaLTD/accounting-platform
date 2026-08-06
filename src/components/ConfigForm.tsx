"use client";

import { MESSAGES } from "@/app/messages";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <div className="flex flex-col gap-1">
        <Label>{MESSAGES.labels.partnerCountry}</Label>
        <Select
          value={value.partnerCountry}
          onValueChange={(next: PartnerCountry | "" | null) =>
            onChange({ ...value, partnerCountry: next ?? "" })
          }
        >
          <SelectTrigger aria-label={MESSAGES.labels.partnerCountry}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {PARTNER_COUNTRIES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={`text-sm text-red-600 ${value.partnerCountry === "" ? "" : "invisible"}`}
        >
          {MESSAGES.errors.selectPartnerCountry}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <Label>{MESSAGES.labels.modeOfTransport}</Label>
        <Select
          value={value.modeOfTransport}
          onValueChange={(next: TransportMode | "" | null) =>
            onChange({ ...value, modeOfTransport: next ?? "" })
          }
        >
          <SelectTrigger aria-label={MESSAGES.labels.modeOfTransport}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {TRANSPORT_MODES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={`text-sm text-red-600 ${value.modeOfTransport === "" ? "" : "invisible"}`}
        >
          {MESSAGES.errors.selectModeOfTransport}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <Label>{MESSAGES.labels.regionOfConsumption}</Label>
        <Select
          value={value.regionOfConsumption}
          onValueChange={(next: RegionOfConsumption | "" | null) =>
            onChange({ ...value, regionOfConsumption: next ?? "" })
          }
        >
          <SelectTrigger aria-label={MESSAGES.labels.regionOfConsumption}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS_OF_CONSUMPTION.map(({ code, label }) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={`text-sm text-red-600 ${value.regionOfConsumption === "" ? "" : "invisible"}`}
        >
          {MESSAGES.errors.selectRegionOfConsumption}
        </span>
      </div>
    </fieldset>
  );
}
