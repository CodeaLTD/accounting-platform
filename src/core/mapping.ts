import {
  DELIVERY_TERMS,
  NATURE_OF_TRANSACTION,
  TRANSPORT_NATIONALITY,
} from "./constants";
import type {
  CustomerProfile,
  IntrastatDeclarationLine,
  SourceInvoiceLine,
} from "./types";

/** Guards against float-multiplication drift (e.g. 0.1 * 3) without hiding real precision. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** CN8 commodity code is the first 8 digits of "Custom Code" (e.g. "8208400000 - 0000" -> "82084000"). */
function extractCommodityCode(customsCode: string): string {
  return customsCode.split("-")[0].trim().slice(0, 8);
}

/**
 * Post-Brexit Intrastat uses special country codes distinct from plain ISO 3166-1:
 * Great Britain reports as "XU" (Northern Ireland stays "XI", not covered here since
 * it hasn't appeared in source data yet).
 */
const COUNTRY_OF_ORIGIN_OVERRIDES: Record<string, string> = {
  GB: "XU",
};

/**
 * Confirmed with the accountant: a blank country of origin stays blank in the
 * output (the за НАП.xls reference row showing "IT" for a blank origin was not
 * representative of the real rule).
 */
function resolveCountryOfOrigin(line: SourceInvoiceLine): string {
  if (line.countryOfOrigin.trim() === "") {
    return "";
  }
  return (
    COUNTRY_OF_ORIGIN_OVERRIDES[line.countryOfOrigin] ?? line.countryOfOrigin
  );
}

export function mapInvoiceLineToIntrastat(
  line: SourceInvoiceLine,
  profile: CustomerProfile,
): IntrastatDeclarationLine {
  return {
    sequenceNumber: null,
    commodityCode: extractCommodityCode(line.customsCode),
    partnerCountry: profile.partnerCountry,
    countryOfOrigin: resolveCountryOfOrigin(line),
    natureOfTransaction: NATURE_OF_TRANSACTION,
    deliveryTerms: DELIVERY_TERMS,
    modeOfTransport: profile.modeOfTransport,
    transportNationality: TRANSPORT_NATIONALITY,
    regionOfConsumption: profile.regionOfConsumption,
    netWeightKg: roundTo(line.unitNetWeightKg * line.invoicedQuantity, 3),
    supplementaryQuantity: null,
    value: Math.round(line.unitNetPrice * line.invoicedQuantity),
    statisticalValue: Math.round(line.unitNetPrice * line.invoicedQuantity),
  };
}

export function mapInvoiceLinesToDeclaration(
  lines: SourceInvoiceLine[],
  profile: CustomerProfile,
): IntrastatDeclarationLine[] {
  return lines.map((line) => mapInvoiceLineToIntrastat(line, profile));
}
