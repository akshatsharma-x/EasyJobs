import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("mnc-other", `
# ── Retail, e-commerce & consumer ──
Walmart | walmart.com | mnc gcc product | Bentonville, US | in p1 | wd:https://walmart.wd5.myworkdayjobs.com/WalmartExternal url:https://careers.walmart.com/ | Walmart Global Tech; Walmart Global Tech India; Walmart Labs
Target | target.com | mnc gcc | Minneapolis, US | in p1 | wd:https://target.wd5.myworkdayjobs.com/targetcareers url:https://corporate.target.com/careers | Target Corporation India
Lowe's | lowes.com | mnc gcc | Mooresville, US | in p1 | wd:https://lowes.wd5.myworkdayjobs.com/LWS_External_CS url:https://talent.lowes.com/ | Lowe's India; Lowes
The Home Depot | homedepot.com | mnc gcc | Atlanta, US | in | wd:https://homedepot.wd5.myworkdayjobs.com/CareerDepot | Home Depot
Kroger | kroger.com | mnc | Cincinnati, US | - | wd:https://kroger.wd5.myworkdayjobs.com/External
Costco | costco.com | mnc | Issaquah, US | - | -
Best Buy | bestbuy.com | mnc | Richfield, US | - | wd:https://bestbuy.wd5.myworkdayjobs.com/BestBuyCareers
Macy's | macysinc.com | mnc | New York, US | - | wd:https://macys.wd5.myworkdayjobs.com/Macys
Nordstrom | nordstrom.com | mnc gcc | Seattle, US | in | wd:https://nordstrom.wd501.myworkdayjobs.com/nordstrom_careers
Gap Inc | gapinc.com | mnc gcc | San Francisco, US | in | wd:https://gap.wd1.myworkdayjobs.com/GAPINC | Gap
Levi Strauss | levistrauss.com | mnc gcc | San Francisco, US | in | wd:https://levistraussandco.wd5.myworkdayjobs.com/External | Levi's
Nike | nike.com | mnc gcc | Beaverton, US | in | wd:https://nike.wd1.myworkdayjobs.com/nke url:https://careers.nike.com/
Adidas | adidas-group.com | mnc gcc | Herzogenaurach, DE | in | - | adidas
Puma | puma.com | mnc | Herzogenaurach, DE | in | -
H&M | hmgroup.com | mnc | Stockholm, SE | in | sr:HMGroup | H&M Group; Hennes & Mauritz
IKEA | ikea.com | mnc | Delft, NL | in | sr:IKEA | Ingka Group
Tesco | tesco.com | mnc gcc | Welwyn Garden City, GB | in p1 | url:https://www.tesco-careers.com/ | Tesco Business Solutions; Tesco Bengaluru
Sainsbury's | sainsburys.co.uk | mnc gcc | London, GB | in | - | Sainsbury's Tech India
Marks & Spencer | marksandspencer.com | mnc gcc | London, GB | in | - | M&S
Ahold Delhaize | aholddelhaize.com | mnc gcc | Zaandam, NL | in | -
Carrefour | carrefour.com | mnc | Massy, FR | - | -
Lidl | lidl.com | mnc gcc | Neckarsulm, DE | in | -
Inditex | inditex.com | mnc | Arteixo, ES | - | - | Zara
Unilever | unilever.com | mnc gcc | London, GB | in p1 | wd:https://unilever.wd3.myworkdayjobs.com/Unilever_Experienced_Professionals url:https://careers.unilever.com/
Procter & Gamble | pg.com | mnc gcc | Cincinnati, US | in p1 | url:https://www.pgcareers.com/ | P&G
Nestle | nestle.com | mnc gcc | Vevey, CH | in | - | Nestlé
PepsiCo | pepsico.com | mnc gcc | Purchase, US | in p1 | wd:https://pepsico.wd1.myworkdayjobs.com/PepsiCoCareers url:https://www.pepsicojobs.com/
The Coca-Cola Company | coca-colacompany.com | mnc gcc | Atlanta, US | in | wd:https://coke.wd1.myworkdayjobs.com/coca-cola-careers | Coca-Cola
Mondelez International | mondelezinternational.com | mnc gcc | Chicago, US | in | wd:https://mdlz.wd3.myworkdayjobs.com/External | Mondelez
Mars | mars.com | mnc gcc | McLean, US | in | wd:https://mars.wd3.myworkdayjobs.com/External
Kraft Heinz | kraftheinzcompany.com | mnc gcc | Pittsburgh, US | in | wd:https://heinz.wd1.myworkdayjobs.com/KraftHeinz_Careers
General Mills | generalmills.com | mnc gcc | Minneapolis, US | in | wd:https://generalmills.wd5.myworkdayjobs.com/General_Mills_Careers
Kellanova | kellanova.com | mnc gcc | Chicago, US | in | wd:https://kellanova.wd5.myworkdayjobs.com/Kellanova_Careers | Kellogg
Kimberly-Clark | kimberly-clark.com | mnc gcc | Irving, US | in | wd:https://kimberlyclark.wd1.myworkdayjobs.com/GLOBAL
Colgate-Palmolive | colgatepalmolive.com | mnc | New York, US | in | -
AB InBev | ab-inbev.com | mnc gcc | Leuven, BE | in | wd:https://abinbev.wd3.myworkdayjobs.com/External | Anheuser-Busch InBev; GCC India AB InBev
Diageo | diageo.com | mnc gcc | London, GB | in | wd:https://diageo.wd3.myworkdayjobs.com/Diageo_Careers
Heineken | theheinekencompany.com | mnc | Amsterdam, NL | in | -
L'Oreal | loreal.com | mnc | Clichy, FR | in | - | L'Oréal
Estee Lauder | elcompanies.com | mnc gcc | New York, US | in | wd:https://estee.wd5.myworkdayjobs.com/External | Estée Lauder Companies
Reckitt | reckitt.com | mnc gcc | Slough, GB | in | wd:https://reckitt.wd3.myworkdayjobs.com/reckitt | Reckitt Benckiser
McDonald's | mcdonalds.com | mnc gcc | Chicago, US | in | wd:https://mcdonalds.wd5.myworkdayjobs.com/mcd_careers
Starbucks | starbucks.com | mnc | Seattle, US | in | -
Yum! Brands | yum.com | mnc | Louisville, US | in | -
Domino's | dominos.com | mnc | Ann Arbor, US | - | -
Marriott International | marriott.com | mnc | Bethesda, US | in | - | Marriott
Hilton | hilton.com | mnc gcc | McLean, US | in | -
IHG Hotels & Resorts | ihgplc.com | mnc | Windsor, GB | in | - | IHG
# ── Pharma, healthcare & medtech ──
Johnson & Johnson | jnj.com | mnc gcc | New Brunswick, US | in | wd:https://jj.wd5.myworkdayjobs.com/JJ | J&J; Johnson and Johnson
Pfizer | pfizer.com | mnc gcc | New York, US | in | wd:https://pfizer.wd1.myworkdayjobs.com/PfizerCareers
Novartis | novartis.com | mnc gcc | Basel, CH | in p1 | wd:https://novartis.wd3.myworkdayjobs.com/Novartis_Careers
AstraZeneca | astrazeneca.com | mnc gcc | Cambridge, GB | in | wd:https://astrazeneca.wd3.myworkdayjobs.com/Careers
GSK | gsk.com | mnc gcc | London, GB | in | wd:https://gsk.wd5.myworkdayjobs.com/GSKCareers | GlaxoSmithKline
Sanofi | sanofi.com | mnc gcc | Paris, FR | in | - | Sanofi Hyderabad
Roche | roche.com | mnc gcc | Basel, CH | in | - | Genentech
Merck & Co | merck.com | mnc gcc | Rahway, US | in | wd:https://msd.wd5.myworkdayjobs.com/SearchJobs | MSD; Merck Sharp & Dohme
Eli Lilly | lilly.com | mnc gcc | Indianapolis, US | in | wd:https://lilly.wd5.myworkdayjobs.com/LLY | Lilly
Bristol Myers Squibb | bms.com | mnc gcc | Princeton, US | in | wd:https://bristolmyerssquibb.wd5.myworkdayjobs.com/BMS | BMS
AbbVie | abbvie.com | mnc | North Chicago, US | in | -
Amgen | amgen.com | mnc gcc | Thousand Oaks, US | in | wd:https://amgen.wd1.myworkdayjobs.com/Careers
Abbott | abbott.com | mnc gcc | Abbott Park, US | in | wd:https://abbott.wd5.myworkdayjobs.com/abbottcareers
Medtronic | medtronic.com | mnc gcc | Dublin, IE | in p1 | wd:https://medtronic.wd1.myworkdayjobs.com/MedtronicCareers
Boston Scientific | bostonscientific.com | mnc gcc | Marlborough, US | in | wd:https://bostonscientific.wd1.myworkdayjobs.com/BSCI_Careers
Stryker | stryker.com | mnc gcc | Kalamazoo, US | in | wd:https://stryker.wd1.myworkdayjobs.com/StrykerCareers
Baxter | baxter.com | mnc gcc | Deerfield, US | in | wd:https://baxter.wd1.myworkdayjobs.com/baxter
Becton Dickinson | bd.com | mnc gcc | Franklin Lakes, US | in | wd:https://bdx.wd1.myworkdayjobs.com/EXTERNAL_CAREER_SITE_INDIA | BD
Cardinal Health | cardinalhealth.com | mnc gcc | Dublin, US | in | wd:https://cardinalhealth.wd1.myworkdayjobs.com/EXT
McKesson | mckesson.com | mnc gcc | Irving, US | in | wd:https://mckesson.wd3.myworkdayjobs.com/External_Careers
CVS Health | cvshealth.com | mnc gcc | Woonsocket, US | in | wd:https://cvshealth.wd1.myworkdayjobs.com/CVS_Health_Careers
Elevance Health | elevancehealth.com | mnc gcc | Indianapolis, US | in | wd:https://elevancehealth.wd1.myworkdayjobs.com/ANT | Anthem; Carelon
Cigna | thecignagroup.com | mnc gcc | Bloomfield, US | in | wd:https://cigna.wd5.myworkdayjobs.com/cignacareers | Evernorth; The Cigna Group
Humana | humana.com | mnc | Louisville, US | - | wd:https://humana.wd5.myworkdayjobs.com/Humana_External_Career_Site
Sun Pharma | sunpharma.com | mnc | Mumbai, IN | in | - | Sun Pharmaceutical Industries
Dr. Reddy's | drreddys.com | mnc | Hyderabad, IN | in | - | Dr. Reddy's Laboratories
Cipla | cipla.com | mnc | Mumbai, IN | in | -
Biocon | biocon.com | mnc | Bengaluru, IN | in | -
Zydus Lifesciences | zyduslife.com | mnc | Ahmedabad, IN | in | - | Zydus
Syngene | syngeneintl.com | mnc | Bengaluru, IN | in | -
# ── Automotive, industrial & aerospace ──
Mercedes-Benz R&D India | mbrdi.co.in | mnc gcc | Bengaluru, IN | in p1 | - | MBRDI; Mercedes-Benz
BMW Group | bmwgroup.com | mnc gcc | Munich, DE | in | - | BMW TechWorks India
Continental | continental.com | mnc gcc | Hanover, DE | in | -
ZF Group | zf.com | mnc gcc | Friedrichshafen, DE | in | - | ZF Friedrichshafen
Valeo | valeo.com | mnc gcc | Paris, FR | in | -
Aptiv | aptiv.com | mnc gcc | Dublin, IE | in | wd:https://aptiv.wd5.myworkdayjobs.com/APTIV_CAREERS
Harman International | harman.com | mnc gcc | Stamford, US | in p1 | wd:https://harman.wd3.myworkdayjobs.com/HARMAN_Careers | Harman
Visteon | visteon.com | mnc gcc | Van Buren, US | in | -
Magna International | magna.com | mnc | Aurora, CA | in | -
General Motors | gm.com | mnc gcc | Detroit, US | in | wd:https://generalmotors.wd5.myworkdayjobs.com/Careers_GM | GM; GM Technical Center India
Ford Motor Company | ford.com | mnc gcc | Dearborn, US | in | - | Ford; Ford Business Solutions
Stellantis | stellantis.com | mnc gcc | Amsterdam, NL | in | -
Volvo Group | volvogroup.com | mnc gcc | Gothenburg, SE | in | wd:https://volvogroup.wd3.myworkdayjobs.com/volvogroupcareers
Volvo Cars | volvocars.com | mnc | Gothenburg, SE | in | -
Hyundai Motor | hyundai.com | mnc | Seoul, KR | in | -
Toyota | toyota.com | mnc | Toyota City, JP | in | -
Caterpillar | caterpillar.com | mnc gcc | Irving, US | in | wd:https://cat.wd5.myworkdayjobs.com/CaterpillarCareers
John Deere | deere.com | mnc gcc | Moline, US | in p1 | wd:https://deere.wd1.myworkdayjobs.com/External | Deere & Company
Cummins | cummins.com | mnc gcc | Columbus, US | in | -
3M | 3m.com | mnc gcc | Saint Paul, US | in | wd:https://3m.wd1.myworkdayjobs.com/Search
Dow | dow.com | mnc gcc | Midland, US | in | -
DuPont | dupont.com | mnc | Wilmington, US | in | -
BASF | basf.com | mnc gcc | Ludwigshafen, DE | in | -
Bayer | bayer.com | mnc gcc | Leverkusen, DE | in | -
Ecolab | ecolab.com | mnc gcc | Saint Paul, US | in | wd:https://ecolab.wd1.myworkdayjobs.com/Ecolab_External
Cargill | cargill.com | mnc gcc | Minneapolis, US | in | -
Airbus | airbus.com | mnc gcc | Leiden, NL | in p1 | wd:https://ag.wd3.myworkdayjobs.com/Airbus
Boeing | boeing.com | mnc gcc | Arlington, US | in p1 | wd:https://boeing.wd1.myworkdayjobs.com/EXTERNAL_CAREERS
Rolls-Royce | rolls-royce.com | mnc gcc | London, GB | in | -
Safran | safran-group.com | mnc gcc | Paris, FR | in | -
RTX | rtx.com | mnc gcc | Arlington, US | in | wd:https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway | Raytheon; Collins Aerospace; Pratt & Whitney
Lockheed Martin | lockheedmartin.com | mnc | Bethesda, US | - | -
Otis | otis.com | mnc gcc | Farmington, US | in | wd:https://otis.wd5.myworkdayjobs.com/REC_Ext_Gateway
Carrier | carrier.com | mnc gcc | Palm Beach Gardens, US | in | wd:https://carrier.wd5.myworkdayjobs.com/jobs
Trane Technologies | tranetechnologies.com | mnc gcc | Swords, IE | in | wd:https://tranetechnologies.wd5.myworkdayjobs.com/TTJobs
# ── Energy, logistics & travel ──
Shell | shell.com | mnc gcc | London, GB | in p1 | wd:https://shell.wd3.myworkdayjobs.com/ShellCareers
BP | bp.com | mnc gcc | London, GB | in | wd:https://bpinternational.wd3.myworkdayjobs.com/bpCareers
ExxonMobil | exxonmobil.com | mnc gcc | Spring, US | in | - | Exxon Mobil
Chevron | chevron.com | mnc gcc | Houston, US | in | wd:https://chevron.wd5.myworkdayjobs.com/jobs
TotalEnergies | totalenergies.com | mnc | Paris, FR | in | -
SLB | slb.com | mnc gcc | Houston, US | in | - | Schlumberger
Baker Hughes | bakerhughes.com | mnc gcc | Houston, US | in | wd:https://bakerhughes.wd5.myworkdayjobs.com/BakerHughes
Halliburton | halliburton.com | mnc | Houston, US | in | -
Maersk | maersk.com | mnc gcc | Copenhagen, DK | in p1 | - | A.P. Moller - Maersk
DHL | dhl.com | mnc gcc | Bonn, DE | in | - | DHL Group; Deutsche Post DHL
FedEx | fedex.com | mnc gcc | Memphis, US | in | - | FedEx Express
UPS | ups.com | mnc gcc | Atlanta, US | in | - | United Parcel Service
DP World | dpworld.com | mnc | Dubai, AE | in | -
Expeditors | expeditors.com | mnc | Seattle, US | in | -
Kuehne+Nagel | kuehne-nagel.com | mnc | Schindellegi, CH | in | -
C.H. Robinson | chrobinson.com | mnc gcc | Eden Prairie, US | in | wd:https://chrobinson.wd5.myworkdayjobs.com/chrcareers
Amadeus | amadeus.com | mnc gcc product | Madrid, ES | in | -
Sabre | sabre.com | mnc gcc product | Southlake, US | in | wd:https://sabre.wd1.myworkdayjobs.com/SabreJobs
United Airlines | united.com | mnc gcc | Chicago, US | in | - | United Airlines Business Services
American Airlines | aa.com | mnc gcc | Fort Worth, US | in | -
Delta Air Lines | delta.com | mnc gcc | Atlanta, US | in | - | Delta Tech Hub
Lufthansa Group | lufthansagroup.com | mnc gcc | Cologne, DE | in | - | Lufthansa
Emirates Group | emiratesgroupcareers.com | mnc | Dubai, AE | in | - | Emirates
# ── Media, telecom & services ──
The Walt Disney Company | disney.com | mnc | Burbank, US | in | - | Disney
Warner Bros. Discovery | wbd.com | mnc gcc | New York, US | in | wd:https://warnerbros.wd5.myworkdayjobs.com/global | Warner Bros
Comcast | comcastcorporation.com | mnc gcc | Philadelphia, US | in | wd:https://comcast.wd5.myworkdayjobs.com/Comcast_Careers | NBCUniversal; Sky
Paramount | paramount.com | mnc | New York, US | - | -
Verizon | verizon.com | mnc gcc | New York, US | in | - | Verizon Data Services India
AT&T | att.com | mnc gcc | Dallas, US | in | -
T-Mobile | t-mobile.com | mnc | Bellevue, US | - | -
Vodafone | vodafone.com | mnc gcc | Newbury, GB | in | - | VOIS; Vodafone Intelligent Solutions
BT Group | bt.com | mnc gcc | London, GB | in | -
Deutsche Telekom | telekom.com | mnc gcc | Bonn, DE | in | - | T-Systems; Deutsche Telekom Digital Labs
Orange | orange.com | mnc | Paris, FR | in | -
Telstra | telstra.com | mnc gcc | Melbourne, AU | in | -
Randstad | randstad.com | mnc service | Diemen, NL | in | -
Adecco | adeccogroup.com | mnc service | Zurich, CH | in | -
ManpowerGroup | manpowergroup.com | mnc service | Milwaukee, US | in | -
Teamlease | teamlease.com | service | Bengaluru, IN | in | - | TeamLease Services
Quess Corp | quesscorp.com | service | Bengaluru, IN | in | -
Sodexo | sodexo.com | mnc service | Issy-les-Moulineaux, FR | in | -
JLL | jll.com | mnc gcc | Chicago, US | in | wd:https://jll.wd1.myworkdayjobs.com/jllcareers | Jones Lang LaSalle
CBRE | cbre.com | mnc gcc | Dallas, US | in | wd:https://cbre.wd5.myworkdayjobs.com/CBRE
Cushman & Wakefield | cushmanwakefield.com | mnc | Chicago, US | in | -
`);
