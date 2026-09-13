// Tailored document fields (metadata schema) for each vault.
//
// Every vault carries a small set of "fields" - typed inputs shown when a
// document is saved into that vault and displayed on the document screen.
// Default vaults are seeded with a tailored set below; custom vaults start
// with a sensible generic set and can be fully customised with the field
// builder. The captured values live on Document.metadata, and a lowercase
// concatenation of the name plus every value is stored on Document.searchText
// so search can match across all fields, not just the document name.

export type FieldType = "text" | "date" | "number" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

// A field's key is stable and machine-safe; the label is what the user sees.
export function slugifyFieldKey(label: string): string {
  const base = (label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `field_${Math.random().toString(36).slice(2, 8)}`;
}

// Generic starting set for custom vaults (and any unknown default name).
const GENERIC_FIELDS: FieldDef[] = [
  {
    key: "document_type",
    label: "Document type",
    type: "text",
  },
  { key: "issuer_source", label: "Issuer or source", type: "text" },
  { key: "issue_date", label: "Issue date", type: "date" },
  { key: "expiry_date", label: "Expiration or renewal date", type: "date" },
];

// Tailored fields keyed by the canonical default vault name. Kept practical
// (four to five fields) and aligned with the vault architecture document.
const DEFAULT_VAULT_FIELDS: Record<string, FieldDef[]> = {
  "Identity & IDs": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Passport",
        "Driver's licence",
        "National ID",
        "Birth certificate",
        "Social security",
        "Other",
      ],
    },
    { key: "id_number", label: "ID number", type: "text" },
    { key: "issuing_authority", label: "Issuing authority", type: "text" },
    { key: "issue_date", label: "Issue date", type: "date" },
    { key: "expiry_date", label: "Expiration date", type: "date" },
  ],
  "Taxes & Income": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: ["Tax return", "W-2", "1099", "Receipt", "Statement", "Other"],
    },
    { key: "tax_year", label: "Tax year", type: "text" },
    { key: "issuer_source", label: "Issuer or source", type: "text" },
    { key: "document_date", label: "Date", type: "date" },
    { key: "retention_until", label: "Retain until", type: "date" },
  ],
  Vehicle: [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Registration",
        "Title",
        "Insurance",
        "Service record",
        "Other",
      ],
    },
    { key: "make", label: "Make", type: "text" },
    { key: "model", label: "Model", type: "text" },
    { key: "vin", label: "VIN", type: "text" },
    { key: "expiry_date", label: "Renewal or expiration date", type: "date" },
  ],
  Property: [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: ["Deed", "Mortgage", "Lease", "Insurance", "Utility", "Other"],
    },
    { key: "property_address", label: "Property address", type: "text" },
    { key: "provider", label: "Provider or institution", type: "text" },
    { key: "effective_date", label: "Effective date", type: "date" },
    { key: "expiry_date", label: "Renewal or expiration date", type: "date" },
  ],
  "Education & Professional": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: ["Diploma", "Certificate", "Transcript", "Licence", "Other"],
    },
    {
      key: "issuing_organization",
      label: "Issuing organisation",
      type: "text",
    },
    { key: "field_subject", label: "Field or subject", type: "text" },
    { key: "issue_date", label: "Issue date", type: "date" },
    { key: "expiry_date", label: "Expiration or renewal date", type: "date" },
  ],
  "Legal & Estate": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Will",
        "Trust",
        "Power of attorney",
        "Contract",
        "Other",
      ],
    },
    { key: "designated_parties", label: "Designated parties", type: "text" },
    { key: "version", label: "Version", type: "text" },
    { key: "execution_date", label: "Execution date", type: "date" },
    { key: "review_date", label: "Review date", type: "date" },
  ],
  Financial: [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Bank statement",
        "Investment",
        "Loan",
        "Credit",
        "Other",
      ],
    },
    { key: "institution", label: "Institution", type: "text" },
    { key: "account_type", label: "Account type", type: "text" },
    { key: "statement_period", label: "Statement period", type: "text" },
    { key: "review_date", label: "Review date", type: "date" },
  ],
  "Employment & Payroll": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Contract",
        "Payslip",
        "Offer letter",
        "Tax form",
        "Other",
      ],
    },
    { key: "employer", label: "Employer", type: "text" },
    { key: "employment_period", label: "Employment period", type: "text" },
    { key: "document_date", label: "Date", type: "date" },
    { key: "review_date", label: "Renewal or review date", type: "date" },
  ],
  "Password & Security": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Password list",
        "Security questions",
        "Recovery codes",
        "Other",
      ],
    },
    { key: "service_account", label: "Service or account", type: "text" },
    { key: "username", label: "Username", type: "text" },
    { key: "last_updated", label: "Last updated", type: "date" },
  ],
  "Medical & Emergency": [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: [
        "Medical record",
        "Prescription",
        "Insurance",
        "Vaccination",
        "Emergency contact",
        "Other",
      ],
    },
    { key: "provider", label: "Provider", type: "text" },
    { key: "patient_name", label: "Patient name", type: "text" },
    { key: "document_date", label: "Date", type: "date" },
    { key: "expiry_date", label: "Expiration or renewal date", type: "date" },
  ],
};

// Returns the tailored field set for a given vault name. Falls back to the
// generic set for custom vaults or any name without a tailored template.
export function getDefaultFieldsFor(name: string): FieldDef[] {
  const tailored = DEFAULT_VAULT_FIELDS[(name || "").trim()];
  // Return fresh copies so callers can never mutate the shared templates.
  return (tailored ?? GENERIC_FIELDS).map((f) => ({ ...f, options: f.options ? [...f.options] : undefined }));
}

export function getGenericFields(): FieldDef[] {
  return GENERIC_FIELDS.map((f) => ({ ...f }));
}

// Normalises an arbitrary value into a valid FieldDef array (used when reading
// the Json column, which Prisma types as `unknown`). Invalid entries are
// dropped so the UI never renders a broken field.
export function coerceFieldDefs(raw: unknown): FieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const anyItem = item as Record<string, unknown>;
    const label = typeof anyItem.label === "string" ? anyItem.label.trim() : "";
    let key = typeof anyItem.key === "string" ? anyItem.key.trim() : "";
    if (!label) continue;
    if (!key) key = slugifyFieldKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    const typeRaw = typeof anyItem.type === "string" ? anyItem.type : "text";
    const type: FieldType =
      typeRaw === "date" || typeRaw === "number" || typeRaw === "select"
        ? typeRaw
        : "text";
    const def: FieldDef = { key, label, type };
    if (type === "select" && Array.isArray(anyItem.options)) {
      const options = anyItem.options
        .map((o) => (typeof o === "string" ? o.trim() : ""))
        .filter((o) => o.length > 0);
      if (options.length > 0) def.options = options;
    }
    out.push(def);
  }
  return out;
}

// Keeps only values whose keys exist in the vault's field definitions, coerces
// them to trimmed strings, and drops empties. This is the authoritative
// sanitiser used by the document write APIs.
export function sanitizeMetadata(
  raw: unknown,
  fields: FieldDef[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const f of fields) {
    const v = obj[f.key];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    out[f.key] = s;
  }
  return out;
}

// Builds the lowercase search haystack from the document name and its metadata
// values (labels are included too so a search for "passport" or "VIN" matches).
export function buildSearchText(
  name: string,
  metadata: Record<string, string> | null | undefined,
  fields: FieldDef[],
): string {
  const parts: string[] = [name || ""];
  if (metadata) {
    for (const f of fields) {
      const v = metadata[f.key];
      if (v != null && String(v).trim()) {
        parts.push(String(v));
      }
    }
  }
  return parts.join(" ").toLowerCase().slice(0, 2000);
}

// Determines which date field in a vault represents the document's expiry /
// renewal / retention date, so reminders can key off a single canonical value.
// Preference order: an explicit "expiry_date" key, then "retention_until",
// then any date field whose key or label looks like an expiry / renewal /
// retention / valid-until date. Returns null when the vault has no such field.
export function getExpiryFieldKey(fields: FieldDef[]): string | null {
  const dates = fields.filter((f) => f.type === "date");
  if (dates.length === 0) return null;
  const byKey = (k: string) => dates.find((f) => f.key === k)?.key ?? null;
  const explicit = byKey("expiry_date") ?? byKey("retention_until");
  if (explicit) return explicit;
  const rx = /(expir|renew|retain|retention|valid|due|expiry)/i;
  const match = dates.find((f) => rx.test(f.key) || rx.test(f.label));
  return match ? match.key : null;
}

// Identifies vault fields whose values are sensitive enough to hide behind a
// re-authentication step on the document screen (ID numbers, passport / licence
// numbers, VINs, usernames, patient names, account numbers, and similar). Only
// free-text and number fields are ever masked; dates and select values are not
// considered sensitive on their own. Matching is deliberately conservative so
// that non-sensitive fields like "Account type" (Checking / Savings) or a
// service name are never masked.
export const SENSITIVE_FIELD_PATTERN =
  /(id.?number|passport.?number|licen[cs]e.?number|\bssn\b|social.?security|account.?number|\bvin\b|tax.?id|policy.?number|username|password|recovery.?code|patient.?name)/i;

export function isSensitiveField(field: FieldDef): boolean {
  if (field.type !== "text" && field.type !== "number") return false;
  return (
    SENSITIVE_FIELD_PATTERN.test(field.key) ||
    SENSITIVE_FIELD_PATTERN.test(field.label)
  );
}
