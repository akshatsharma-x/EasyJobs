/**
 * Company alias table: `Canonical | domain | alias; alias; …` (aliases are matched after legal-suffix stripping,
 * lower-cased, "&" → "and", punctuation removed — see companyKey in company.ts).
 * Includes legal-entity names that differ from the brand (Bundl Technologies → Swiggy, One97 → Paytm).
 */
export const COMPANY_SOURCE = `
Amazon | amazon.com | amazon; amazon com; amazon india; amazon development centre; amazon development center; amazon development centre india; amazon india development centre; adci; amazon web services; aws; amazon com services; amazon seller services; amazon transportation services; amazon data services; amazon pay; amazon pay india; amazon com inc
Google | google.com | google; google india; google llc; google cloud; google india digital services; alphabet
Microsoft | microsoft.com | microsoft; microsoft india; microsoft india r and d; microsoft india rd; microsoft idc; microsoft india development center; microsoft research; microsoft corporation india; msft
Meta | meta.com | meta; meta platforms; facebook; facebook india online services
Apple | apple.com | apple; apple india
Netflix | netflix.com | netflix
NVIDIA | nvidia.com | nvidia; nvidia graphics
Intel | intel.com | intel; intel technology india; intel india
AMD | amd.com | amd; advanced micro devices
Qualcomm | qualcomm.com | qualcomm; qualcomm india
Cisco | cisco.com | cisco; cisco systems
Oracle | oracle.com | oracle; oracle india; oracle financial services software; ofss
SAP | sap.com | sap; sap labs; sap labs india; sap india
Salesforce | salesforce.com | salesforce; salesforce com
Adobe | adobe.com | adobe; adobe systems; adobe india
IBM | ibm.com | ibm; international business machines; ibm india
Uber | uber.com | uber; uber india; uber technologies; uber india systems
Atlassian | atlassian.com | atlassian
Intuit | intuit.com | intuit; intuit india
PayPal | paypal.com | paypal; paypal india
Visa | visa.com | visa; visa inc
Mastercard | mastercard.com | mastercard
American Express | americanexpress.com | american express; amex
Goldman Sachs | goldmansachs.com | goldman sachs; goldman sachs group; goldman sachs services
JPMorgan Chase | jpmorganchase.com | jpmorgan; jp morgan; j p morgan; jpmorgan chase; jpmorgan chase and co; jpmc; jp morgan chase; jpmorgan chase bank
Morgan Stanley | morganstanley.com | morgan stanley; morgan stanley advantage services
Bank of America | bankofamerica.com | bank of america; bofa; bank of america continuum
Citi | citi.com | citi; citigroup; citibank; citicorp
HSBC | hsbc.com | hsbc; hsbc software development; hsbc technology; hsbc electronic data processing
Barclays | barclays.com | barclays; barclays global service centre
Deutsche Bank | db.com | deutsche bank
Wells Fargo | wellsfargo.com | wells fargo
Standard Chartered | sc.com | standard chartered; standard chartered bank; scope international
UBS | ubs.com | ubs
BNY | bny.com | bny; bny mellon; bank of new york mellon
State Street | statestreet.com | state street
Fidelity Investments | fidelity.com | fidelity; fidelity investments; fmr
BlackRock | blackrock.com | blackrock
Nomura | nomura.com | nomura
Societe Generale | societegenerale.com | societe generale; socgen
BNP Paribas | bnpparibas.com | bnp paribas
NatWest Group | natwestgroup.com | natwest; natwest group; rbs
Lloyds Banking Group | lloydsbankinggroup.com | lloyds; lloyds banking group; lloyds technology centre
Walmart Global Tech | walmart.com | walmart; walmart global tech; walmart labs; walmart global tech india
Target | target.com | target; target corporation india
Tesco | tesco.com | tesco; tesco bengaluru
Lowe's | lowes.com | lowes; lowes india
Dell Technologies | dell.com | dell; dell technologies; dell international services
HP | hp.com | hp; hp inc; hewlett packard; hp india
Hewlett Packard Enterprise | hpe.com | hpe; hewlett packard enterprise
Samsung | samsung.com | samsung; samsung r and d institute; samsung research; samsung semiconductor india; samsung electronics; srib
LinkedIn | linkedin.com | linkedin
Stripe | stripe.com | stripe
Airbnb | airbnb.com | airbnb
Shopify | shopify.com | shopify
Spotify | spotify.com | spotify
Databricks | databricks.com | databricks
Snowflake | snowflake.com | snowflake
ServiceNow | servicenow.com | servicenow
Workday | workday.com | workday
VMware | vmware.com | vmware
Broadcom | broadcom.com | broadcom
Texas Instruments | ti.com | texas instruments; ti india
Micron | micron.com | micron; micron technology
Western Digital | westerndigital.com | western digital
Synopsys | synopsys.com | synopsys
Cadence | cadence.com | cadence; cadence design systems
Siemens | siemens.com | siemens; siemens technology and services
Bosch | bosch.com | bosch; robert bosch; bosch global software technologies; bgsw; robert bosch engineering and business solutions; rbei
Honeywell | honeywell.com | honeywell; honeywell technology solutions
GE | ge.com | ge; general electric
Philips | philips.com | philips
Schneider Electric | se.com | schneider electric
ABB | abb.com | abb
Shell | shell.com | shell; shell india
Autodesk | autodesk.com | autodesk
Expedia Group | expediagroup.com | expedia; expedia group
Nutanix | nutanix.com | nutanix
Rubrik | rubrik.com | rubrik
Palo Alto Networks | paloaltonetworks.com | palo alto networks
Juniper Networks | juniper.net | juniper networks
Zscaler | zscaler.com | zscaler
Twilio | twilio.com | twilio
OpenAI | openai.com | openai
Anthropic | anthropic.com | anthropic
Coinbase | coinbase.com | coinbase
Agoda | agoda.com | agoda
Thomson Reuters | thomsonreuters.com | thomson reuters
Optum | optum.com | optum; unitedhealth group; uhg; optum global solutions
McKinsey & Company | mckinsey.com | mckinsey; mckinsey and company
BCG | bcg.com | bcg; boston consulting group
Bain & Company | bain.com | bain; bain and company
ZS Associates | zs.com | zs; zs associates
Gartner | gartner.com | gartner
Caterpillar | caterpillar.com | caterpillar
Cummins | cummins.com | cummins; cummins india
John Deere | deere.com | john deere; deere; deere and company
Volvo Group | volvogroup.com | volvo; volvo group
Mercedes-Benz | mercedes-benz.com | mercedes benz; mercedes benz research and development india; mbrdi
Continental | continental.com | continental; continental automotive
Airbus | airbus.com | airbus
Boeing | boeing.com | boeing
Ericsson | ericsson.com | ericsson
Nokia | nokia.com | nokia; nokia solutions and networks
TCS | tcs.com | tcs; tata consultancy services; tata consultancy
Infosys | infosys.com | infosys; infosys technologies
Infosys BPM | infosysbpm.com | infosys bpm
Wipro | wipro.com | wipro; wipro technologies
HCLTech | hcltech.com | hcl; hcl technologies; hcltech; hcl tech
Tech Mahindra | techmahindra.com | tech mahindra; techm
LTIMindtree | ltimindtree.com | ltimindtree; lti; larsen and toubro infotech; mindtree; l and t infotech; lti mindtree
L&T Technology Services | ltts.com | ltts; l and t technology services; larsen and toubro technology services
Larsen & Toubro | larsentoubro.com | l and t; larsen and toubro; lt
Cognizant | cognizant.com | cognizant; cognizant technology solutions; cts
Capgemini | capgemini.com | capgemini; capgemini india; capgemini technology services india; capgemini technology services
Accenture | accenture.com | accenture; accenture solutions; accenture india
Deloitte | deloitte.com | deloitte; deloitte india; deloitte usi; deloitte touche tohmatsu; deloitte consulting; deloitte haskins and sells; deloitte shared services
PwC | pwc.com | pwc; pricewaterhousecoopers; price waterhouse coopers; pwc india; pwc ac; pricewaterhousecoopers service delivery center
EY | ey.com | ey; ernst and young; ey gds; ernst and young global; ey global delivery services
KPMG | kpmg.com | kpmg; kpmg global services; kpmg india; kpmg assurance and consulting services
Mphasis | mphasis.com | mphasis
Hexaware | hexaware.com | hexaware; hexaware technologies
Persistent Systems | persistent.com | persistent; persistent systems
Zensar | zensar.com | zensar; zensar technologies
Coforge | coforge.com | coforge; niit technologies
Birlasoft | birlasoft.com | birlasoft
Cyient | cyient.com | cyient
KPIT | kpit.com | kpit; kpit technologies
Sonata Software | sonata-software.com | sonata software
Mastek | mastek.com | mastek
Tata Elxsi | tataelxsi.com | tata elxsi
Tata Technologies | tatatechnologies.com | tata technologies
NTT DATA | nttdata.com | ntt data; ntt data services
DXC Technology | dxc.com | dxc; dxc technology
Genpact | genpact.com | genpact
EXL | exlservice.com | exl; exl service; exlservice
WNS | wns.com | wns; wns global services
Concentrix | concentrix.com | concentrix
Teleperformance | teleperformance.com | teleperformance
Virtusa | virtusa.com | virtusa
UST | ust.com | ust; ust global
Nagarro | nagarro.com | nagarro
Publicis Sapient | publicissapient.com | publicis sapient; sapient
Thoughtworks | thoughtworks.com | thoughtworks
EPAM Systems | epam.com | epam; epam systems
Happiest Minds | happiestminds.com | happiest minds; happiest minds technologies
Quest Global | quest-global.com | quest global
Atos | atos.net | atos; atos syntel; syntel
Fractal Analytics | fractal.ai | fractal; fractal analytics
Mu Sigma | mu-sigma.com | mu sigma; musigma
Tiger Analytics | tigeranalytics.com | tiger analytics
LatentView Analytics | latentview.com | latentview; latentview analytics
Tredence | tredence.com | tredence
MathCo | mathco.com | mathco; the math company
Flipkart | flipkart.com | flipkart; flipkart internet; flipkart india
Myntra | myntra.com | myntra; myntra designs
Swiggy | swiggy.com | swiggy; bundl technologies
Zomato | zomato.com | zomato; zomato media
Blinkit | blinkit.com | blinkit; grofers
Zepto | zeptonow.com | zepto; kiranakart technologies; kiranakart
CRED | cred.club | cred; dreamplug technologies; dreamplug
Razorpay | razorpay.com | razorpay; razorpay software
PhonePe | phonepe.com | phonepe
Paytm | paytm.com | paytm; one97 communications; one 97 communications; one97
Groww | groww.in | groww; nextbillion technology; next billion technology
Zerodha | zerodha.com | zerodha
Meesho | meesho.com | meesho; fashnear technologies
Ola | olacabs.com | ola; ola cabs; ani technologies
Ola Electric | olaelectric.com | ola electric; ola electric mobility
Freshworks | freshworks.com | freshworks
Zoho | zoho.com | zoho; zoho corporation; zoho corp
Postman | postman.com | postman
BrowserStack | browserstack.com | browserstack
InMobi | inmobi.com | inmobi
Nykaa | nykaa.com | nykaa; fsn e commerce ventures
PolicyBazaar | policybazaar.com | policybazaar; pb fintech
Dream11 | dream11.com | dream11; dream sports
MakeMyTrip | makemytrip.com | makemytrip; mmt
OYO | oyorooms.com | oyo; oravel stays; oyo rooms
BYJU'S | byjus.com | byjus; byju s; think and learn
Unacademy | unacademy.com | unacademy; sorting hat technologies
upGrad | upgrad.com | upgrad; upgrad education
PhysicsWallah | pw.live | physicswallah; physics wallah
Urban Company | urbancompany.com | urban company; urbanclap
Delhivery | delhivery.com | delhivery
Lenskart | lenskart.com | lenskart
ShareChat | sharechat.com | sharechat; mohalla tech
Rapido | rapido.bike | rapido; roppen transportation services
Juspay | juspay.in | juspay; juspay technologies
Sprinklr | sprinklr.com | sprinklr
Chargebee | chargebee.com | chargebee
Druva | druva.com | druva
Icertis | icertis.com | icertis
MoEngage | moengage.com | moengage
CleverTap | clevertap.com | clevertap
Jio | jio.com | jio; reliance jio; jio platforms; reliance jio infocomm
Reliance Industries | ril.com | reliance; reliance industries
Airtel | airtel.in | airtel; bharti airtel
Vodafone Idea | myvi.in | vodafone idea; vi
Tata Motors | tatamotors.com | tata motors
Tata Steel | tatasteel.com | tata steel
Mahindra & Mahindra | mahindra.com | mahindra; mahindra and mahindra
Maruti Suzuki | marutisuzuki.com | maruti; maruti suzuki; maruti suzuki india
Asian Paints | asianpaints.com | asian paints
Hindustan Unilever | hul.co.in | hul; hindustan unilever
ITC | itcportal.com | itc
HDFC Bank | hdfcbank.com | hdfc bank
ICICI Bank | icicibank.com | icici bank; icici
Axis Bank | axisbank.com | axis bank
Kotak Mahindra Bank | kotak.com | kotak; kotak mahindra bank; kotak mahindra
SBI | sbi.co.in | sbi; state bank of india
Bajaj Finserv | bajajfinserv.in | bajaj finserv; bajaj finance
Adani Group | adani.com | adani; adani group; adani enterprises
ISRO | isro.gov.in | isro; indian space research organisation; indian space research organization
DRDO | drdo.gov.in | drdo; defence research and development organisation
BHEL | bhel.com | bhel; bharat heavy electricals
ONGC | ongcindia.com | ongc; oil and natural gas corporation
NTPC | ntpc.co.in | ntpc
Indian Oil | iocl.com | iocl; indian oil; indian oil corporation
`;
