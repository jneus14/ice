"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "en" | "es";

type TagMap = Record<string, string>;

type T = {
  // Layout
  siteTitle: string;
  siteDescription: string;
  projectOf: string;
  footerText: string;
  // Search filters
  searchPlaceholder: string;
  pastWeek: string;
  pastMonth: string;
  past3Months: string;
  pastYear: string;
  locationPlaceholder: string;
  from: string;
  to: string;
  clearFilters: string;
  incidentType: string;
  personImpacted: string;
  showIncidentsMatching: string;
  allSelectedTags: string;
  anySelectedTag: string;
  showingUnion: (n: number) => string;
  showingIntersection: (n: number) => string;
  countryOfOrigin: string;
  allCountries: string;
  loading: string;
  // Incident list
  incidents: string;
  of: string;
  noIncidents: string;
  previous: string;
  next: string;
  pageOf: (page: number, total: number) => string;
  // Page layout
  editMode: string;
  exit: string;
  hideMap: string;
  showMap: string;
  enterPassword: string;
  editDescription: string;
  password: string;
  incorrectPassword: string;
  unlock: string;
  cancel: string;
  // Category shortcuts
  browseByType: string;
  // Not found
  pageNotFound: string;
  returnHome: string;
  enforcementSetting: string;
  sourceType: string;
  // Tag labels
  tags: {
    incidentTypes: TagMap;
    personImpacted: TagMap;
    enforcementSettings: TagMap;
    sourceTypes: TagMap;
  };
};

const en: T = {
  siteTitle: "Human Impact Project",
  siteDescription:
    "A living database documenting reported immigration enforcement incidents and their human impact.",
  projectOf: "A project of",
  footerText: "Data sourced from public reporting.",
  searchPlaceholder: "Search incidents by keyword, location, or name...",
  pastWeek: "Past week",
  pastMonth: "Past month",
  past3Months: "Past 3 months",
  pastYear: "Past year",
  locationPlaceholder: "Filter by location...",
  from: "From",
  to: "To",
  clearFilters: "Clear filters",
  incidentType: "Incident Type",
  personImpacted: "Person(s) Impacted",
  showIncidentsMatching: "Show incidents matching",
  allSelectedTags: "ALL selected tags",
  anySelectedTag: "ANY selected tag",
  showingUnion: (n) => `showing union of ${n} tags`,
  showingIntersection: (n) => `showing intersection of ${n} tags`,
  countryOfOrigin: "Country of Origin (Person(s) Impacted)",
  allCountries: "All Countries",
  loading: "Loading...",
  incidents: "incidents",
  of: "of",
  noIncidents: "No incidents found matching your filters.",
  previous: "Previous",
  next: "Next",
  pageOf: (page, total) => `Page ${page} of ${total}`,
  editMode: "Edit mode",
  exit: "Exit",
  hideMap: "Hide map",
  showMap: "Show map",
  enterPassword: "Enter password to edit",
  editDescription: "This enables inline editing on all incident cards.",
  password: "Password",
  incorrectPassword: "Incorrect password.",
  unlock: "Unlock",
  cancel: "Cancel",
  browseByType: "Browse by Incident Type",
  enforcementSetting: "Enforcement Setting",
  sourceType: "Source Type",
  pageNotFound: "Page not found",
  returnHome: "Return home",
  tags: {
    incidentTypes: {
      "Climate/Environmental": "Climate/Environmental",
      "Court Order Violation": "Court Order Violation",
      "Litigation": "Litigation",
      "Death": "Death",
      "Deported": "Deportation",
      "3rd Country Deportation": "Third Country Deportation",
      "Detention Conditions": "Detention Conditions",
      "Detained": "Disappearance/Detention",
      "Injury/Illness/Medical": "Illness/Injury",
      "Officer Misconduct": "Officer Misconduct",
      "Officer Use Of Force": "Officer Use of Force",
      "Policy": "Policy",
      "Analysis": "Analysis",
      "Raid": "Raid",
      "Resistance": "Resistance",
      "Resources": "Resources",
      "State/Local Collusion": "State/Local Collusion",
      "Vigilante": "Vigilante/Impersonator/Bounty Hunter",
    },
    personImpacted: {
      "DACA": "DACA/Dreamer",
      "LGBTQ+": "LGBTQ+",
      "LPR": "LPR/Greencard",
      "Minor/Family": "Minor",
      "Native American": "Native American (U.S.)",
      "Indigenous (Non-U.S.)": "Indigenous (Non-U.S.)",
      "Person with Disability": "Person with Disability",
      "Refugee/Asylum": "Refugee/Asylum Seeker",
      "Student": "Student",
      "TPS": "Temporary Protected Status",
      "Palestine Advocate": "Palestine Advocate",
      "Protester/Intervenor": "Protester/Intervenor",
      "U.S. Citizen": "U.S. Citizen",
      "Visa / Legal Status": "Visa/Legal Status",
      "Military": "Military",
    },
    enforcementSettings: {
      "Court/USCIS/Immigration Office": "Court/USCIS/Immigration Office",
      "Airport": "Airport",
      "Workplace": "Workplace",
      "School": "School",
      "Church/Place of Worship": "Church/Place of Worship",
      "Hospital/Medical": "Hospital/Medical",
      "Home/Residence": "Home/Residence",
      "Criminal/Detainer": "Criminal/Detainer",
      "Vehicle/Traffic Stop": "Vehicle/Traffic Stop",
      "Public Space/Street": "Public Space/Street",
    },
    sourceTypes: {
      "social-media": "Social Media",
      "national-news": "National News",
      "international-news": "International News",
      "investigative-nonprofit": "Investigative / Nonprofit",
      "legal-court": "Legal / Court",
      "local-news": "Local News",
    },
  },
};

const es: T = {
  siteTitle: "Proyecto de Impacto Humano",
  siteDescription:
    "Una base de datos que documenta incidentes reportados de control migratorio y su impacto humano.",
  projectOf: "Un proyecto de",
  footerText: "Datos obtenidos de reportes públicos.",
  searchPlaceholder: "Buscar incidentes por palabra clave, lugar o nombre...",
  pastWeek: "Última semana",
  pastMonth: "Último mes",
  past3Months: "Últimos 3 meses",
  pastYear: "Último año",
  locationPlaceholder: "Filtrar por lugar...",
  from: "Desde",
  to: "Hasta",
  clearFilters: "Borrar filtros",
  incidentType: "Tipo de incidente",
  personImpacted: "Persona(s) afectada(s)",
  showIncidentsMatching: "Mostrar incidentes que coincidan con",
  allSelectedTags: "TODAS las etiquetas",
  anySelectedTag: "CUALQUIER etiqueta",
  showingUnion: (n) => `mostrando unión de ${n} etiquetas`,
  showingIntersection: (n) => `mostrando intersección de ${n} etiquetas`,
  countryOfOrigin: "País de origen (persona(s) afectada(s))",
  allCountries: "Todos los países",
  loading: "Cargando...",
  incidents: "incidentes",
  of: "de",
  noIncidents: "No se encontraron incidentes que coincidan con sus filtros.",
  previous: "Anterior",
  next: "Siguiente",
  pageOf: (page, total) => `Página ${page} de ${total}`,
  editMode: "Modo de edición",
  exit: "Salir",
  hideMap: "Ocultar mapa",
  showMap: "Mostrar mapa",
  enterPassword: "Ingrese contraseña para editar",
  editDescription:
    "Esto habilita la edición en línea en todas las tarjetas de incidentes.",
  password: "Contraseña",
  incorrectPassword: "Contraseña incorrecta.",
  unlock: "Desbloquear",
  cancel: "Cancelar",
  browseByType: "Explorar por tipo de incidente",
  enforcementSetting: "Lugar de operativo",
  sourceType: "Tipo de fuente",
  pageNotFound: "Página no encontrada",
  returnHome: "Volver al inicio",
  tags: {
    incidentTypes: {
      "Climate/Environmental": "Clima/Medioambiente",
      "Court Order Violation": "Violación de orden judicial",
      "Litigation": "Litigio",
      "Death": "Muerte",
      "Deported": "Deportación",
      "3rd Country Deportation": "Deportación a tercer país",
      "Detention Conditions": "Condiciones de detención",
      "Detained": "Desaparición/Detención",
      "Injury/Illness/Medical": "Enfermedad/Lesión",
      "Officer Misconduct": "Mala conducta policial",
      "Officer Use Of Force": "Uso de fuerza por agentes",
      "Policy": "Política",
      "Analysis": "Análisis",
      "Raid": "Redada",
      "Resistance": "Resistencia",
      "Resources": "Recursos",
      "State/Local Collusion": "Colusión estatal/local",
      "Vigilante": "Vigilante/Impostor/Cazarrecompensas",
    },
    personImpacted: {
      "DACA": "DACA/Soñador/a",
      "LGBTQ+": "LGBTQ+",
      "LPR": "Residente permanente",
      "Minor/Family": "Menor",
      "Native American": "Nativo/a americano/a (EE.UU.)",
      "Indigenous (Non-U.S.)": "Indígena (fuera de EE.UU.)",
      "Person with Disability": "Persona con discapacidad",
      "Refugee/Asylum": "Refugiado/Solicitante de asilo",
      "Student": "Estudiante",
      "TPS": "Estatus de Protección Temporal",
      "Palestine Advocate": "Defensor/a de Palestina",
      "Protester/Intervenor": "Manifestante/Interventor",
      "U.S. Citizen": "Ciudadano/a de EE.UU.",
      "Visa / Legal Status": "Visa/Estatus migratorio",
      "Military": "Militar",
    },
    enforcementSettings: {
      "Court/USCIS/Immigration Office": "Tribunal/USCIS/Oficina de inmigración",
      "Airport": "Aeropuerto",
      "Workplace": "Lugar de trabajo",
      "School": "Escuela",
      "Church/Place of Worship": "Iglesia/Lugar de culto",
      "Hospital/Medical": "Hospital/Centro médico",
      "Home/Residence": "Hogar/Residencia",
      "Criminal/Detainer": "Criminal/Detención",
      "Vehicle/Traffic Stop": "Vehículo/Parada de tráfico",
      "Public Space/Street": "Espacio público/Calle",
    },
    sourceTypes: {
      "social-media": "Redes sociales",
      "national-news": "Noticias nacionales",
      "international-news": "Noticias internacionales",
      "investigative-nonprofit": "Investigación / ONG",
      "legal-court": "Legal / Judicial",
      "local-news": "Noticias locales",
    },
  },
};

const translations: Record<Lang, T> = { en, es };

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("lang") as Lang | null;
    if (saved === "en" || saved === "es") setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("lang", l);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
