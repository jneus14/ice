import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// IDs where the person impacted WAS a protester, intervenor, observer, volunteer, or witness
// These KEEP the Protester/Intervenor tag
const KEEP_TAG: Set<number> = new Set([
  // Anti-ICE protest participants who were targeted
  17,  // Eugene anti-ICE protest declared riot, FBI seeks suspects
  29,  // TikToker shot by ICE while documenting
  106, // Three protesters beaten and detained
  114, // Veteran arrested after protest
  277, // Tattoo artist assaulted for protesting
  292, // Second protester blinded by less-lethal munition
  303, // Democratic candidate indicted for ICE facility protests
  339, // Federal agents blind two protesters
  343, // US Army Captain arrested for peacefully protesting ICE
  364, // Two protesters charged with felony assault blocking ICE
  396, // ICE monitors San Diego activists through Operation Road Flare
  407, // Judge dismisses case against LA protester, gov acted in bad faith
  417, // San Diego activist sentenced for ICE officer assault
  438, // Legal observer detained 8 hours at Minneapolis Federal Building
  452, // US citizen detained by immigration agents in Robbinsdale
  481, // Social worker detained at ICE detention center protest
  499, // Protestors arrested on false charges
  529, // Milwaukee Judge convicted of obstructing ICE arrest (intervenor)
  543, // Three women charged for documenting ICE agent
  590, // Journalist arrested covering Sunrise Movement protest
  604, // 30 arrested blocking ICE detention facility
  624, // Federal agents arrest man documenting enforcement
  635, // ICE officer accused of force against protesters
  639, // CSU lecturer pleads not guilty in raid protest case
  682, // Somali-American US citizen confronts ICE agents (intervenor)
  693, // Demand for Diana Crespo-Gonzalez (activist detained)
  704, // Deaf LAUSD student alleges violent ICE detention at protest
  739, // Pepper spray near Santa Barbara school on observers
  749, // Officers pepper-spray residents during enforcement (bystanders targeted)
  755, // Immigration enforcement alert (community alert)
  792, // San Diego federal building cites volunteers observing
  796, // Baldwin Park 3 acquitted in trial against ICE agents
  802, // ICE remotely disables community watcher's vehicle
  817, // ICE officer pushed woman (bystander/intervenor)
  834, // 80-year-old attorney pepper sprayed by ICE agents
  841, // Journalists detained in Cameroon investigating deportations
  896, // Houston students protest ICE detention of soccer captain
  936, // Family with six children tear gassed during ICE protest
  939, // Immigration agents depart Terminal Island after activist surveillance
  941, // ICE leave Terminal Island after months of raids (activist monitoring)
  942, // LA protesters face off with police
  947, // Feds arrest anti-ICE activists in pre-dawn raid
  950, // Five Spokane ICE protesters plead guilty
  967, // ICE facility tear gas against protesters in Portland
  968, // Marine veteran alleges assault by DHS at ICE facility
  975, // US citizen photographer arrested filming raid
  988, // DHS subpoenas activist for posting Border Patrol agent video
  989, // DHS condemns activists revealing ICE agents' identities
  1035, // Teen brothers monitor ICE activity (observers)
  1060, // LAPD should verify ICE agent ID (observer safety)
  1070, // ICE officer Nazi-themed uniform (reported by observers)
  1097, // San Antonio students protest
  1098, // San Antonio students protest
  1099, // High school students peaceful protest
  1119, // Teen brothers document ICE operations (observers)
  1139, // DACA activist detained
  1140, // US citizen Walmart employee detained after confronting officers (intervenor)
  1150, // Activists demand release of detained protester
  1152, // Hundreds protest ICE detention facilities
  1227, // West Chicago teens document ICE enforcement (observers)
  1241, // Minneapolis neighbors organize ICE Watch
  1281, // Journalist Mario Guevara deported after protest arrest
  1351, // Twin Cities protesters mobilize to document ICE arrests
  1352, // Legal observers document ICE activity
  1368, // LAPD charges at high school students protesting ICE raids
  1387, // Feds charge 14 protesters with assault during ICE crackdown
  1426, // Judge limits tear gas at Portland ICE protests
  1477, // OC activists track ICE, live-stream
  1478, // ICE agent pulls gun on Santa Ana community observer
  1479, // Santa Ana and ICE mass surveillance of activists
  1523, // Advocate pepper-sprayed during ICE enforcement
  1547, // Montgomery County officials condemn ICE raid (observers targeted)
  1554, // Sacramento man charged with puncturing Border Patrol tire
  1556, // Protesters clash with federal agents near Home Depot
  1560, // Federal officers arrest anti-ICE protesters at LA detention center
  1562, // Finneas tear-gassed at ICE protest
  1569, // Man opposes ICE detention center
  1580, // Man indicted for ramming ICE vehicle during raid (intervenor)
  1794, // Google handed over student journalist data to ICE
  1896, // Appeals court blocks Trump sweeps (legal observer context)
  1946, // ICE officers shove journalists to floor
  1966, // Teen thrown to ground by apparent federal agent
  1978, // Judge expands questioning about tear gas claims
  2088, // Border Patrol commander under criminal investigation (for actions against protesters)
  2151, // Anti-ICE protesters convicted on terrorism charges
  2155, // Officials detain and cite volunteers documenting arrests
  2243, // California teens protest ICE
  // People who are activists/protesters and were detained FOR their activism
  4,   // US citizen livestreams detention as agents smash car window
  6,   // 79-year-old body-slammed (confronting agents)
  11,  // ICE revokes Global Entry after facial recognition of protester
  14,  // Protesters arrested outside Broadview ICE detention center
  22,  // Federal officers take protesters into custody
  35,  // Officer use of force against protester
  60,  // Pregnant woman struck by rubber bullet at protest
  67,  // DACA recipient detained over social media posts (activism)
  73,  // Officer use of force, detained
  76,  // Chicago lawmaker threatened (intervening in ICE enforcement)
  77,  // Protester permanently blinded by federal agent
  86,  // Chicago lawmaker stopped at gunpoint
  87,  // WGN News employee detained by federal agents (press)
  109, // Man pleads not guilty for handing out face shields
  123, // Anti-ICE TikToker arrested after posting brutality videos
  140, // CSU Professor charged
  148, // Operation Midway Blitz amid protests (protesters targeted)
  151, // DHS threatens charges for filming agents
  152, // Chicago ICE ops, Facebook restrictions on activists
  164, // Camera taken from man filming
  213, // ICE agents threatened cyclist for following and recording
  227, // Federal agents deploy chemicals at protests
  279, // US-born citizen detained amid clash (confrontation)
  329, // Three women charged for doxxing ICE agent, livestreaming
  346, // Agents intimidate women documenting activity
  363, // St. Paul activist Thao Xiong detained
  408, // Immigration agents using obscure law to detain US citizens (at protest context)
  472, // Spanish-language reporter deported after protest arrest
  547, // Teens document ICE detentions (observers)
  902, // ICE detains Palestinian activist Khalil
  951, // ICE arresting American citizens (at protests)
  1005, // Mass deportation raids impact Chicago (protest context)
  1093, // ICE detains US citizens at protest
  1135, // Journalist detained after protest arrest
  1199, // Palestinian activist detained (activist)
  1201, // Community members rally (rally participants)
  1513, // ICE arrests at courthouse, lawyers intervene
  1567, // Palestinian activist ordered to remain in detention
  1568, // Palestinian activist describes detention
  1812, // Venezuelan sent to Guantanamo (protest context)
  2121, // Leqaa Kordia seeks release (activist)
  2167, // Palestinian protester released
  2187, // Palestinian protester released
  2206, // Palestinian activist released
  2208, // Georgetown scholar detained for speech
  337,  // British journalist detained after Israel criticism
]);

// IDs where the person impacted was NOT a protester - remove the tag
// These are incidents where the primary person impacted was detained/deported for non-protest reasons
// and community protests happened in response, or protest was incidental context
const REMOVE_TAG: number[] = [
  5,    // Jersey City Light Rail arrests - general enforcement
  40,   // Couple en route to emergency room - medical emergency, not protest
  62,   // Hassan Hamka community petition - he was detained, community petitioned
  322,  // Pregnant woman held face-down as crowd protests - she wasn't protesting
  350,  // Milford student detained to attend State of Union - student, not protester
  352,  // Denver Bassist held in ICE custody - musician, not protester
  361,  // Flash bang on car with children - children, not protesters
  375,  // Leqaa Kordia discharged from hospital - detained person (will be combined separately)
  380,  // Monthly vigil after death - vigil participants not targeted
  381,  // Vigil honors immigrants who died - vigil participants not targeted
  383,  // Minnesota suburbs stealthier tactics - general enforcement
  422,  // Three Oglala Lakota men detained - detained, not for protesting
  532,  // Community organizers support Indigenous family - family wasn't protesting
  546,  // Immigration Judge orders release twice - legal case
  588,  // Bronx SIJS student detained at check-in - student, not protester
  638,  // Congressional access denied to facility - congressional, not protest
  653,  // Woman alerts community to ICE - community alert
  687,  // Woman organizes donations - organizing donations, not protesting
  703,  // Indigenous Chef's employee deported - employee, not protester
  733,  // Florida World Cup travel advisory - advisory, not protest
  832,  // Market owner faces deportation - business owner
  866,  // Venezuelan family detained at hospital - medical context
  969,  // Detained father describes conditions - detainee
  990,  // Vigil mourns Renee Good - vigil, not targeted
  1011, // Day laborers targeted at Home Depot - workers, not protesters
  1012, // Punjabi grandmother detained after 33 years - longtime resident
  1013, // East Bay grandmother deported to India - not protester
  1038, // Restaurant owner detained, community rallies - owner not protesting
  1040, // Day care worker arrested in front of children - worker
  1041, // Daycare teacher detained at childcare center - teacher
  1051, // ICE arrests family, protesters respond - family wasn't protesting
  1055, // ICE fires shots at vehicle - not protesters
  1065, // ICE enforcement in Long Beach - general enforcement
  1066, // ICE raids spark economic crisis - economic impact
  1084, // Oklahoma tribal leaders racial profiling - about profiling
  1090, // ICE agents stop US citizen demand proof - not protesting
  1092, // ICE enforcement raises legal concerns - general enforcement
  1123, // Taco vendor detained - vendor, not protester
  1136, // Dad and toddler pepper-sprayed - bystanders
  1161, // Gardener detained amid force allegations - worker
  1169, // Chef detained - worker
  1170, // ICE defies court order, uses tear gas - enforcement
  1181, // ICE activity rising in Pittsburgh - awareness
  1182, // Pittsburgh ICE arrests triple - general enforcement
  1202, // Community rallies around detained men - men weren't protesting
  1308, // Irish woman detained after Ireland visit - not protester
  1314, // Permanent resident detained at SFO - not protester
  1328, // Six legal residents detained at O'Hare - not protesters
  1349, // Lewiston community rallies - community rally, not targeting protesters
  1385, // Immigration crackdown at church - not protesters
  1386, // ICE raids in churches - not protesters
  1390, // 5-year-old and father held - not protesters
  1420, // ICE raid at car wash - workers
  1421, // 46 detained outside jail - not protesters
  1428, // Minneapolis families hide - general enforcement
  1439, // US citizen Target employee detained - employee, not protester
  1441, // ICE rumors cause school absences - not protesters
  1467, // Brooklyn student detained, rally follows - student
  1525, // Detroit teen arrested after traffic stop - student
  1548, // ICE raid at Montgomery County home - raid
  1590, // Judge blocks warrantless arrests - legal proceedings
  1665, // Lawmakers tour detention facility - lawmakers
  1668, // Detainees on hunger strike - detainees
  1671, // Miccosukee Tribe legal battle - legal action
  1713, // Three immigrants detained in Vermont - general enforcement
  1714, // Texas mariachi brothers released - not protesters
  1738, // Trump converts warehouses to detention - policy/infrastructure
  1744, // Sanctuary-related detention - not protest
  1750, // Texas mariachi brothers released - not protesters
  1764, // Raid/detention - general enforcement
  1786, // Deported, court process - not protester
  1792, // Detained family/refugees - not protesters
  1795, // Detained US citizen - not for protesting
  1816, // Raids catch US citizens amid profiling - profiling
  1818, // Militarized raid on Denver apartment - general raid
  1862, // Venezuelans nearly deported under AEA - not protesters
  1877, // Racial profiling in LA raids - profiling
  1878, // ICE detains US citizens in LA raids - profiling
  1903, // Guatemalan children repatriation attempt - children
  1921, // ICE agent kills unarmed man in traffic stop - not protester
  2022, // Agents' poor tactics analysis - analysis
  2034, // Abuse claims fall apart in court - legal
  2051, // 23 shooting incidents identified - compilation
  2111, // ICE detains fiancée - not protester
  2124, // Painter released using bond strategy - legal
  2157, // Prosecutors resign over investigation - prosecutors
  2174, // ICE purchases warehouse - infrastructure
  2190, // Detained/raid/refugee - general enforcement
  2195, // Enid HS senior detained - student
  2202, // Detained/raid - general enforcement
  2223, // Undocumented workers clean up fires - workers
  2238, // NYC student released after 10 months - student
  2248, // Deported father fights to return - deportee
  273,  // Day laborer detained - worker
  351,  // ICE detains asylum seekers - asylum seekers
  517,  // DHS accused of libel - legal
  587,  // Native American woman nearly deported - not for protesting
  722,  // Immigration enforcement at churches - enforcement
  774,  // Father detained while children witness - family
  891,  // Leqaa Kordia returned to custody - detained person (will combine)
  1283, // LA man detained, whereabouts unknown - detained
  1361, // Mariachi brothers released - not protesters
  1497, // Pregnant US citizen arrested by ICE - not protester
  1812, // Venezuelan sent to Guantanamo - deportee
  2039, // Autopsy classifies death as homicide - detainee death
  740,  // Palestinian woman hospitalized - detained person
  1031, // Stateless Palestinian fights for detainees - detained person
  1173, // Newlywed Palestinian woman released - detained person
  1424, // US deporting Palestinians to West Bank - policy
];

async function main() {
  console.log(`Will remove Protester/Intervenor tag from ${REMOVE_TAG.length} incidents\n`);

  let updated = 0;
  for (const id of REMOVE_TAG) {
    const incident = await prisma.incident.findUnique({
      where: { id },
      select: { id: true, incidentType: true, headline: true },
    });
    if (!incident?.incidentType) continue;

    const tags = incident.incidentType
      .split(",")
      .map((t) => t.trim())
      .filter(
        (t) =>
          t !== "Protester/Intervenor" &&
          t !== "Protest / Intervention" &&
          t !== "Protest"
      );

    if (tags.join(", ") !== incident.incidentType) {
      await prisma.incident.update({
        where: { id },
        data: { incidentType: tags.join(", ") },
      });
      console.log(`✓ ${id}: removed tag → ${tags.join(", ")} | ${(incident.headline || '').slice(0, 60)}`);
      updated++;
    }
  }
  console.log(`\nRemoved Protester/Intervenor from ${updated} incidents`);

  // Also clean up old "Protest / Intervention" and "Protest" tag formats
  // on KEEP incidents — convert to "Protester/Intervenor"
  const keepIncidents = await prisma.incident.findMany({
    where: {
      id: { in: Array.from(KEEP_TAG) },
      OR: [
        { incidentType: { contains: "Protest / Intervention" } },
        {
          AND: [
            { incidentType: { contains: "Protest" } },
            { NOT: { incidentType: { contains: "Protester/Intervenor" } } },
          ],
        },
      ],
    },
    select: { id: true, incidentType: true },
  });

  for (const i of keepIncidents) {
    if (!i.incidentType) continue;
    const tags = i.incidentType
      .split(",")
      .map((t) => t.trim())
      .map((t) => {
        if (t === "Protest / Intervention" || t === "Protest") return "Protester/Intervenor";
        return t;
      })
      .filter((t, idx, arr) => arr.indexOf(t) === idx);

    await prisma.incident.update({
      where: { id: i.id },
      data: { incidentType: tags.join(", ") },
    });
    console.log(`✓ Fixed old tag format on incident ${i.id}: ${tags.join(", ")}`);
  }

  await prisma.$disconnect();
  console.log("\nDone!");
}

main().catch(console.error);
