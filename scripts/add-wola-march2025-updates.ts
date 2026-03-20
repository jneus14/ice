import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local"), override: true });

// WOLA border updates — March 2025 through March 2026
// (Jan-early March 2025 were submitted in add-wola-incidents.ts)
// Skipping: PDFs, CBP official pages, court dockets, pure policy pieces, senate PDFs,
//           pure statistics/aggregates, small unindexed outlets, non-US-based incidents

const URLS = [
  // ── April 4, 2025 ────────────────────────────────────────────────
  // Kilmar Abrego García — wrongly deported to El Salvador/CECOT
  "https://www.theatlantic.com/politics/archive/2025/03/an-administrative-error-sends-a-man-to-a-salvadoran-prison/682254/",
  "https://www.nytimes.com/2025/04/02/us/politics/maryland-man-deported-el-salvador-trump-criticism.html",
  // Venezuelan women rejected from deportation flights to El Salvador
  "https://www.usatoday.com/story/news/politics/2025/03/24/venezuelan-deportation-flights-salvador-women-rejected/82642086007/",
  // ICE Air deportation flight conditions
  "https://www.propublica.org/article/inside-ice-air-deportation-flights",
  // ICE deportation flight assault unreported
  "https://www.pogo.org/investigations/ice-deportation-flight-assault-goes-unreported-by-agency",
  // Migrants fall from border wall
  "https://timesofsandiego.com/crime/2025/04/01/one-killed-another-injured-after-falling-from-border-wall/",

  // ── April 11, 2025 ───────────────────────────────────────────────
  // Chinese woman dies by suicide in CBP custody, Yuma
  "https://www.azcentral.com/story/news/politics/border-issues/2025/04/04/woman-dies-by-suicide-while-in-border-patrol-custody-in-yuma/82884520007/",
  "https://www.nytimes.com/2025/04/04/us/chinese-woman-detained-suicide-border.html",
  // Kilmar Abrego García Supreme Court ruling
  "https://apnews.com/article/el-salvador-deportation-maryland-man-trump-617bfac0e54b241fa2f54783bdf08628",
  "https://www.politico.com/news/2025/04/04/el-salvador-deportation-ruling-trump-administration-00272872",
  // Venezuelans deported to El Salvador — 60 Minutes
  "https://www.cbsnews.com/news/venezuelan-migrants-deportations-el-salvador-prison-60-minutes/",
  // Gay Milwaukee stylist (Andry Hernández Romero) sent to El Salvador
  "https://www.jsonline.com/story/news/investigations/2025/04/10/fired-milwaukee-cops-report-helped-send-gay-stylist-to-el-salvador/83023882007/",
  // CBP officers arrested for bribes
  "https://www.nytimes.com/2025/04/07/us/us-border-officers-bribes-charged.html",
  "https://apnews.com/article/us-border-patrol-officers-arrested-bribes-5b08d80f56c526eec1f8f57f7abd20ff",

  // ── April 18, 2025 ───────────────────────────────────────────────
  // Kilmar Abrego García ProPublica investigation
  "https://www.propublica.org/article/abrego-garcia-el-salvador-deportation-wrongful-trump",
  "https://apnews.com/article/abrego-garcia-supreme-court-deportation-trump-el-salvador-8ab78dc30f7c0b3b6b2d0c27b1b3a0d1",

  // ── April 25, 2025 ───────────────────────────────────────────────
  // Venezuelans disappearing into ICE deportation system
  "https://www.nytimes.com/2025/04/22/us/venezuela-immigrant-disappear-deport-ice.html",
  "https://www.miamiherald.com/news/local/immigration/article304722511.html",
  // Venezuelan immigrant suicides in Detroit CBP/ICE detention
  "https://www.freep.com/story/news/local/michigan/detroit/2025/04/23/venezuelan-immigrant-detroit-suicide-cbp-ice-detention/83230005007/",
  // US citizen wrongly detained at border
  "https://popular.info/p/us-citizen-wrongly-detained-by-border",
  // 4-year-old migrant child in NYC immigration court without lawyer
  "https://gothamist.com/news/4-year-old-migrant-girl-other-kids-go-to-court-in-nyc-with-no-lawyer-the-cruelty-is-apparent",

  // ── May 2, 2025 ──────────────────────────────────────────────────
  // Haitian woman dies in ICE custody (Marie Ange Blaise)
  "https://www.usatoday.com/story/news/nation/2025/04/29/haitian-woman-dies-ice-custody/83352108007/",
  // US citizen deported
  "https://www.nytimes.com/2025/04/25/us/politics/us-citizen-deported.html",
  // Deported mothers / citizen children with cancer
  "https://www.nbcnews.com/news/latino/deported-moms-citizen-children-cancer-trump-officials-rcna203398",
  // Cuban mother separated from breastfeeding 1-year-old (Heidy Sánchez)
  "https://www.reuters.com/world/americas/deported-cuban-mother-separated-breastfeeding-1-year-old-daughter-2025-04-29/",
  // Family deported to Venezuela/El Salvador
  "https://www.nytimes.com/2025/04/29/world/americas/family-deported-trump-venezuela-el-salvador.html",
  // Trump administration dragnet sweeps teenager
  "https://www.theguardian.com/us-news/2025/apr/30/trump-administration-dragnet-teenager",
  // Unaccompanied immigrant children ICE
  "https://www.theguardian.com/us-news/2025/apr/28/ice-unaccompanied-immigrant-children",
  // Oklahoma City family traumatized by ICE raid
  "https://kfor.com/news/local/were-citizens-oklahoma-city-family-traumatized-after-ice-raids-home-but-they-werent-suspects/",
  // Colorado DEA/immigration raid
  "https://www.nytimes.com/2025/04/27/us/politics/immigrants-colorado-raid-dea.html",
  // Venezuelan families detained in Texas, fear El Salvador prison
  "https://www.theguardian.com/us-news/2025/apr/29/venezuelan-detained-families-el-salvador-latam-intl",
  "https://www.reuters.com/world/americas/sos-migrants-held-texas-fear-notorious-el-salvador-prison-2025-04-30/",
  // Investigation: El Salvador/CECOT Venezuelan removals (Bluebonnet)
  "https://www.motherjones.com/politics/2025/04/investigation-el-salvador-venezuelan-trump-removal-bluebonnet-cecot-bukele-alien-enemies-act-migrant-deportation/",
  // Immigrant families jailed in Texas (New Yorker)
  "https://www.newyorker.com/news/the-lede/the-immigrant-families-jailed-in-texas",

  // ── May 9, 2025 ──────────────────────────────────────────────────
  // 7 migrants die in first 100 days
  "https://english.elpais.com/usa/2025-05-05/lives-cut-short-in-ice-custody-seven-migrants-die-in-trumps-first-100-days.html",
  // Abrego García returned to US
  "https://www.nytimes.com/2025/05/02/us/abrego-garcia-mistakenly-deported.html",
  // US citizens caught in immigration crackdown
  "https://www.washingtonpost.com/immigration/2025/05/02/citizens-caught-trump-immigration-crackdown/",
  // Trump deportation / children separation
  "https://www.washingtonpost.com/immigration/2025/05/03/trump-deportation-children-separation/",
  // Homan secretly deported two US citizen children
  "https://www.thedailybeast.com/trumps-border-czar-tom-homan-secretly-deported-two-us-citizen-children-to-mexico/",
  // Immigrants in federal prisons
  "https://www.theguardian.com/us-news/2025/may/01/trump-immigrants-federal-prisons",
  // Migrant boat capsizes, dad in coma, kids killed
  "https://www.latimes.com/california/story/2025-05-07/migrant-boat-capsizes-dad-coma-kids-killed-5-charged",

  // ── May 16, 2025 ─────────────────────────────────────────────────
  // CBP rescinds policies on care of pregnant women and infants
  "https://www.wired.com/story/cbp-rescinds-policies-on-care-of-pregnant-women-infants/",
  // ORR/Office of Refugee Resettlement and enforcement
  "https://www.propublica.org/article/office-of-refugee-resettlement-immigration-enforcement-trump",

  // ── June 13, 2025 ────────────────────────────────────────────────
  // Kilmar Abrego García indicted
  "https://www.cbsnews.com/news/kilmar-abrego-garcia-indicted-us-el-salvador/",
  "https://abcnews.go.com/US/mistakenly-deported-kilmar-abrego-garcia-back-us-face/story?id=121333122",
  // Guatemalan deported to Mexico by mistake
  "https://www.nytimes.com/2025/06/04/us/politics/guatemalan-deported-mexico-trump.html",
  // Immigrant acquitted after military zone border prosecution
  "https://apnews.com/article/immigrant-acquitted-military-zone-border-texas-4455af1ea87e09d2fdecd563e2408203",

  // ── June 20, 2025 ────────────────────────────────────────────────
  // Latinos/US citizens detained in LA Home Depot raids
  "https://www.latimes.com/california/story/2025-06-15/latinos-targeted-in-raids-u-s-citizens-detained-indiscriminate-sweeps-home-depot-lots-targeted",
  "https://www.theguardian.com/us-news/2025/jun/16/los-angeles-immigration-raids-montebello",
  "https://www.nytimes.com/2025/06/15/us/hispanic-americans-raids-citizenship.html",
  // Migrant families/children detention
  "https://www.cnn.com/2025/06/17/politics/migrant-families-children-detention",
  // CECOT detainees losing asylum cases
  "https://www.huffpost.com/entry/cecot-detainees-us-immigration-court-asylum-dismissals_n_684c6a4be4b070091d777adc",
  // ICE arrests tortured Venezuelan asylum seeker
  "https://www.washingtonpost.com/world/2025/06/13/ice-arrests-tortured-venezuela-asylum-seeker/",
  // Texas Operation Lone Star border/El Paso migrant deaths
  "https://www.texastribune.org/2025/06/16/texas-operation-lone-star-border-el-paso-deaths-migrants-new-mexico/",
  // Smugglers using deadlier routes
  "https://www.nbcnews.com/news/us-news/migrant-smugglers-deadlier-routes-southern-border-rcna212899",

  // ── July 13, 2025 ────────────────────────────────────────────────
  // Immigrant detention conditions
  "https://www.nytimes.com/2025/06/28/us/immigrant-detention-conditions.html",
  // Masked armed agents in LA immigration raids (Bellingcat)
  "https://www.bellingcat.com/news/2025/07/08/masked-armed-and-forceful-finding-patterns-in-los-angeles-immigration-raids/",
  // Families allege horrible conditions at Alligator Alcatraz
  "https://www.nbcnews.com/news/latino/families-immigrant-detainees-allege-horrible-conditions-alligator-alca-rcna217743",
  // 'They're killing us' — immigrants in NYC holding site
  "https://gothamist.com/news/theyre-killing-us-immigrants-complain-of-inhumane-conditions-inside-nyc-holding-site",
  // Kilmar Abrego García — CECOT AP investigation
  "https://apnews.com/article/el-salvador-nayib-bukele-kilmar-abrego-garcia-cecot-trump-deportations-0c5b892e20bf32bd56619f9a2d0d79b9",
  // Whistleblower emails exposing Abrego García abuses
  "https://newrepublic.com/article/197793/kilmar-abrego-garcia-whistleblower-emails-expose-trump-abuses",

  // ── August 8, 2025 ───────────────────────────────────────────────
  // Venezuelans deported to El Salvador/CECOT — WaPo
  "https://www.washingtonpost.com/world/2025/07/31/venezuelans-deported-us-el-salvador-prison-cecot/",
  // Venezuelan men at CECOT — ProPublica interviews
  "https://www.propublica.org/article/venezuelan-men-cecot-interviews-trump",
  // Alligator Alcatraz may be illegal — Miami New Times
  "https://www.miaminewtimes.com/news/experts-say-floridas-alligator-alcatraz-migrant-camp-may-be-illegal-23755106",
  // Alligator Alcatraz former officer: inhumane conditions — NBC
  "https://www.nbcnews.com/news/us-news/alligator-alcatraz-former-officer-inhumane-conditions-rcna223355",
  // Trump family separation (August 2025)
  "https://www.nytimes.com/2025/08/05/us/politics/trump-administration-family-separation.html",
  // ICE/Border Patrol at Home Depot LA arrests
  "https://www.theguardian.com/us-news/2025/aug/06/ice-border-patrol-home-depot-los-angeles",
  "https://apnews.com/article/immigration-raids-aclu-lawsuit-los-angeles-trump-3bbcb0634ed57ede1897c89f76676094",
  // ICE attempt to quickly deport Arizona woman
  "https://www.latimes.com/politics/story/2025-08-04/ice-attempt-to-quickly-deport-arizona-woman-ignores-decades-of-precedent",
  // El Salvador border desert death — Rolling Stone
  "https://www.rollingstone.com/politics/politics-features/fled-el-salvador-died-new-mexico-sunland-park-triangle-1235395183/",

  // ── August 15, 2025 ──────────────────────────────────────────────
  // Alligator Alcatraz detainees denied medical treatment — NYT
  "https://www.nytimes.com/2025/08/08/us/alligator-alcatraz-detainees-medical-treatment.html",
  // COVID spreading at Alligator Alcatraz — Miami New Times
  "https://www.miaminewtimes.com/news/florida-wont-say-if-covid-is-spreading-at-alligator-alcatraz-23775882",
  // 26 Federal Plaza NYC — inhumane conditions / TRO
  "https://www.cbsnews.com/newyork/news/26-federal-plaza-nyc-ice-conditions-temporary-restraining-order-trump/",
  "https://www.thecity.nyc/2025/08/11/26-federal-plaza-judge-lewis-a-kaplan-ice-aclu-nyclu-make-road/",

  // ── September 5, 2025 ────────────────────────────────────────────
  // Unaccompanied children repatriated to Guatemala traumatized
  "https://www.cnn.com/2025/09/03/politics/migrant-children-repatriated-guatemala-scared",
  "https://apnews.com/article/immigration-unaccompanied-children-trump-deportations-guatemala-3790909d69f19fd8cd8edffb6b3215c3",
  // Alligator Alcatraz uprising
  "https://www.theguardian.com/us-news/2025/aug/29/alligator-alcatraz-uprising-florida-immigration",
  // Virginia ICE office — one meal a day
  "https://www.msnbc.com/msnbc/news/virginia-ice-office-one-meal-day-inhumane-conditions-rcna227976",
  // Washington firefighters arrested / detained at border
  "https://www.theguardian.com/us-news/2025/aug/28/washington-firefighters-arrests-detention-border",

  // ── September 12, 2025 ───────────────────────────────────────────
  // Flagstaff man dies while detained by ICE
  "https://azdailysun.com/news/local/crime-and-courts/flagstaff-man-dies-while-detained-by-immigration-and-customs-enforcement/article_30d9957b-996e-44e1-9e7e-b0311dcf8467.html",
  // Abrego García — Trump deportations
  "https://www.nytimes.com/2025/09/05/us/politics/trump-deportations-abrego-garcia-el-salvador.html",
  // George Retes — US citizen detained (The Atlantic)
  "https://www.theatlantic.com/politics/archive/2025/09/george-retes-ice-detained-us-citizen/684152/",
  // Family detention Dilley — 19th News
  "https://19thnews.org/2025/09/family-detention-dilley-texas/",
  // ICE detainees in hold rooms — CNN
  "https://www.cnn.com/2025/09/08/us/detainees-ice-immigrants-hold-rooms",
  // ICE detention prisons — WaPo
  "https://www.washingtonpost.com/immigration/2025/09/07/ice-detention-prisons-immigrants-trump/",
  // Enemies of the State — New Yorker
  "https://www.newyorker.com/magazine/2025/09/15/enemies-of-the-state",
  // Gay Venezuelan makeup artist (Andry Hernández Romero) rebuilds life
  "https://www.latimes.com/politics/story/2025-09-11/gay-venezuelan-makeup-artist-detained-in-san-diego-and-sent-to-el-salvador-prison-rebuilds-life",
  // ICE/CIA raid
  "https://www.nytimes.com/2025/09/10/us/politics/ice-cia-raid.html",
  // GlobalX airline deportation flights investigation
  "https://www.theguardian.com/us-news/ng-interactive/2025/sep/10/trump-globalx-airline-deportation-immigration",
  // Immigrants' school kids in DC — WaPo
  "https://www.washingtonpost.com/immigration/2025/09/11/immigrants-school-kids-trump-dc/",
  // Man deported to South Sudan then returned to Mexico
  "https://www.aljazeera.com/news/2025/9/6/mexico-accepts-return-of-man-deported-to-south-sudan-from-us",
  // US deportations to third countries — El País
  "https://english.elpais.com/usa/2025-09-05/us-deportations-to-third-countries-shrouded-in-secrecy.html",

  // ── September 19, 2025 ───────────────────────────────────────────
  // Silverio Villegas-González — ICE fatal shooting in Franklin Park IL
  "https://www.cbsnews.com/chicago/news/undocumented-father-killed-ice-agent-franklin-park-shooting/",
  "https://unraveledpress.com/what-happened-to-silverio-villegas-gonzalez/",
  // Estela Ramos death / deportation
  "https://www.msnbc.com/msnbc/news/death-estela-ramos-baten-deportation-nory-ice-rcna230912",
  // Trump family separations — WaPo
  "https://www.washingtonpost.com/immigration/2025/09/17/trump-immigration-family-separations-children/",
  // Lawyers fear 1,000 children separated
  "https://www.yahoo.com/news/articles/lawyers-fear-1-000-children-182738630.html",
  // ICE detention center violations — WaPo
  "https://www.washingtonpost.com/business/2025/09/16/ice-detention-center-immigration-violations/",
  // Alexandria staging facility — Guardian interactive
  "https://www.theguardian.com/us-news/ng-interactive/2025/sep/12/ice-detention-alexandria-staging-facility",
  // ICE detention health / homeland security — NYT
  "https://www.nytimes.com/2025/09/16/health/ice-homeland-security-immigration-detention.html",
  // ICE solitary confinement — USA Today
  "https://www.usatoday.com/story/news/nation/2025/09/17/ice-holding-immigrants-solitary-confinement/86168123007/",
  // Dilley children / Flores settlement
  "https://apnews.com/article/immigration-detention-trump-dilley-children-flores-settlement-ab13b37de2b5c1e8b198116c175a68eb",
  // Elgin man swept in Chicago immigration blitz
  "https://www.chicagotribune.com/2025/09/16/elgin-man-immigration-blitz-chicago/",
  // Extraordinary pursuit of Kilmar Abrego García — New Yorker
  "https://www.newyorker.com/news/the-lede/the-us-governments-extraordinary-pursuit-of-kilmar-abrego-garcia",
  // Narciso Barranco — ICE deportation with Marines
  "https://www.nytimes.com/2025/09/17/us/narciso-barranco-ice-deport-marines-trump.html",
  // Child-care workers detained in DC
  "https://19thnews.org/2025/09/child-care-workers-ice-dc-immigration/",

  // ── September 26, 2025 ───────────────────────────────────────────
  // DACA recipient dies in Adelanto detention (Ismael Ayala-Uribe)
  "https://austinkocher.substack.com/p/daca-recipient-dies-in-adelanto-detention",
  // Silverio Villegas-González — NYT interactive video
  "https://www.nytimes.com/interactive/2025/09/23/us/ice-shooting-chicago-video.html",
  // Franklin Park shooting — Chicago Sun-Times
  "https://chicago.suntimes.com/the-watchdogs/2025/09/22/ice-officer-injuries-nothing-major-deadly-franklin-park-shooting-mexican-immigrant-chicago-video",
  // Dallas ICE shooting — NYT
  "https://www.nytimes.com/2025/09/24/us/dallas-ice-shooting.html",
  // ICE migrant cells NYC — judge ruling
  "https://www.nytimes.com/2025/09/17/nyregion/ice-migrant-cells-judge-ruling.html",
  // ICE and crime victims
  "https://apnews.com/article/immigrants-crime-victims-ice-detention-u-visas-d616ca1c8762683639cdab1e61741f6a",
  // US citizen children separated from deported parents — CNN
  "https://www.cnn.com/2025/09/23/politics/us-citizen-children-separated-parents-deported-ice-invs",
  // ICE agent pushes woman in NYC
  "https://www.nytimes.com/2025/09/25/nyregion/ice-push-woman-nyc.html",

  // ── October 3, 2025 ──────────────────────────────────────────────
  // Dallas ICE shooting — wife speaks out
  "https://www.npr.org/2025/09/27/nx-s1-5555467/wife-of-immigrant-injured-at-dallas-ice-facility-shooting-speaks-out",
  "https://www.washingtonpost.com/immigration/2025/09/30/ice-dallas-immigrant-shot-attack/",
  // Chicago ICE shooting (Marimar Martinez / Anthony Santos Ruiz) — DHS video
  "https://www.washingtonpost.com/immigration/2025/09/28/ice-officers-chicago-shooting-dhs-video/",
  // ICE arresting US citizens — NYT
  "https://www.nytimes.com/2025/09/29/us/trump-immigration-agents-us-citizens.html",
  // ICE officer who pushed woman returns to duty
  "https://www.cbsnews.com/newyork/news/ice-officer-pushed-woman-video-returns-to-duty/",
  // ICE officer journalist altercation NYC
  "https://www.cbsnews.com/newyork/news/ice-officer-journalist-altercation-nyc/",
  // 79-year-old US citizen body-slammed by ICE
  "https://abcnews.go.com/US/79-year-us-citizen-claims-ice-agents-body/story?id=125978834",
  // ICE tactics inflame tensions — Reuters
  "https://www.reuters.com/world/us/ice-tactics-inflame-tensions-new-york-chicago-other-cities-2025-09-26/",
  // Immigrants at California detention facility — Guardian
  "https://www.theguardian.com/us-news/2025/sep/27/immigrants-california-detention-facility",
  // Alligator Alcatraz conditions — HuffPost
  "https://www.huffpost.com/entry/alligator-alcatraz-immigration-jail_n_68d6a319e4b0185d00688297",
  // Rapid transfers of ICE detainees — LA Times
  "https://www.latimes.com/politics/story/2025-09-26/faster-more-frequent-transfers-of-immigrant-ice-detainees-sow-fear-and-cut-off-resources",
  // ICE immigrant families at O'Hare — Chicago Tribune
  "https://www.chicagotribune.com/2025/09/29/ice-immigrant-families-ohare/",
  // Massive ICE raid Chicago apartment building — WBEZ
  "https://www.wbez.org/immigration/2025/10/01/massive-immigration-raid-on-chicago-apartment-building-leaves-residents-reeling-i-feel-defeated",
  "https://abc7chicago.com/post/ice-chicago-federal-agents-surround-south-shore-apartment-building-dhs-requests-military-deployment-illinois/",
  // DC class action over warrantless arrests
  "https://www.courthousenews.com/dc-residents-file-class-action-over-warrantless-immigration-arrests-amid-federal-crackdown/",

  // ── October 10, 2025 ─────────────────────────────────────────────
  // Marimar Martinez — Border Patrol shoots woman in Chicago Brighton Park
  "https://www.reuters.com/world/us/border-patrol-agents-shoot-woman-chicago-protesters-confront-immigration-2025-10-04/",
  "https://chicago.suntimes.com/news/2025/10/04/shooting-involving-federal-agents-in-brighton-park-under-investigation",
  "https://chicago.suntimes.com/news/2025/10/06/marimar-martinez-anthony-ian-santos-ruiz-border-patrol-shooting-brighton-park",
  // CBP raid sweeps citizens and families in Chicago — Reuters
  "https://www.reuters.com/world/us/us-border-patrol-raid-sweeps-citizens-families-chicago-crackdown-intensifies-2025-10-04/",
  // ICE extreme force against protesters/journalists — Guardian
  "https://www.theguardian.com/us-news/2025/oct/04/ice-chicago-extreme-force-protesters-journalists",
  // ICE tear gas, pepper spray, lawsuits — Mother Jones
  "https://www.motherjones.com/politics/2025/10/ice-federal-agents-tear-gas-pepper-spray-chicago-broadview-lawsuits/",
  // ICE detention and civil rights — NPR
  "https://www.npr.org/2025/10/06/g-s1-91947/trump-ice-detention-civil-rights",
  // Federal judge: ICE violated consent decree in Chicago
  "https://blockclubchicago.org/2025/10/07/ice-violated-consent-decree-with-warrantless-arrests-federal-judge-in-chicago-says/",
  "https://www.chicagotribune.com/2025/10/08/federal-judge-chicago-ice-violated-consent-decree/",
  // ICE minors detention/deportation — Politico
  "https://www.politico.com/news/2025/10/04/ice-minors-detention-deportation-00594267",
  // Migrant children Trump deportation — WaPo
  "https://www.washingtonpost.com/immigration/2025/10/03/migrant-children-trump-deportation-immigrants/",

  // ── October 17, 2025 ─────────────────────────────────────────────
  // Chicago ICE operations — NYT
  "https://www.nytimes.com/2025/10/14/us/chicago-ice-trump.html",
  // ICE crash, tear gas, detentions — Chicago East Side
  "https://chicago.suntimes.com/immigration/2025/10/14/crash-involving-immigration-agents-in-east-side-leads-to-tear-gas-detentions",
  // Teen tossed to ground by ICE — CBS Chicago
  "https://www.cbsnews.com/chicago/news/teen-tossed-to-ground-by-ice/",
  // ICE fines Chicago man for not having papers
  "https://www.chicagotribune.com/2025/10/13/ice-fines-chicago-man-for-not-having-papers-on-him/",
  // Border patrol chase kills migrants in El Paso car crash
  "https://www.elpasotimes.com/story/news/immigration/2025/10/13/border-patrol-chase-mexico-guatemala-migrants-killed-in-el-paso-texas-car-crash-west-paisano-drive/86679918007/",
  // ICE detention pregnant immigrants — The Intercept
  "https://theintercept.com/2025/10/10/ice-detention-pregnant-immigrants/",
  // 13-year-old detained by ICE in Boston/Everett
  "https://www.bostonglobe.com/2025/10/12/metro/everett-13-year-old-arrested-by-ice/",
  "https://www.cnn.com/2025/10/15/us/13-year-old-detained-ice-boston",
  // Portland mom, US citizen kids — CBP disappears her (Rolling Stone)
  "https://www.rollingstone.com/politics/politics-features/trump-cbp-disappears-portland-mom-citizen-kids-1235444180/",
  // ICE Irwin Georgia detention — forced gynecological procedures
  "https://theintercept.com/2025/10/11/ice-georgia-irwin-detention-center-gynecological-procedures/",
  // Deportations and civil rights — AP
  "https://apnews.com/article/immigration-deportations-trump-administration-civil-rights-84309f534c601befa6e9faeae78bcff5",
  // Silverio Villegas — children placed in foster care Idaho
  "https://www.chicagotribune.com/2025/10/12/silverio-villegas-children-foster-care-idaho/",

  // ── October 24, 2025 ─────────────────────────────────────────────
  // Pregnant women miscarrying/bleeding in ICE custody
  "https://www.nbcnews.com/news/us-news/pregnant-women-describe-miscarrying-bleeding-ice-custody-advocates-say-rcna238849",
  "https://19thnews.org/2025/10/ice-detaining-pregnant-nursing-immigrants/",
  // US Marshal shooting in immigration arrest
  "https://apnews.com/article/us-marshal-shooting-immigration-arrest-c62f45d385f7295adcf742f3af75f880",
  // ProPublica: ICE Americans detained investigation
  "https://www.propublica.org/article/immigration-ice-americans-detained-joint-congressional-investigation",
  // Immigrant detainees hungry in ICE detention — USA Today
  "https://www.usatoday.com/story/news/nation/2025/10/19/immigrant-detainees-hungry-in-ice-detention/86163312007/",
  // Chicago apartment raid — Chicago Tribune
  "https://www.chicagotribune.com/2025/10/19/ice-chicago-apartment-raid/",
  // Chicago schools, ICE, National Guard — The Intercept
  "https://theintercept.com/2025/10/19/chicago-schools-ice-national-guard-trump/",
  // Bovino questioned on tear gas — Chicago Sun-Times
  "https://chicago.suntimes.com/immigration/2025/10/23/judge-allows-further-questioning-of-border-patrol-commander-greg-bovino-as-hes-hit-with-new-tear-gas-claims",
  // Chicago South Shore BP raid — NYT
  "https://www.nytimes.com/2025/10/19/us/chicago-south-shores-border-patrol-raid.html",
  // Families torn apart / renewed threat of separation — KQED
  "https://www.kqed.org/news/12060135/families-once-torn-apart-at-border-face-renewed-threat-of-separation",

  // ── October 31, 2025 ─────────────────────────────────────────────
  // Honduran immigrant dies trying to flee ICE
  "https://www.theguardian.com/us-news/2025/oct/25/honduran-immigrant-dies-trying-to-flee-ice",
  // Federal agent shooting coverup — Washington City Paper
  "https://www.washingtoncitypaper.com/article/773235/federal-agent-shot-coverup-mpd-police-report/",
  // ICE lost 3,000 immigrant arrestees in Chicago — NBC Chicago
  "https://www.nbcchicago.com/investigations/could-ice-have-lost-3000-immigrant-arrestees-in-chicago/3844220/",
  // Judge to question Bovino on tear gas — Chicago Tribune
  "https://www.chicagotribune.com/2025/10/28/judge-to-question-bovino-tear-gas/",
  // US citizen choked and slurred at Houston ICE arrest
  "https://www.houstonchronicle.com/news/houston-texas/immigration/article/ice-houston-citizen-choked-slurs-21122087.php",
  // US citizen assaulted by Border Patrol at Chicago Halloween parade
  "https://www.independent.co.uk/news/world/americas/us-politics/us-citizen-assaulted-border-patrol-chicago-halloween-parade-b2853988.html",
  // DHS/ICE fines immigrant teenagers
  "https://www.theintercept.com/2025/10/24/dhs-ice-immigrant-teenagers-detention-fines/",
  // Straitjackets and military aircraft — migrants disappear to Africa
  "https://english.elpais.com/usa/2025-10-26/straitjackets-and-military-aircraft-how-the-trump-administration-is-making-dozens-of-migrants-disappear-in-africa.html",

  // ── November 7, 2025 ─────────────────────────────────────────────
  // ICE shot US citizen from behind as he warned about children — LA Times
  "https://www.latimes.com/california/story/2025-11-02/lawyers-say-ice-shot-us-citizen-from-behind-as-he-stopped-to-warn-them-of-childre",
  "https://www.latimes.com/california/story/2025-10-30/dhs-officers-ontario-shooting",
  // Immigrant wrongly deported to Mexico — NYT
  "https://www.nytimes.com/2025/10/30/nyregion/immigrant-wrongly-deported-mexico.html",
  // ICE arrests of US citizens — Reason
  "https://reason.com/2025/10/31/ices-mass-arrests-ensnare-u-s-citizens-and-show-no-signs-of-stopping/",
  // ICE detention medical neglect, food/water — AP/Ossoff investigation
  "https://apnews.com/article/immigration-detention-medical-ice-food-ossoff-investigation-e218486607c04040c94561699e1d0054",
  // Batavia ICE medical care Buffalo — The Intercept
  "https://theintercept.com/2025/11/06/batavia-ice-medical-care-buffalo/",
  // Halloween immigration raids in Evanston — Chicago Tribune
  "https://www.chicagotribune.com/2025/10/31/chicag-halloween-immigration-raids-evanston/",
  // Illinois immigration protests — Bellingcat
  "https://www.bellingcat.com/news/2025/10/31/illinois-immigration-protests/",
  // Chicago immigration enforcement, children, tear gas — NBC
  "https://www.nbcnews.com/news/us-news/chicago-immigration-enforcement-children-tear-gas-border-patrol-rcna241629",
  // 911 calls from Midway Blitz, Little Village — Chicago Tribune
  "https://www.chicagotribune.com/2025/11/03/911-calls-midway-blitz-little-village/",
  // Immigrant crime victims — LA Times
  "https://www.latimes.com/california/story/2025-11-03/immigrant-crime-victims",
  // ICE black sites inside US offices — Inquisitr
  "https://www.inquisitr.com/ice-accused-of-holding-migrants-in-black-sites-hidden-inside-u-s-offices",

  // ── November 14, 2025 ────────────────────────────────────────────
  // Bovino deposition Chicago — CNN
  "https://www.cnn.com/2025/11/06/us/gregory-bovino-deposition-chicago-immigration",
  // Rafael Veraza Chicago ICE — WaPo
  "https://www.washingtonpost.com/immigration/2025/11/11/ice-chicago-rafael-veraza/",
  // Border Patrol agent bragged about shooting — Mother Jones
  "https://www.motherjones.com/politics/2025/11/a-border-patrol-agent-bragged-about-shooting-someone-texts-show/",
  // ICE raid Los Angeles — toddler — NYT
  "https://www.nytimes.com/2025/11/07/us/immigration-raid-los-angeles-toddler.html",
  // Federal judge: ICE daycare arrest illegal
  "https://www.chicagotribune.com/2025/11/12/federal-judge-illegal-ice-arrest-day-care-teacher/",
  // Parents deported: guardianship plans — WaPo
  "https://www.washingtonpost.com/nation/2025/11/11/parents-deportation-guardianship-plans/",
  // Reuters: migrants at largest US detention camp — foul water, rotten food
  "https://www.reuters.com/world/us/migrants-largest-us-detention-camp-face-foul-water-rotten-food-congresswoman-2025-11-11",
  // HRW: Torture and abuse of Venezuelans at CECOT
  "https://www.hrw.org/report/2025/11/12/you-have-arrived-in-hell/torture-and-other-abuses-against-venezuelans-in-el",

  // ── November 21, 2025 ────────────────────────────────────────────
  // ICE detainee death — family questions hands/feet tied — Newsweek
  "https://www.newsweek.com/ice-detainee-death-family-questions-hands-feet-tied-11066992",
  // Sanford grandfather — 70 years in US — nabbed by ICE — Orlando Sentinel
  "https://www.orlandosentinel.com/2025/11/16/sanford-grandfather-born-in-refugee-camp-nabbed-by-ice-after-70-years-in-u-s/",
  // Trump deportations and families — NYT
  "https://www.nytimes.com/2025/11/14/us/trump-deportations-families.html",
  // Blind immigrant ordered released from ICE detention — Orlando Sentinel
  "https://www.orlandosentinel.com/2025/11/18/nyregion/blind-immigrant-ice-detention-judge-orders-release.html",
  // Native American woman nearly deported — Iowa Public Radio
  "https://www.iowapublicradio.org/ipr-news/2025-11-13/native-american-woman-nearly-deported-after-polk-county-jail-issues-ice-detainer-by-mistake",
  // Chicago Venezuela ICE/FBI raids — no criminal charges — ProPublica
  "https://www.propublica.org/article/chicago-venezuela-immigration-ice-fbi-raids-no-criminal-charges",
  // Rayito daycare ICE raid — Mother Jones
  "https://www.motherjones.com/politics/2025/11/rayito-chicago-immigration-ice-raid/",
  // Latino US citizens racially profiled in Chicago — Chicago Tribune
  "https://www.chicagotribune.com/2025/11/15/latino-us-citizens-racially-profiled-immigration-chicago/",
  // Trump administration immigration crackdown — Popular Info
  "https://popular.info/p/exclusive-how-the-trump-administration",

  // ── December 12, 2025 ────────────────────────────────────────────
  // Guatemalan immigrant dies at Camp East Montana
  "https://www.elpasotimes.com/story/news/immigration/2025/12/09/guatemalan-immigrant-held-at-camp-east-montana-dies/87685721007/",
  // Migrant families ICE detention Texas — CNN
  "https://www.cnn.com/2025/12/09/politics/migrant-families-ice-detention-facility-texas",
  // ICE detainees abuse at Fort Bliss — ACLU/WaPo
  "https://www.washingtonpost.com/business/2025/12/08/ice-detainees-abuse-aclu-fort-bliss/",
  // Abrego García deportation — AP
  "https://apnews.com/article/abrego-garcia-el-salvador-deportation-31160936c51932f74b717eb1143edd55",
  // Adelita Grijalva pepper sprayed at ICE protest — The Intercept
  "https://theintercept.com/2025/12/05/adelita-grijalva-pepper-spray-ice-protest/",
  // Chicago experts: immigration agents using poor/unsafe tactics — Chicago Tribune
  "https://www.chicagotribune.com/2025/12/07/experts-immigration-agents-poor-tactics-unsafe-policing/",
  // ICE bodycam video Chicago — NYT
  "https://www.nytimes.com/2025/12/10/us/politics/ice-bodycam-video-chicago.html",
  // Cicero mother, baby in NICU, ICE detention — WBEZ
  "https://www.wbez.org/immigration/2025/12/08/cicero-mother-baby-nicu-ice-detention-trump-broadview-postpartum-immigration-deportation-campaign",

  // ── January 9, 2026 ──────────────────────────────────────────────
  // Minneapolis ICE shooting video analysis — CNN
  "https://www.cnn.com/2026/01/07/us/minneapolis-shooting-ice-video-analysis-vis",
  // ICE shootings Minneapolis and other cities — NYT
  "https://www.nytimes.com/2026/01/07/us/ice-shootings-minneapolis-other-cities.html",
  // DHS lying about shooting a woman — 404 Media
  "https://www.404media.co/dhs-is-lying-to-you-about-ice-shooting-a-woman/",
  // Motorist shootings / vehicle as weapon — NYT
  "https://www.nytimes.com/2026/01/07/us/motorist-shootings-vehicle-weapon.html",
  // Chicago shooting, ICE killing, Minneapolis — The Intercept
  "https://theintercept.com/2026/01/07/chicago-shooting-ice-killing-minneapolis/",
  // Abrego García — DOJ charges — NYT
  "https://www.nytimes.com/2025/12/30/nyregion/abrego-garcia-charges-doj.html",
  // Bovino / Abrego García sanctions — Law Dork
  "https://www.lawdork.com/p/gregory-bovino-kilmar-abrego-garcia-sanctions",
  // Abrego García prosecution after wrongful deportation order — CBS
  "https://www.cbsnews.com/news/abrego-garcia-prosecution-push-began-after-wrongful-deportation-court-order/",
  // Bovino arrest US citizens — New Republic
  "https://newrepublic.com/post/204835/cbp-official-greg-bovino-arrest-us-citizens",
  // Chicago immigration citizen arrests/charges — Chicago Tribune
  "https://www.chicagotribune.com/2025/12/30/chicago-immigration-citizen-arrests-charges/",
  // LA ICE protests, tow truck — The Intercept
  "https://theintercept.com/2025/12/31/trump-ice-protests-tow-truck-los-angeles/",
  // Trump stopped reuniting detained migrant children with families — HPPR
  "https://www.hppr.org/hppr-news/2026-01-01/the-trump-administration-has-all-but-stopped-reuniting-detained-migrant-children-with-families",

  // ── January 24, 2026 ─────────────────────────────────────────────
  // Third detainee death at Camp East Montana (Victor Manuel Diaz)
  "https://www.nbcnews.com/news/us-news/third-immigrant-detainee-facility-el-paso-died-ice-says-rcna254783",
  "https://www.texastribune.org/2026/01/21/texas-el-paso-immigrant-death-ice-custody-homicide/",
  "https://www.washingtonpost.com/business/2026/01/21/ice-homicide-detainee-death-autopsy/",
  // El Paso widow: ICE failed husband in custody
  "https://www.elpasotimes.com/story/news/immigration/2025/12/19/immigration-news-widow-says-ice-failed-husband-in-custody/87786319007/",
  // Cuban immigrant death in ICE custody — NYT
  "https://www.nytimes.com/2026/01/20/us/politics/cuban-immigrant-death-ice-custody.html",
  // Detainee death — witnesses deported — WaPo
  "https://www.washingtonpost.com/immigration/2026/01/17/detainee-death-witnesses-deported-dhsa/",
  // Four migrants die in ICE custody in first 10 days of 2026 — Reuters
  "https://www.reuters.com/legal/government/four-migrants-die-us-ice-custody-over-first-10-days-2026-2026-01-12/",
  // ICE death — Costa Rican Randall Gamboa Esquivel — Guardian
  "https://www.theguardian.com/us-news/2026/jan/11/ice-death-costa-rica-randall-gamboa-esquivel",
  // Victor Manuel Diaz — third death at Camp East Montana — El Paso Times
  "https://www.elpasotimes.com/story/news/immigration/2026/01/18/third-immigrant-dies-at-ice-camp-east-montana-in-el-paso-victor-manuel-diaz-of-nicaragua/88243759007/",
  // Pregnant woman deported from Atlanta — Guardian
  "https://www.theguardian.com/us-news/2026/jan/21/pregnant-woman-ice-deportation-atlanta",
  // ICE shootings list — NBC
  "https://www.nbcnews.com/news/us-news/ice-shootings-list-border-patrol-trump-immigration-operations-rcna254202",
  // ACLU TX: abusive and sexual contact — inhumane conditions
  "https://www.aclutx.org/press-releases/aclu-texas-human-rights-groups-reveal-abusive-and-sexual-contact-other-inhumane/",

  // ── February 6, 2026 ─────────────────────────────────────────────
  // El Paso migrant death ICE custody autopsy / prosecution — Texas Tribune
  "https://www.texastribune.org/2026/01/29/texas-el-paso-migrant-death-ice-custody-autopsy-prosecution/",
  // Nicaraguan migrant's death at Camp East Montana — Border Report
  "https://www.borderreport.com/news/family-questions-federal-investigation-of-nicaraguan-migrants-death-at-camp-east-montana/",
  // Minneapolis ICE shooting (Alex Pretti) — Marshall Project
  "https://www.themarshallproject.org/2026/01/26/ice-minneapolis-shooting-alex-pretti",
  // Immigration ICE shootings tracker — The Trace
  "https://www.thetrace.org/2025/12/immigration-ice-shootings-guns-tracker/",
  // Alex Pretti shooting — NYT
  "https://www.nytimes.com/2026/01/26/us/alex-pretti-shooting-federal-agents-force.html",
  // 1,000+ alleged rights abuses in immigration detention — AJC/Ossoff
  "https://www.ajc.com/news/2026/01/more-than-1000-alleged-rights-abuses-in-immigration-detention-ossoff-finds/",
  // DHS surveillance footage from abuse case deleted — 404 Media
  "https://www.404media.co/dhs-says-critical-ice-surveillance-footage-from-abuse-case-was-actually-never-recorded-doesnt-matter/",
  // Immigrant families, sick kids in detention — USA Today
  "https://www.usatoday.com/story/news/nation/2026/01/29/immigrant-families-conditions-detention-sick-kids/88405597007/",
  // ICE Dilley measles cases — CBS
  "https://www.cbsnews.com/news/ice-dilley-center-texas-measles-cases/",
  // Protest at Dilley — 5-year-old Liam Ramos — TPR
  "https://www.tpr.org/border-immigration/2026-01-24/protest-breaks-out-at-dilley-immigration-detention-facility-holding-5-year-old-liam-ramos",
  // Liam Ramos ICE release — NYT
  "https://www.nytimes.com/2026/01/31/us/politics/liam-ramos-ice-release.html",
  // Liam Conejo Ramos — DHS expedited deportation proceedings — MPR
  "https://www.mprnews.org/story/2026/02/05/liam-conejo-ramos-dhs-requests-expedited-deportation-proceedings-for-family",
  // Videos: ICE/DHS using chokeholds on citizens — ProPublica
  "https://www.propublica.org/article/videos-ice-dhs-immigration-agents-using-chokeholds-citizens",
  // Police chiefs fume at ICE tactics — NYT
  "https://www.nytimes.com/2026/01/30/us/its-all-just-going-down-the-toilet-police-chiefs-fume-at-ice-tactics.html",
  // El Paso BORTAC crew rampaging through Midwest — Unraveled Press
  "https://unraveledpress.com/identified-the-el-paso-bortac-crew-rampaging-through-the-midwest/",
  // Ace of spades card left at ICE detentions — Colorado Sun
  "https://coloradosun.com/2026/01/23/ace-of-spades-card-ice-detentions/",
  "https://theintercept.com/2026/02/03/ice-death-cards-ace-of-spades-colorado/",
  // Border Patrol history of aggression — NYT
  "https://www.nytimes.com/2026/02/03/us/politics/border-patrol-history-aggression.html",
  // Concerns over Camp East Montana — El Paso Times
  "https://www.elpasotimes.com/story/news/immigration/2026/02/05/us-rep-veronica-escobar-voices-new-concerns-over-camp-east-montana/88493821007/",
  // Texas judge accuses US of cruelty in detainee release order — Bloomberg Law
  "https://news.bloomberglaw.com/us-law-week/texas-judge-accuses-us-of-cruelty-in-ordering-detainee-release",

  // ── February 20, 2026 ────────────────────────────────────────────
  // Life inside ICE Dilley with children — ProPublica
  "https://www.propublica.org/article/life-inside-ice-dilley-children",
  // 2-month-old baby unresponsive, sent back to ICE facility — Barbed Wire
  "https://thebarbedwire.com/2026/02/17/2-month-old-baby-juan-nicolas-unresponsive-hospital-sent-back-to-ice-facility/",
  // Irish man held at ICE camp under scrutiny for unexplained deaths — Irish Times
  "https://www.irishtimes.com/world/us/2026/02/10/ice-detention-camp-where-irishman-is-held-under-scrutiny-for-unexplained-deaths/",
  // DHS immigration protests injuries / less-lethal weapons — NBC
  "https://www.nbcnews.com/news/us-news/trump-DHS-immigration-protests-injuries-less-lethal-weapons-force-rcna258388",
  // ICE health care CoreCivic immigrants detention — NYT
  "https://www.nytimes.com/2026/02/14/business/ice-health-care-corecivic-immigrants-detention.html",
  // Baltimore ICE detention overcrowding whistleblower — WUSA9
  "https://www.wusa9.com/article/news/investigations/ice-detention-facility-overcrowding-baltimore-whistleblower-DHS-unsanitary-trump/65-03dda8d7-49a9-4caf-b001-db5e12a04158",
  // California judge orders adequate healthcare at ICE detention — LA Times
  "https://www.latimes.com/california/story/2026-02-11/california-judge-orders-government-to-provide-constitutionally-adequate-healthcare-at-ice-detention-center",
  // Captive lotion bottle note — La Taco
  "https://lataco.com/captive-lotion-bottle-note",
  // Parents deported without knowing where kids are — HuffPost
  "https://www.huffpost.com/entry/parents-deported-without-knowing-where-kids-are_n_698ca60ae4b080ae0a811345",
  // Immigrant detention/deportation to foster care — Notus
  "https://www.notus.org/immigration/immigrant-detention-deportation-foster-care-data",
  // Texas pregnant migrants shelter — KUT
  "https://www.kut.org/politics/2026-02-11/texas-trump-immigration-pregnant-migrants-shelter",
  // Migrant children ICE detention — NYT
  "https://www.nytimes.com/2026/02/13/us/migrant-children-ice-detention.html",
  // Staff at Dilley confiscating kids' letters and drawings — SA Current
  "https://www.sacurrent.com/news/san-antonio-news/report-staff-at-dilley-raiding-cells-to-confiscate-kids-letters-and-drawings-detailing-conditions-inside/",
  // Pregnant/postpartum/nursing women in ICE custody — Reproductive Rights
  "https://reproductiverights.org/news/pregnant-postpartum-nursing-women-ice-custody/",
  // ICE officials use of force — Politico
  "https://www.politico.com/news/2026/02/17/ice-officials-use-of-force-00782501",

  // ── March 6, 2026 ────────────────────────────────────────────────
  // Tucson area ICE deaths (Francisco Gaspar-Andres area)
  "https://tucson.com/news/local/border/article_a5053df1-4ade-4424-972f-e9f5270829bb.html",
  // Alberto Gutierrez Reyes dies at Adelanto ICE facility — ABC7 LA
  "https://abc7.com/post/alberto-gutierrez-reyes-westlake-dies-ice-custody-adelanto-facility-according-la-councilmember-eunisses-hernandez/18672280/",
  // Haitian asylum seeker dies of toothache in ICE custody — Austin Kocher
  "https://austinkocher.substack.com/p/haitian-asylum-seeker-dies-of-toothache",
  // Second immigrant death in ICE custody — Austin Kocher
  "https://austinkocher.substack.com/p/second-immigrant-death-in-ice-custody",
  // Texas ICE detention death / use of force at Camp East Montana — Texas Tribune
  "https://www.texastribune.org/2026/02/20/texas-ice-detention-death-use-of-force-camp-east-montana/",
  // Fort Bliss detention center closes — WaPo
  "https://www.washingtonpost.com/immigration/2026/03/04/trump-administration-closes-fort-bliss-detention-center/",
  // Measles at Camp East Montana / Dilley / El Paso — Texas Tribune
  "https://www.texastribune.org/2026/03/03/texas-ice-detention-measles-east-montana-dilley-el-paso/",
  // Children in detention Dilley — AP
  "https://apnews.com/article/children-immigration-detention-dilley-trump-administration-ice-8ab12c9357ff3b8d400cfa2b2dbe85ed",
  // Dilley detention center — kids' art removal — ProPublica
  "https://www.propublica.org/article/dilley-detention-center-kids-art-removal",
  // ICE Dilley children letters — ProPublica
  "https://www.propublica.org/article/ice-dilley-children-letters",
  // 911 calls: kids struggling to breathe in ICE detention Texas — NBC
  "https://www.nbcnews.com/news/us-news/911-calls-kids-struggling-breathe-ice-detention-texas-immigration-rcna260595",
  // 911 calls ICE detention center — ABC News
  "https://abcnews.go.com/US/911-calls-ice-detention-center-underscore-concerns-conditions/story?id=130731700",
  // Bovino criminal investigation — Mother Jones
  "https://www.motherjones.com/mojo-wire/2026/03/cbp-border-patrol-bovino-minneapolis-criminal-investigation/",
  // Bovino investigation DHS — NYT
  "https://www.nytimes.com/2026/03/03/us/greg-bovino-investigation-dhs.html",
  // ICE training cuts / graduation rate — WaPo
  "https://www.washingtonpost.com/investigations/2026/03/03/ice-training-cuts-graduation-rate/",
  // ICE deportation officers training — CNN
  "https://www.cnn.com/2026/02/27/us/ice-deportation-officers-training-agents-invs",
  // Former ICE instructor: agency slashed training — WaPo
  "https://www.washingtonpost.com/immigration/2026/02/23/former-ice-instructor-says-agency-slashed-training-new-officers/",
  // ICE whistleblower: recruits receiving defective training — CBS
  "https://www.cbsnews.com/news/ice-whistleblower-new-recruits-receiving-defective-training/",
  // El Paso concerns over ICE plans to hold immigrants in Socorro
  "https://www.elpasotimes.com/story/news/immigration/2026/03/03/borderland-residents-raise-concern-about-ice-plans-to-hold-immigrants-in-socorro/88702938007/",
];

// Deduplicate
const DEDUPED = [...new Set(URLS)];

async function submitUrl(url: string, key: string): Promise<{ created: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://hiproject.org/api/submit?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`,
      { method: "GET" }
    );
    const data = await res.json();
    if (res.status === 200 || res.status === 201) {
      return { created: true, message: `id=${data.id ?? "?"}` };
    } else if (res.status === 409) {
      return { created: false, message: "already exists" };
    } else {
      return { created: false, message: `error ${res.status}: ${JSON.stringify(data).slice(0, 80)}` };
    }
  } catch (err: any) {
    return { created: false, message: `fetch error: ${err.message}` };
  }
}

async function main() {
  const key = process.env.SUBMIT_KEY;
  if (!key) { console.error("SUBMIT_KEY not found"); process.exit(1); }

  console.log(`Submitting ${DEDUPED.length} WOLA-sourced articles (March 2025 – March 2026)...\n`);
  let created = 0, skipped = 0, errors = 0;

  for (const url of DEDUPED) {
    const { created: ok, message } = await submitUrl(url, key);
    const icon = ok ? "✓" : message.includes("already exists") ? "–" : "✗";
    console.log(`${icon} ${message.padEnd(22)} ${url.slice(0, 100)}`);
    if (ok) created++;
    else if (message.includes("already exists")) skipped++;
    else errors++;
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nDone: ${created} new, ${skipped} already existed, ${errors} errors`);
}

main().catch(console.error);

export {};
