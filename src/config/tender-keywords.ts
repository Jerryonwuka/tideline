// Words tenders use for each document type, to map requirements to stored documents (§10.5 step 2).
// Global types first; country-specific ones (Nigeria) are named here, in config, by design.

export const TENDER_KEYWORDS: Record<string, string[]> = {
  insurance: ["insurance", "p&i", "p & i", "hull and machinery", "h&m", "protection and indemnity"],
  class_certificate: ["class certificate", "classification certificate", "class status", "classification society"],
  load_line: ["load line"],
  radio_licence: ["radio licence", "radio license", "ship station licence", "ship station license"],
  safety_equipment: ["safety equipment", "safety construction", "safety certificate"],
  vessel_registration: [
    "certificate of registry",
    "vessel registration",
    "registration certificate",
    "flag certificate",
  ],
  crew_competency: ["certificate of competency", "certificates of competency", "competency", "coc"],
  stcw: ["stcw", "basic safety training", "bst"],
  medical: ["medical fitness", "medical certificate", "fit to work"],
  // Nigeria
  nimasa_certificate: ["nimasa"],
  cabotage_registration: ["cabotage"],
  laswa_licence: ["laswa"],
};
