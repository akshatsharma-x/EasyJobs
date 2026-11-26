import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("indian-it", `
TCS | tcs.com | indian_it mnc service consulting | Mumbai, IN | in p1 | cu:https://ibegin.tcs.com/iBegin/jobs/search url:https://www.tcs.com/careers | Tata Consultancy Services; Tata Consultancy Services Limited; TCS iON
Infosys | infosys.com | indian_it mnc service consulting | Bengaluru, IN | in p1 | cu:https://career.infosys.com/joblist url:https://www.infosys.com/careers/ | Infosys Limited; Infosys Technologies
Wipro | wipro.com | indian_it mnc service consulting | Bengaluru, IN | in p1 | sf:https://careers.wipro.com/ url:https://careers.wipro.com/ | Wipro Limited; Wipro Technologies
HCLTech | hcltech.com | indian_it mnc service | Noida, IN | in p1 | cu:https://www.hcltech.com/careers url:https://www.hcltech.com/careers | HCL Technologies; HCL Tech; HCL
Tech Mahindra | techmahindra.com | indian_it mnc service | Pune, IN | in p1 | cu:https://careers.techmahindra.com/ url:https://careers.techmahindra.com/ | TechM; Tech Mahindra Limited
LTIMindtree | ltimindtree.com | indian_it mnc service | Mumbai, IN | in p1 | cu:https://www.ltimindtree.com/careers/ url:https://www.ltimindtree.com/careers/ | LTI Mindtree; L&T Infotech; LTI; Mindtree; Larsen & Toubro Infotech
Cognizant | cognizant.com | indian_it mnc service consulting gcc | Teaneck, US | in p1 | cu:https://careers.cognizant.com/global-en/jobs/ url:https://careers.cognizant.com/global-en/ | Cognizant Technology Solutions; CTS
Capgemini | capgemini.com | indian_it mnc service consulting | Paris, FR | in p1 | cu:https://www.capgemini.com/in-en/careers/job-search/ url:https://www.capgemini.com/in-en/careers/ | Capgemini India; Capgemini Technology Services
Accenture | accenture.com | mnc service consulting | Dublin, IE | in p1 | cu:https://www.accenture.com/in-en/careers/jobsearch url:https://www.accenture.com/in-en/careers | Accenture Solutions; Accenture India
Deloitte | deloitte.com | mnc consulting service | London, GB | in p1 | cu:https://www2.deloitte.com/in/en/careers.html url:https://www2.deloitte.com/in/en/careers.html | Deloitte USI; Deloitte India; Deloitte Touche Tohmatsu
EY | ey.com | mnc consulting service | London, GB | in p1 | sf:https://careers.ey.com/ey url:https://www.ey.com/en_in/careers | Ernst & Young; EY GDS; EY Global Delivery Services
PwC | pwc.com | mnc consulting service | London, GB | in p1 | wd:https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers url:https://www.pwc.in/careers.html | PricewaterhouseCoopers; PwC India; PwC AC
KPMG | kpmg.com | mnc consulting service | Amstelveen, NL | in p1 | cu:https://kpmg.com/in/en/careers.html url:https://kpmg.com/in/en/careers.html | KPMG India; KPMG Global Services
Grant Thornton | grantthornton.in | mnc consulting service | Chicago, US | in | - | Grant Thornton Bharat
BDO India | bdo.in | consulting service | Mumbai, IN | in | -
McKinsey & Company | mckinsey.com | mnc consulting | New York, US | in p1 | cu:https://www.mckinsey.com/careers/search-jobs url:https://www.mckinsey.com/careers | McKinsey
Boston Consulting Group | bcg.com | mnc consulting | Boston, US | in p1 | cu:https://careers.bcg.com/global/en url:https://careers.bcg.com/ | BCG
Bain & Company | bain.com | mnc consulting | Boston, US | in p1 | cu:https://www.bain.com/careers/find-a-role/ url:https://www.bain.com/careers/ | Bain
Kearney | kearney.com | mnc consulting | Chicago, US | in | - | A.T. Kearney
ZS Associates | zs.com | mnc consulting | Evanston, US | in p1 | cu:https://jobs.zs.com/ url:https://www.zs.com/careers | ZS
Mu Sigma | mu-sigma.com | consulting service | Bengaluru, IN | in p1 | -
Fractal Analytics | fractal.ai | consulting ai unicorn | Mumbai, IN | in p1 | - | Fractal
Tiger Analytics | tigeranalytics.com | consulting ai service | Santa Clara, US | in p1 | -
LatentView Analytics | latentview.com | consulting ai service | Chennai, IN | in | -
Genpact | genpact.com | mnc service consulting | New York, US | in p1 | wd:https://genpact.wd1.myworkdayjobs.com/Genpact_External | Genpact India
EXL | exlservice.com | mnc service | New York, US | in p1 | - | ExlService
WNS | wns.com | mnc service | Mumbai, IN | in p1 | - | WNS Global Services
Concentrix | concentrix.com | mnc service | Newark, US | in | wd:https://concentrix.wd5.myworkdayjobs.com/External
Teleperformance | teleperformance.com | mnc service | Paris, FR | in | -
Firstsource Solutions | firstsource.com | service | Mumbai, IN | in | -
Hinduja Global Solutions | hgs.cx | service | Mumbai, IN | in | - | HGS
Mphasis | mphasis.com | indian_it service | Bengaluru, IN | in p1 | -
Hexaware Technologies | hexaware.com | indian_it service | Navi Mumbai, IN | in p1 | - | Hexaware
Persistent Systems | persistent.com | indian_it service product | Pune, IN | in p1 | cu:https://www.persistent.com/careers/ | Persistent
Coforge | coforge.com | indian_it service | Noida, IN | in p1 | cu:https://www.coforge.com/careers | NIIT Technologies
Birlasoft | birlasoft.com | indian_it service | Pune, IN | in | -
Zensar Technologies | zensar.com | indian_it service | Pune, IN | in | - | Zensar
Cyient | cyient.com | indian_it service | Hyderabad, IN | in | -
Sonata Software | sonata-software.com | indian_it service | Bengaluru, IN | in | -
Mastek | mastek.com | indian_it service | Mumbai, IN | in | -
L&T Technology Services | ltts.com | indian_it service | Vadodara, IN | in p1 | - | LTTS
Tata Elxsi | tataelxsi.com | indian_it service | Bengaluru, IN | in p1 | -
Tata Technologies | tatatechnologies.com | indian_it service | Pune, IN | in | -
KPIT Technologies | kpit.com | indian_it service | Pune, IN | in p1 | - | KPIT
Happiest Minds | happiestminds.com | indian_it service | Bengaluru, IN | in | - | Happiest Minds Technologies
Infosys BPM | infosysbpm.com | indian_it service | Bengaluru, IN | in | -
Infosys Finacle | edgeverve.com | indian_it product fintech | Bengaluru, IN | in | - | EdgeVerve; Finacle
NTT DATA | nttdata.com | mnc service | Tokyo, JP | in p1 | - | NTT Data Services
DXC Technology | dxc.com | mnc service | Ashburn, US | in p1 | wd:https://dxctechnology.wd1.myworkdayjobs.com/DXCJobs | DXC
Kyndryl | kyndryl.com | mnc service | New York, US | in p1 | wd:https://kyndryl.wd5.myworkdayjobs.com/KyndrylProfessionalCareers
Atos | atos.net | mnc service | Bezons, FR | in | - | Eviden
Sopra Steria | soprasteria.com | mnc service | Paris, FR | in | -
CGI | cgi.com | mnc service | Montreal, CA | in | - | CGI Inc
EPAM Systems | epam.com | mnc service | Newtown, US | in | - | EPAM
Globant | globant.com | mnc service | Luxembourg, LU | in | -
Thoughtworks | thoughtworks.com | mnc service consulting | Chicago, US | in p1 | gh:thoughtworks
Publicis Sapient | publicissapient.com | mnc service consulting | Boston, US | in p1 | - | Sapient
Virtusa | virtusa.com | mnc service | Southborough, US | in p1 | -
UST | ust.com | mnc service | Aliso Viejo, US | in p1 | cu:https://www.ust.com/en/careers | UST Global
Nagarro | nagarro.com | mnc service | Munich, DE | in p1 | -
Altimetrik | altimetrik.com | service | Southfield, US | in | -
Quest Global | quest-global.com | service | Singapore, SG | in | -
Sasken Technologies | sasken.com | indian_it service | Bengaluru, IN | in | -
Mindsprint | mindsprint.com | service | Singapore, SG | in | -
R Systems | rsystems.com | indian_it service | Noida, IN | in | -
Intellect Design Arena | intellectdesign.com | indian_it product fintech | Chennai, IN | in | -
Newgen Software | newgensoft.com | indian_it product | Noida, IN | in | -
Ramco Systems | ramco.com | indian_it product | Chennai, IN | in | -
Nucleus Software | nucleussoftware.com | indian_it product fintech | Noida, IN | in | -
3i Infotech | 3i-infotech.com | indian_it service | Mumbai, IN | in | -
Mastech Digital | mastechdigital.com | service | Pittsburgh, US | in | -
Infogain | infogain.com | service | Los Gatos, US | in | -
GlobalLogic | globallogic.com | mnc service | San Jose, US | in p1 | - | GlobalLogic India
Ness Digital Engineering | ness.com | service | Teaneck, US | in | -
Synechron | synechron.com | service fintech | New York, US | in | -
Iris Software | irissoftware.com | service | Edison, US | in | -
Xoriant | xoriant.com | service | Sunnyvale, US | in | -
Cybage | cybage.com | service | Pune, IN | in | -
Harbinger Group | harbingergroup.com | service | Pune, IN | in | -
Calsoft | calsoftinc.com | service | Pune, IN | in | -
Tavant | tavant.com | service | Santa Clara, US | in | -
Photon | photon.com | service | Dallas, US | in | -
Movate | movate.com | service | Plano, US | in | - | CSS Corp
Sutherland | sutherlandglobal.com | mnc service | Rochester, US | in | -
Startek | startek.com | service | Denver, US | in | -
ITC Infotech | itcinfotech.com | indian_it service | Bengaluru, IN | in | -
Tata Communications | tatacommunications.com | mnc service | Mumbai, IN | in p1 | -
Bharti Airtel | airtel.in | mnc product | New Delhi, IN | in p1 | - | Airtel
Reliance Jio | jio.com | mnc product | Mumbai, IN | in p1 | - | Jio Platforms
Vodafone Idea | myvi.in | mnc | Mumbai, IN | in | - | Vi
Reliance Industries | ril.com | mnc | Mumbai, IN | in p1 | - | Reliance
Tata Steel | tatasteel.com | mnc | Mumbai, IN | in | -
Mahindra Group | mahindra.com | mnc | Mumbai, IN | in p1 | - | Mahindra & Mahindra
Larsen & Toubro | larsentoubro.com | mnc | Mumbai, IN | in p1 | - | L&T
Adani Group | adani.com | mnc | Ahmedabad, IN | in | -
Aditya Birla Group | adityabirla.com | mnc | Mumbai, IN | in | -
ITC Limited | itcportal.com | mnc | Kolkata, IN | in | - | ITC
Hindustan Unilever | hul.co.in | mnc | Mumbai, IN | in p1 | cu:https://www.hul.co.in/careers/ | HUL
Asian Paints | asianpaints.com | mnc | Mumbai, IN | in | -
Maruti Suzuki | marutisuzuki.com | mnc | New Delhi, IN | in | -
Tata Motors | tatamotors.com | mnc | Mumbai, IN | in p1 | -
Titan Company | titancompany.in | mnc | Bengaluru, IN | in | - | Titan
`);
