/** International dialling codes offered at registration (neighbours, the main origin countries of Zimbabweans abroad). */
export const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "+263", label: "Zimbabwe +263" },
  { code: "+27", label: "South Africa +27" },
  { code: "+260", label: "Zambia +260" },
  { code: "+267", label: "Botswana +267" },
  { code: "+258", label: "Mozambique +258" },
  { code: "+265", label: "Malawi +265" },
  { code: "+264", label: "Namibia +264" },
  { code: "+255", label: "Tanzania +255" },
  { code: "+254", label: "Kenya +254" },
  { code: "+234", label: "Nigeria +234" },
  { code: "+44", label: "United Kingdom +44" },
  { code: "+1", label: "United States / Canada +1" },
];

/** "078 123 4567" with +263 becomes "+263781234567": digits only, one leading zero of the national number dropped. */
export function toE164(code: string, national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? `${code}${digits}` : "";
}
