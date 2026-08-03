// Confirmed with the accountant (2026-07-30): these three fields never vary
// per declaration, so they're hardcoded rather than user-configurable.
// Nature of transaction confirmed as "11" on 2026-08-03, superseding the
// earlier "1" confirmation — see project memory for the flip-flop history.
export const NATURE_OF_TRANSACTION = "11";
export const DELIVERY_TERMS = "CPT";
export const TRANSPORT_NATIONALITY = "BG";

export const PARTNER_COUNTRIES = ["IT", "FR"] as const;
export type PartnerCountry = (typeof PARTNER_COUNTRIES)[number];

export const TRANSPORT_MODES = ["3", "4"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

// Bulgarian region codes for Intrastat's "region of consumption" field,
// provided by the accountant (2026-08-01). XXX/ZZZ are the two standard
// catch-all codes (whole country / origin region not Bulgarian), not typos.
export const REGIONS_OF_CONSUMPTION = [
  { code: "BLG", label: "Благоевград" },
  { code: "BGS", label: "Бургас" },
  { code: "VAR", label: "Варна" },
  { code: "VTR", label: "Велико Търново" },
  { code: "VID", label: "Видин" },
  { code: "VRC", label: "Враца" },
  { code: "GAB", label: "Габрово" },
  { code: "DOB", label: "Добрич" },
  { code: "KRZ", label: "Кърджали" },
  { code: "KNL", label: "Кюстендил" },
  { code: "LOV", label: "Ловеч" },
  { code: "MON", label: "Монтана" },
  { code: "PAZ", label: "Пазарджик" },
  { code: "PER", label: "Перник" },
  { code: "PVN", label: "Плевен" },
  { code: "PDV", label: "Пловдив" },
  { code: "RAZ", label: "Разград" },
  { code: "RSE", label: "Русе" },
  { code: "SLS", label: "Силистра" },
  { code: "SLV", label: "Сливен" },
  { code: "SML", label: "Смолян" },
  { code: "SOF", label: "София (столица)" },
  { code: "SFO", label: "София" },
  { code: "SZR", label: "Стара Загора" },
  { code: "TGV", label: "Търговище" },
  { code: "HKV", label: "Хасково" },
  { code: "SHU", label: "Шумен" },
  { code: "JAM", label: "Ямбол" },
  { code: "XXX", label: "Цялата страна" },
  { code: "ZZZ", label: "Региона на произход не е български" },
] as const;
export type RegionOfConsumption = (typeof REGIONS_OF_CONSUMPTION)[number]["code"];
