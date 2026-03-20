import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ========================================
  // COMBINE MAHMOUD KHALIL INCIDENTS
  // ========================================
  // IDs: 1567, 1152, 1199, 1568, 821, 1150, 902
  // Keep 902 as primary (has most alt sources, earliest detailed coverage)

  const khalilIds = [1567, 1152, 1199, 1568, 821, 1150, 902];
  const khalilPrimary = 902;
  const khalilDelete = khalilIds.filter(id => id !== khalilPrimary);

  // Collect all URLs
  const khalilIncidents = await prisma.incident.findMany({
    where: { id: { in: khalilIds } },
    select: { id: true, url: true, altSources: true }
  });

  const khalilUrls: string[] = [];
  for (const i of khalilIncidents) {
    if (i.id !== khalilPrimary) khalilUrls.push(i.url);
    if (i.altSources) {
      try {
        const parsed = JSON.parse(i.altSources);
        khalilUrls.push(...parsed);
      } catch {}
    }
  }

  // Get existing alt sources from primary
  const khalilPrimaryInc = khalilIncidents.find(i => i.id === khalilPrimary)!;
  const existingKhalilAlt: string[] = khalilPrimaryInc.altSources ? JSON.parse(khalilPrimaryInc.altSources) : [];
  const allKhalilAlt = [...new Set([...existingKhalilAlt, ...khalilUrls])];

  const khalilHeadline = "Mahmoud Khalil: Palestinian Columbia Activist Detained by ICE, Fights Deportation After 100+ Days in Louisiana Facility";
  const khalilSummary = `Mahmoud Khalil, a Palestinian activist, Columbia University graduate, and legal permanent resident, was arrested by ICE on March 8, 2025 outside his apartment at Columbia University in New York City. His detention stemmed from his role in leading pro-Palestinian protests and a Gaza solidarity encampment at the university in 2024. Khalil was transferred to the Central Louisiana ICE Processing Center in Jena, where he was held for over 100 days without formal criminal charges. During his detention, he was denied permission to attend the birth of his son.

A federal judge temporarily blocked his deportation while legal proceedings continued, and Khalil's lawyers filed a $20 million claim against the Trump administration alleging false imprisonment and First Amendment violations. An immigration judge ordered his release multiple times. DHS Deputy Secretary Troy Edgar defended the arrest but provided few details on deportation reasoning.

Khalil's case drew national attention and widespread protest, including demonstrations by New Orleans activists, Iowa State University students, and hundreds of SEIU workers who marched to ICE detention facilities in Louisiana's "detention alley." Columbia University stated ICE agents used false pretenses—posing as police seeking a missing person—to enter a university residence and detain a student. His case became a landmark test of whether the government can revoke legal residency based on protected speech and protest activity.`;

  const khalilTags = "Detained, Detention Conditions, LPR, Protester/Intervenor, Court Process Issue, Student, Officer Misconduct, Palestine Advocacy";

  await prisma.incident.update({
    where: { id: khalilPrimary },
    data: {
      headline: khalilHeadline,
      summary: khalilSummary,
      incidentType: khalilTags,
      altSources: JSON.stringify(allKhalilAlt),
      date: "3/8/2025",
      location: "New York, NY",
      country: "Palestine",
    }
  });

  await prisma.incident.deleteMany({ where: { id: { in: khalilDelete } } });
  console.log(`✓ Combined ${khalilIds.length} Mahmoud Khalil incidents into ID ${khalilPrimary}`);
  console.log(`  Deleted IDs: ${khalilDelete.join(", ")}`);
  console.log(`  Alt sources: ${allKhalilAlt.length} URLs`);

  // ========================================
  // COMBINE LEQAA KORDIA INCIDENTS
  // ========================================
  // IDs: 2187, 2167, 740, 546, 375, 2206, 891, 2121
  // Keep 2206 as primary (most detailed, has alt sources)

  const kordiaIds = [2187, 2167, 740, 546, 375, 2206, 891, 2121];
  const kordiaPrimary = 2206;
  const kordiaDelete = kordiaIds.filter(id => id !== kordiaPrimary);

  const kordiaIncidents = await prisma.incident.findMany({
    where: { id: { in: kordiaIds } },
    select: { id: true, url: true, altSources: true }
  });

  const kordiaUrls: string[] = [];
  for (const i of kordiaIncidents) {
    if (i.id !== kordiaPrimary) kordiaUrls.push(i.url);
    if (i.altSources) {
      try {
        const parsed = JSON.parse(i.altSources);
        kordiaUrls.push(...parsed);
      } catch {}
    }
  }

  const kordiaPrimaryInc = kordiaIncidents.find(i => i.id === kordiaPrimary)!;
  const existingKordiaAlt: string[] = kordiaPrimaryInc.altSources ? JSON.parse(kordiaPrimaryInc.altSources) : [];
  const allKordiaAlt = [...new Set([...existingKordiaAlt, ...kordiaUrls])];

  const kordiaHeadline = "Leqaa Kordia: Palestinian Woman Detained by ICE for Over a Year, Hospitalized After Seizure, Finally Released on Bond";
  const kordiaSummary = `Leqaa Kordia, a 33-year-old Palestinian woman from the West Bank who has lived in New Jersey since 2016, was detained by ICE in March 2025 after voluntarily meeting with immigration authorities regarding her visa status. Her arrest followed her participation in pro-Palestinian protests at Columbia University in 2024. She was held at Prairieland Detention Facility in Alvarado, Texas for over a year.

During her prolonged detention, Kordia was denied halal food and adequate prayer facilities. In February 2026, she was hospitalized for over 72 hours after suffering her first seizure while in the facility's medical unit—an event she attributed to the cruel conditions of confinement. Neither her family nor legal counsel were permitted access to her or information about her health status during hospitalization. She was shackled during her medical emergency.

Immigration judges ordered her release on bond three times. The Department of Homeland Security appealed the first two orders through automatic stays, keeping her detained. After the third ruling by Judge Tara Naselow-Nahas, who found insufficient evidence of flight risk, the government declined to challenge the decision, and Kordia was released on March 16, 2026 on a $100,000 bond.

The government investigated Kordia for allegations including money laundering and pro-Hamas activity related to $1,000 sent to relatives in Gaza, which her legal team disputed as unsupported. Her lawyers and advocacy groups, including Muslim Advocates, argued the detention was retaliatory for her protest activities. She was the last person still detained from the Trump administration's 2025 crackdown on pro-Palestinian activists on college campuses.`;

  const kordiaTags = "Detained, Detention Conditions, Visa / Legal Status, Protester/Intervenor, Court Process Issue, Injury/Illness/Medical, Officer Misconduct, Minor/Family, Palestine Advocacy";

  await prisma.incident.update({
    where: { id: kordiaPrimary },
    data: {
      headline: kordiaHeadline,
      summary: kordiaSummary,
      incidentType: kordiaTags,
      altSources: JSON.stringify(allKordiaAlt),
      date: "3/16/2026",
      location: "Alvarado, TX",
      country: "Palestine",
    }
  });

  await prisma.incident.deleteMany({ where: { id: { in: kordiaDelete } } });
  console.log(`\n✓ Combined ${kordiaIds.length} Leqaa Kordia incidents into ID ${kordiaPrimary}`);
  console.log(`  Deleted IDs: ${kordiaDelete.join(", ")}`);
  console.log(`  Alt sources: ${allKordiaAlt.length} URLs`);

  await prisma.$disconnect();
  console.log("\nDone!");
}

main().catch(console.error);
