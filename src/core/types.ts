import type {
  PartnerCountry,
  RegionOfConsumption,
  TransportMode,
} from "./constants";

// Domain model for one line of the source invoice (SAP-style export).
// A future XML parser is responsible for producing this shape from the real source XML.
export interface SourceInvoiceLine {
  customerCode: string;
  documentType: string;
  orderNumber: string;
  customerOrderNumber: string;
  sublineNumber: string;
  invoiceNumber: string;
  invoiceLine: string;
  invoiceDate: string;
  invoiceDueDate: string;
  deliveryDocument: string;
  deliveryDocumentDate: string;
  partNumber: string;
  partDescription: string;
  carrierCode: string;
  carrierName: string;
  manufacturedCode: string;
  /** ISO 3166-1 alpha-2 */
  countryOfOrigin: string;
  supersessions: string;
  warehouse: string;
  unitNetWeightKg: number;
  invoicedQuantity: number;
  unitListPrice: number;
  unitNetPrice: number;
  totalInvoiceVat: number;
  totalInvoiceAmount: number;
  surcharges: number;
  currency: string;
  caseNumber: string;
  /** e.g. "8208400000 - 0000" — CN8 + supplementary digits, hyphen-separated */
  customsCode: string;
}

// The declaration-level choices the accountant makes per batch (via dropdowns in the
// app). Nature of transaction, delivery terms, and transport nationality are NOT here —
// per the accountant, those never vary and are hardcoded in constants.ts instead.
export interface CustomerProfile {
  partnerCountry: PartnerCountry;
  modeOfTransport: TransportMode;
  regionOfConsumption: RegionOfConsumption;
}

// One line of the target Bulgarian Intrastat declaration.
export interface IntrastatDeclarationLine {
  /** Always null — the accountant doesn't want this column auto-numbered. */
  sequenceNumber: null;
  /** CN8 commodity code */
  commodityCode: string;
  partnerCountry: PartnerCountry;
  /** Empty string when the source has no country of origin — left blank, not defaulted. */
  countryOfOrigin: string;
  natureOfTransaction: string;
  deliveryTerms: string;
  modeOfTransport: TransportMode;
  transportNationality: string;
  regionOfConsumption: string;
  netWeightKg: number;
  /** Always null — must stay empty per the accountant's submission process. */
  supplementaryQuantity: null;
  /** EUR, since Bulgaria adopted the euro — see project memory */
  value: number;
  /** EUR */
  statisticalValue: number;
}
