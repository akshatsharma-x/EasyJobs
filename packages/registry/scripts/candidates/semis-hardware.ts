import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("semis-hardware", `
Texas Instruments | ti.com | mnc product gcc | Dallas, US | in p1 | wd:https://ti.wd1.myworkdayjobs.com/TIEXTERNALCAREERS url:https://careers.ti.com/ | TI
Micron Technology | micron.com | mnc product gcc | Boise, US | in p1 | wd:https://micron.wd1.myworkdayjobs.com/External url:https://careers.micron.com/ | Micron
Applied Materials | appliedmaterials.com | mnc product gcc | Santa Clara, US | in p1 | wd:https://amat.wd1.myworkdayjobs.com/External url:https://careers.appliedmaterials.com/ | AMAT
KLA | kla.com | mnc product gcc | Milpitas, US | in | wd:https://kla.wd1.myworkdayjobs.com/Search
Lam Research | lamresearch.com | mnc product gcc | Fremont, US | in | wd:https://lamresearch.wd1.myworkdayjobs.com/LAM
Analog Devices | analog.com | mnc product gcc | Wilmington, US | in p1 | wd:https://analogdevices.wd1.myworkdayjobs.com/External | ADI
Marvell Technology | marvell.com | mnc product gcc | Wilmington, US | in p1 | wd:https://marvell.wd1.myworkdayjobs.com/MarvellCareers | Marvell
NXP Semiconductors | nxp.com | mnc product gcc | Eindhoven, NL | in p1 | wd:https://nxp.wd3.myworkdayjobs.com/careers | NXP
Infineon Technologies | infineon.com | mnc product gcc | Munich, DE | in | cu:https://jobs.infineon.com/careers url:https://www.infineon.com/cms/en/careers/ | Infineon
STMicroelectronics | st.com | mnc product gcc | Geneva, CH | in | wd:https://wd3.myworkdaysite.com/recruiting/stmicroelectronics/ST_Careers | ST
Renesas Electronics | renesas.com | mnc product gcc | Tokyo, JP | in | wd:https://renesas.wd3.myworkdayjobs.com/Renesas_External | Renesas
Microchip Technology | microchip.com | mnc product gcc | Chandler, US | in | wd:https://wd5.myworkdaysite.com/recruiting/microchiphr/External | Microchip
onsemi | onsemi.com | mnc product gcc | Scottsdale, US | in | wd:https://onsemi.wd5.myworkdayjobs.com/onsemi | ON Semiconductor
Synopsys | synopsys.com | mnc product gcc | Sunnyvale, US | in p1 | wd:https://synopsys.wd1.myworkdayjobs.com/Careers url:https://careers.synopsys.com/
Cadence Design Systems | cadence.com | mnc product gcc | San Jose, US | in p1 | wd:https://cadence.wd1.myworkdayjobs.com/External_Careers | Cadence
Siemens EDA | sw.siemens.com | mnc product gcc | Wilsonville, US | in | - | Mentor Graphics
Ansys | ansys.com | mnc product gcc | Canonsburg, US | in | wd:https://ansys.wd1.myworkdayjobs.com/Ansys
Arm | arm.com | mnc product gcc | Cambridge, GB | in p1 | wd:https://arm.wd1.myworkdayjobs.com/Careers | ARM Holdings
Western Digital | westerndigital.com | mnc product gcc | San Jose, US | in | wd:https://wdc.wd1.myworkdayjobs.com/WD_Careers
Seagate Technology | seagate.com | mnc product gcc | Dublin, IE | in | wd:https://seagatecareers.wd1.myworkdayjobs.com/careers | Seagate
SanDisk | sandisk.com | mnc product gcc | Milpitas, US | in | -
GlobalFoundries | gf.com | mnc product gcc | Malta, US | in | wd:https://globalfoundries.wd1.myworkdayjobs.com/External
Tata Electronics | tataelectronics.com | product | Bengaluru, IN | in p1 | -
MediaTek | mediatek.com | mnc product gcc | Hsinchu, TW | in | -
Samsung Semiconductor | semiconductor.samsung.com | mnc product gcc | San Jose, US | in | -
SK hynix | skhynix.com | mnc product | Icheon, KR | - | -
Rambus | rambus.com | product | San Jose, US | in | -
Lattice Semiconductor | latticesemi.com | product | Hillsboro, US | in | wd:https://lattice.wd1.myworkdayjobs.com/External
Silicon Labs | silabs.com | product mnc | Austin, US | in | wd:https://silabs.wd1.myworkdayjobs.com/SiliconlabsCareers
Monolithic Power Systems | monolithicpower.com | product mnc | Kirkland, US | in | -
Skyworks Solutions | skyworksinc.com | product mnc | Irvine, US | in | wd:https://skyworks.wd1.myworkdayjobs.com/Skyworks_Careers
Qorvo | qorvo.com | product mnc | Greensboro, US | in | wd:https://qorvo.wd1.myworkdayjobs.com/Qorvo_Careers
Keysight Technologies | keysight.com | mnc product gcc | Santa Rosa, US | in | wd:https://keysight.wd5.myworkdayjobs.com/Keysight | Keysight
Teradyne | teradyne.com | mnc product | North Reading, US | in | wd:https://teradyne.wd1.myworkdayjobs.com/Teradyne
SiFive | sifive.com | product startup | Santa Clara, US | in | gh:sifive
Tenstorrent | tenstorrent.com | ai startup unicorn product | Toronto, CA | in | gh:tenstorrent
Cerebras Systems | cerebras.ai | ai startup unicorn product | Sunnyvale, US | in | gh:cerebrassystems | Cerebras
Groq | groq.com | ai startup unicorn product | Mountain View, US | - | gh:groq
SambaNova Systems | sambanova.ai | ai startup unicorn | Palo Alto, US | in | gh:sambanovasystems | SambaNova
Ampere Computing | amperecomputing.com | product startup | Santa Clara, US | in | gh:amperecomputing | Ampere
Etched | etched.com | ai startup | Cupertino, US | - | ab:etched
Lightmatter | lightmatter.co | ai startup unicorn | Boston, US | - | gh:lightmatter
d-Matrix | d-matrix.ai | ai startup | Santa Clara, US | in | gh:dmatrix
Mythic | mythic.ai | ai startup | Austin, US | - | -
Ola Krutrim | olakrutrim.com | ai startup unicorn | Bengaluru, IN | in p1 | - | Krutrim
Mindgrove Technologies | mindgrovetech.in | startup product | Chennai, IN | in | -
InCore Semiconductors | incoresemi.com | startup product | Chennai, IN | in | -
Ather Energy | atherenergy.com | startup unicorn product | Bengaluru, IN | in p1 | -
Ola Electric | olaelectric.com | startup unicorn product | Bengaluru, IN | in p1 | -
Nokia | nokia.com | mnc product gcc | Espoo, FI | in p1 | cu:https://jobs.nokia.com/en/sites/CX_1/jobs url:https://www.nokia.com/about-us/careers/
Ericsson | ericsson.com | mnc product gcc | Stockholm, SE | in p1 | wd:https://ericsson.wd3.myworkdayjobs.com/Ericsson_Careers url:https://www.ericsson.com/en/careers
Motorola Solutions | motorolasolutions.com | mnc product gcc | Chicago, US | in | wd:https://motorolasolutions.wd5.myworkdayjobs.com/Careers
Ciena | ciena.com | mnc product gcc | Hanover, US | in | wd:https://ciena.wd5.myworkdayjobs.com/Careers
CommScope | commscope.com | mnc product gcc | Hickory, US | in | wd:https://commscope.wd5.myworkdayjobs.com/CommScope
Extreme Networks | extremenetworks.com | mnc product gcc | Morrisville, US | in | wd:https://extremenetworks.wd5.myworkdayjobs.com/Extreme_Careers
F5 | f5.com | mnc product gcc | Seattle, US | in | wd:https://ffive.wd5.myworkdayjobs.com/f5jobs | F5 Networks
Palo Alto Networks | paloaltonetworks.com | mnc product gcc | Santa Clara, US | in p1 | wd:https://paloaltonetworks.wd5.myworkdayjobs.com/External url:https://jobs.paloaltonetworks.com/
Fortinet | fortinet.com | mnc product | Sunnyvale, US | in | wd:https://fortinet.wd5.myworkdayjobs.com/Fortinet
Check Point Software | checkpoint.com | mnc product gcc | Tel Aviv, IL | in | - | Check Point
Zebra Technologies | zebra.com | mnc product gcc | Lincolnshire, US | in | wd:https://zebra.wd1.myworkdayjobs.com/Zebra_Careers
Garmin | garmin.com | mnc product | Olathe, US | in | -
Logitech | logitech.com | mnc product | Lausanne, CH | in | wd:https://logitech.wd5.myworkdayjobs.com/Logitech
Corning | corning.com | mnc product | Corning, US | in | wd:https://corning.wd1.myworkdayjobs.com/Corning
Honeywell | honeywell.com | mnc product gcc | Charlotte, US | in p1 | wd:https://honeywell.wd5.myworkdayjobs.com/Honeywell url:https://careers.honeywell.com/
Schneider Electric | se.com | mnc product gcc | Rueil-Malmaison, FR | in p1 | wd:https://schneiderelectric.wd3.myworkdayjobs.com/External | Schneider
ABB | abb.com | mnc product gcc | Zurich, CH | in | wd:https://abb.wd3.myworkdayjobs.com/external_career_page
Emerson | emerson.com | mnc product gcc | St. Louis, US | in | wd:https://emerson.wd5.myworkdayjobs.com/Emerson | Emerson Electric
Rockwell Automation | rockwellautomation.com | mnc product gcc | Milwaukee, US | in | wd:https://rockwellautomation.wd1.myworkdayjobs.com/External_Rockwell_Automation
Johnson Controls | johnsoncontrols.com | mnc product gcc | Cork, IE | in | wd:https://jci.wd5.myworkdayjobs.com/JCI | JCI
Eaton | eaton.com | mnc product gcc | Dublin, IE | in | wd:https://eaton.wd1.myworkdayjobs.com/eaton_careers
GE Aerospace | geaerospace.com | mnc product gcc | Cincinnati, US | in | wd:https://geaerospace.wd5.myworkdayjobs.com/GE_ExternalSite | GE
GE Vernova | gevernova.com | mnc product gcc | Cambridge, US | in | wd:https://gevernova.wd5.myworkdayjobs.com/Vernova_ExternalSite
GE HealthCare | gehealthcare.com | mnc product gcc | Chicago, US | in p1 | wd:https://gehc.wd5.myworkdayjobs.com/GEHC_ExternalSite | GE Healthcare
Thermo Fisher Scientific | thermofisher.com | mnc product gcc | Waltham, US | in | wd:https://thermofisher.wd5.myworkdayjobs.com/ThermoFisherCareers | Thermo Fisher
Agilent Technologies | agilent.com | mnc product gcc | Santa Clara, US | in | wd:https://agilent.wd5.myworkdayjobs.com/Agilent_Careers | Agilent
Danaher | danaher.com | mnc product gcc | Washington, US | in | wd:https://danaher.wd1.myworkdayjobs.com/DanaherJobs
Trimble | trimble.com | mnc product gcc | Westminster, US | in | wd:https://trimble.wd1.myworkdayjobs.com/TrimbleCareers
Hexagon | hexagon.com | mnc product gcc | Stockholm, SE | in | -
Dassault Systemes | 3ds.com | mnc product gcc | Velizy, FR | in | - | Dassault Systèmes
PTC | ptc.com | mnc product gcc | Boston, US | in | wd:https://ptc.wd1.myworkdayjobs.com/PTC
Bentley Systems | bentley.com | mnc product gcc | Exton, US | in | -
Altair | altair.com | mnc product | Troy, US | in | -
`);
