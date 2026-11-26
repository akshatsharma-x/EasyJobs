import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("finance", `
JPMorgan Chase | jpmorganchase.com | mnc bank gcc fintech | New York, US | in p1 | or:https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001 url:https://careers.jpmorgan.com/ | JPMorgan; JP Morgan; J.P. Morgan; JPMC; JPMorgan Chase & Co; Chase
Goldman Sachs | goldmansachs.com | mnc bank gcc | New York, US | in p1 | cu:https://higher.gs.com/results url:https://higher.gs.com/ | GS; Goldman Sachs Services
Morgan Stanley | morganstanley.com | mnc bank gcc | New York, US | in p1 | ef:morganstanley.eightfold.ai,morganstanley.com url:https://www.morganstanley.com/people-opportunities/students-graduates
Wells Fargo | wellsfargo.com | mnc bank gcc | San Francisco, US | in p1 | wd:https://wf.wd1.myworkdayjobs.com/WellsFargoJobs url:https://www.wellsfargojobs.com/ | Wells Fargo International Solutions
Citi | citi.com | mnc bank gcc | New York, US | in p1 | wd:https://citi.wd5.myworkdayjobs.com/2 url:https://jobs.citi.com/ | Citigroup; Citibank; Citicorp
Bank of America | bankofamerica.com | mnc bank gcc | Charlotte, US | in p1 | wd:https://ghr.wd1.myworkdayjobs.com/Lateral-US url:https://careers.bankofamerica.com/ | BofA; Bank of America Merrill Lynch; BA Continuum
American Express | americanexpress.com | mnc bank fintech gcc | New York, US | in p1 | ef:aexp.eightfold.ai,aexp.com url:https://www.americanexpress.com/en-us/careers/ | Amex; AmEx
Visa | visa.com | mnc fintech gcc | San Francisco, US | in p1 | sr:Visa url:https://corporate.visa.com/en/jobs/
Mastercard | mastercard.com | mnc fintech gcc | Purchase, US | in p1 | wd:https://mastercard.wd1.myworkdayjobs.com/CorporateCareers url:https://careers.mastercard.com/
HSBC | hsbc.com | mnc bank gcc | London, GB | in p1 | wd:https://hsbc.wd3.myworkdayjobs.com/external url:https://www.hsbc.com/careers
Barclays | barclays.com | mnc bank gcc | London, GB | in p1 | cu:https://search.jobs.barclays/ url:https://search.jobs.barclays/
Deutsche Bank | db.com | mnc bank gcc | Frankfurt, DE | in p1 | wd:https://db.wd3.myworkdayjobs.com/DBWebsite url:https://careers.db.com/
UBS | ubs.com | mnc bank gcc | Zurich, CH | in p1 | cu:https://jobs.ubs.com/TGnewUI/Search/home/HomeWithPreLoad?partnerid=25008&siteid=5012 url:https://www.ubs.com/global/en/careers.html
Standard Chartered | sc.com | mnc bank gcc | London, GB | in p1 | sf:https://jobs.standardchartered.com/ url:https://www.sc.com/en/careers/ | Standard Chartered Bank
BNP Paribas | bnpparibas.com | mnc bank gcc | Paris, FR | in | cu:https://group.bnpparibas/en/careers/all-job-offers url:https://group.bnpparibas/en/careers/all-job-offers | BNP Paribas India Solutions
Societe Generale | societegenerale.com | mnc bank gcc | Paris, FR | in | cu:https://careers.societegenerale.com/en/search url:https://careers.societegenerale.com/en/search | Société Générale; SocGen; Societe Generale Global Solution Centre
Credit Suisse | credit-suisse.com | mnc bank | Zurich, CH | in | - | CS
Nomura | nomura.com | mnc bank gcc | Tokyo, JP | in | wd:https://nomura.wd3.myworkdayjobs.com/NomuraExternal url:https://www.nomura.com/careers/
Mizuho | mizuhogroup.com | mnc bank | Tokyo, JP | in | - | Mizuho Financial Group
MUFG | mufg.jp | mnc bank gcc | Tokyo, JP | in | wd:https://mufgub.wd3.myworkdayjobs.com/MUFG-Careers | Mitsubishi UFJ
BNY | bny.com | mnc bank gcc | New York, US | in p1 | wd:https://bnymellon.wd5.myworkdayjobs.com/BNY_Careers url:https://www.bny.com/corporate/global/en/careers.html | BNY Mellon; Bank of New York Mellon
State Street | statestreet.com | mnc bank gcc | Boston, US | in p1 | wd:https://statestreet.wd1.myworkdayjobs.com/Global url:https://careers.statestreet.com/
Northern Trust | northerntrust.com | mnc bank gcc | Chicago, US | in p1 | wd:https://ntrs.wd1.myworkdayjobs.com/northerntrust url:https://careers.northerntrust.com/
Capital One | capitalone.com | mnc bank fintech | McLean, US | - | wd:https://capitalone.wd12.myworkdayjobs.com/Capital_One url:https://www.capitalonecareers.com/
Discover Financial | discover.com | mnc bank fintech | Riverwoods, US | - | wd:https://discover.wd5.myworkdayjobs.com/Discover url:https://jobs.discover.com/
Synchrony | synchrony.com | mnc bank fintech gcc | Stamford, US | in | wd:https://synchronyfinancial.wd5.myworkdayjobs.com/careers url:https://www.synchronycareers.com/ | Synchrony Financial
US Bank | usbank.com | mnc bank | Minneapolis, US | - | wd:https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers url:https://careers.usbank.com/ | U.S. Bank; U.S. Bancorp
PNC | pnc.com | mnc bank | Pittsburgh, US | - | wd:https://pnc.wd5.myworkdayjobs.com/External url:https://careers.pnc.com/
Truist | truist.com | mnc bank | Charlotte, US | - | wd:https://truist.wd1.myworkdayjobs.com/Careers
Charles Schwab | schwab.com | mnc bank fintech | Westlake, US | - | wd:https://schwab.wd1.myworkdayjobs.com/External url:https://www.aboutschwab.com/careers | Schwab
BlackRock | blackrock.com | mnc gcc fintech | New York, US | in p1 | wd:https://blackrock.wd1.myworkdayjobs.com/BlackRock_Professional url:https://careers.blackrock.com/
Vanguard | vanguard.com | mnc gcc | Malvern, US | in | wd:https://vanguard.wd5.myworkdayjobs.com/vanguard_external url:https://www.vanguardjobs.com/
Fidelity Investments | fidelity.com | mnc gcc fintech | Boston, US | in p1 | wd:https://fmr.wd1.myworkdayjobs.com/FidelityCareers url:https://jobs.fidelity.com/ | Fidelity; FMR
Fidelity International | fidelityinternational.com | mnc gcc | London, GB | in | wd:https://fil.wd3.myworkdayjobs.com/FidelityInternational url:https://careers.fidelityinternational.com/ | FIL
T. Rowe Price | troweprice.com | mnc | Baltimore, US | - | wd:https://troweprice.wd5.myworkdayjobs.com/TRowePrice
Invesco | invesco.com | mnc gcc | Atlanta, US | in | wd:https://invesco.wd1.myworkdayjobs.com/IVZ url:https://www.invesco.com/corporate/en/careers.html
Franklin Templeton | franklintempleton.com | mnc gcc | San Mateo, US | in | wd:https://franklintempleton.wd5.myworkdayjobs.com/Primary-External-1
Ameriprise Financial | ameriprise.com | mnc gcc | Minneapolis, US | in | wd:https://ameriprise.wd5.myworkdayjobs.com/Ameriprise
Principal Financial Group | principal.com | mnc gcc | Des Moines, US | in | wd:https://principal.wd5.myworkdayjobs.com/Principal url:https://www.principal.com/about-us/careers | Principal Global Services
Prudential Financial | prudential.com | mnc gcc | Newark, US | in | wd:https://pru.wd5.myworkdayjobs.com/Careers
MetLife | metlife.com | mnc gcc | New York, US | in | wd:https://metlife.wd5.myworkdayjobs.com/External
AIG | aig.com | mnc gcc | New York, US | in | wd:https://aig.wd1.myworkdayjobs.com/aig
Chubb | chubb.com | mnc gcc | Zurich, CH | in | wd:https://chubb.wd1.myworkdayjobs.com/Chubb_Careers
Allianz | allianz.com | mnc gcc | Munich, DE | in | sf:https://careers.allianz.com/ | Allianz Technology
AXA | axa.com | mnc gcc | Paris, FR | in | - | AXA XL
Swiss Re | swissre.com | mnc gcc | Zurich, CH | in | sf:https://careers.swissre.com/
Munich Re | munichre.com | mnc gcc | Munich, DE | in | -
Aon | aon.com | mnc gcc consulting | London, GB | in | wd:https://aon.wd1.myworkdayjobs.com/AonCareers url:https://jobs.aon.com/
Marsh McLennan | marshmclennan.com | mnc gcc consulting | New York, US | in | wd:https://mmc.wd1.myworkdayjobs.com/MMC url:https://careers.marshmclennan.com/ | Marsh; Mercer; Oliver Wyman
Willis Towers Watson | wtwco.com | mnc gcc consulting | London, GB | in | wd:https://wtw.wd1.myworkdayjobs.com/Careers | WTW
Travelers | travelers.com | mnc | Hartford, US | - | wd:https://travelers.wd5.myworkdayjobs.com/External
The Hartford | thehartford.com | mnc gcc | Hartford, US | in | wd:https://thehartford.wd5.myworkdayjobs.com/Careers_External
Lloyds Banking Group | lloydsbankinggroup.com | mnc bank gcc | London, GB | in | wd:https://lbg.wd3.myworkdayjobs.com/LBG_Careers | Lloyds Technology Centre India
NatWest Group | natwestgroup.com | mnc bank gcc | Edinburgh, GB | in | wd:https://rbs.wd3.myworkdayjobs.com/NatWestGroup url:https://jobs.natwestgroup.com/ | NatWest; RBS
ING | ing.com | mnc bank | Amsterdam, NL | - | -
ABN AMRO | abnamro.com | mnc bank | Amsterdam, NL | - | -
Rabobank | rabobank.com | mnc bank gcc | Utrecht, NL | in | -
Commonwealth Bank | commbank.com.au | mnc bank gcc | Sydney, AU | in | sf:https://www.commbank.com.au/about-us/careers.html | CommBank; CBA
ANZ | anz.com | mnc bank gcc | Melbourne, AU | in | -
Westpac | westpac.com.au | mnc bank | Sydney, AU | - | -
DBS Bank | dbs.com | mnc bank gcc | Singapore, SG | in p1 | cu:https://www.dbs.com/careers/jobs.page url:https://www.dbs.com/careers/ | DBS; DBS Tech India
OCBC | ocbc.com | mnc bank | Singapore, SG | - | -
Macquarie Group | macquarie.com | mnc bank gcc | Sydney, AU | in | wd:https://mq.wd3.myworkdayjobs.com/CareersatMQ | Macquarie
Nasdaq | nasdaq.com | mnc fintech gcc | New York, US | in | wd:https://nasdaq.wd1.myworkdayjobs.com/Global_External_Site
CME Group | cmegroup.com | mnc fintech gcc | Chicago, US | in | wd:https://cmegroup.wd1.myworkdayjobs.com/cme_careers
Intercontinental Exchange | ice.com | mnc fintech gcc | Atlanta, US | in | wd:https://intercontinentalexchange.wd1.myworkdayjobs.com/ICE | ICE
LSEG | lseg.com | mnc fintech gcc | London, GB | in | wd:https://lseg.wd3.myworkdayjobs.com/Careers | London Stock Exchange Group; Refinitiv
S&P Global | spglobal.com | mnc fintech gcc | New York, US | in p1 | wd:https://spgi.wd5.myworkdayjobs.com/SPGI_Careers url:https://careers.spglobal.com/
Moody's | moodys.com | mnc fintech gcc | New York, US | in | wd:https://moodys.wd5.myworkdayjobs.com/MoodysCareers
MSCI | msci.com | mnc fintech gcc | New York, US | in | wd:https://msci.wd1.myworkdayjobs.com/MSCI
Morningstar | morningstar.com | mnc fintech gcc | Chicago, US | in | wd:https://morningstar.wd5.myworkdayjobs.com/Americas
FactSet | factset.com | mnc fintech gcc product | Norwalk, US | in | wd:https://factset.wd1.myworkdayjobs.com/FactSetCareers
Bloomberg | bloomberg.com | mnc fintech product | New York, US | in | cu:https://bloomberg.avature.net/careers url:https://www.bloomberg.com/company/careers/
Broadridge | broadridge.com | mnc fintech gcc | Lake Success, US | in | wd:https://broadridge.wd5.myworkdayjobs.com/Careers
Fiserv | fiserv.com | mnc fintech gcc | Milwaukee, US | in p1 | wd:https://fiserv.wd5.myworkdayjobs.com/EXT
FIS | fisglobal.com | mnc fintech gcc | Jacksonville, US | in p1 | wd:https://fis.wd5.myworkdayjobs.com/SearchJobs | FIS Global
Global Payments | globalpayments.com | mnc fintech gcc | Atlanta, US | in | wd:https://tsys.wd1.myworkdayjobs.com/TSYS | TSYS
Jack Henry | jackhenry.com | mnc fintech | Monett, US | - | -
Worldline | worldline.com | mnc fintech gcc | Paris, FR | in | -
Adyen | adyen.com | mnc fintech product | Amsterdam, NL | in | gh:adyen url:https://careers.adyen.com/
Klarna | klarna.com | mnc fintech product unicorn | Stockholm, SE | - | -
Wise | wise.com | mnc fintech product | London, GB | in | gh:wise url:https://wise.jobs/ | TransferWise
Revolut | revolut.com | mnc fintech unicorn | London, GB | in | cu:https://www.revolut.com/careers/
Monzo | monzo.com | fintech startup unicorn | London, GB | - | gh:monzo
Chime | chime.com | fintech unicorn startup | San Francisco, US | - | gh:chime
Plaid | plaid.com | fintech unicorn startup | San Francisco, US | - | lv:plaid
Brex | brex.com | fintech unicorn startup | San Francisco, US | in remote | gh:brex
Ramp | ramp.com | fintech unicorn startup | New York, US | - | ab:ramp
Affirm | affirm.com | fintech mnc product | San Francisco, US | remote | gh:affirm
SoFi | sofi.com | fintech mnc | San Francisco, US | - | gh:sofi
Marqeta | marqeta.com | fintech product | Oakland, US | remote | gh:marqeta
Toast | toasttab.com | fintech product | Boston, US | in | gh:toast
Checkout.com | checkout.com | fintech unicorn startup | London, GB | - | gh:checkoutcom
Rapyd | rapyd.net | fintech unicorn startup | London, GB | - | -
Experian | experian.com | mnc fintech gcc | Dublin, IE | in p1 | wd:https://experian.wd3.myworkdayjobs.com/experian_careers url:https://jobs.experian.com/
Equifax | equifax.com | mnc fintech gcc | Atlanta, US | in | wd:https://equifax.wd5.myworkdayjobs.com/External
TransUnion | transunion.com | mnc fintech gcc | Chicago, US | in | wd:https://transunion.wd5.myworkdayjobs.com/TransUnion | TransUnion CIBIL
Dun & Bradstreet | dnb.com | mnc fintech | Jacksonville, US | in | wd:https://dnb.wd1.myworkdayjobs.com/Careers
Western Union | westernunion.com | mnc fintech gcc | Denver, US | in | wd:https://westernunion.wd5.myworkdayjobs.com/WesternUnionCareers
Euronet | euronetworldwide.com | mnc fintech | Leawood, US | in | -
Temenos | temenos.com | mnc fintech product | Geneva, CH | in | -
Finastra | finastra.com | mnc fintech product gcc | London, GB | in | wd:https://finastra.wd3.myworkdayjobs.com/FinastraCareers
SS&C Technologies | ssctech.com | mnc fintech product gcc | Windsor, US | in | wd:https://ssctech.wd5.myworkdayjobs.com/SSCTechnologies | SS&C
Envestnet | envestnet.com | fintech product gcc | Berwyn, US | in | wd:https://envestnet.wd1.myworkdayjobs.com/Envestnet
Two Sigma | twosigma.com | fintech mnc | New York, US | - | gh:twosigma
Citadel | citadel.com | fintech mnc | Miami, US | - | -
Jane Street | janestreet.com | fintech mnc | New York, US | - | -
Tower Research Capital | tower-research.com | fintech mnc | New York, US | in p1 | gh:towerresearchcapital | Tower Research
DE Shaw | deshaw.com | fintech mnc | New York, US | in p1 | cu:https://www.deshawindia.com/careers url:https://www.deshawindia.com/careers | D. E. Shaw; D.E. Shaw India
Optiver | optiver.com | fintech mnc | Amsterdam, NL | in | gh:optiverus
IMC Trading | imc.com | fintech mnc | Amsterdam, NL | in | gh:imc
Hudson River Trading | hudsonrivertrading.com | fintech mnc | New York, US | - | gh:wehrtyou | HRT
Jump Trading | jumptrading.com | fintech mnc | Chicago, US | - | gh:jumptrading
Virtu Financial | virtu.com | fintech mnc | New York, US | in | gh:virtu
Graviton Research Capital | gravitontrading.com | fintech startup | Gurugram, IN | in | lv:graviton
Quadeye | quadeye.com | fintech startup | Gurugram, IN | in | -
WorldQuant | worldquant.com | fintech mnc | Old Greenwich, US | in | gh:worldquant
AQR Capital | aqr.com | fintech mnc | Greenwich, US | in | gh:aqr | AQR
Squarepoint Capital | squarepoint-capital.com | fintech mnc | London, GB | in | gh:squarepointcapital
Millennium Management | mlp.com | fintech mnc | New York, US | in | gh:millenniummanagement | Millennium
Kotak Mahindra Bank | kotak.com | bank | Mumbai, IN | in p1 | cu:https://www.kotak.com/en/careers.html | Kotak
HDFC Bank | hdfcbank.com | bank | Mumbai, IN | in p1 | cu:https://www.hdfcbank.com/personal/about-us/careers
ICICI Bank | icicibank.com | bank | Mumbai, IN | in p1 | cu:https://www.icicibank.com/careers
Axis Bank | axisbank.com | bank | Mumbai, IN | in p1 | cu:https://www.axisbank.com/careers
IndusInd Bank | indusind.com | bank | Mumbai, IN | in | -
Yes Bank | yesbank.in | bank | Mumbai, IN | in | -
IDFC First Bank | idfcfirstbank.com | bank | Mumbai, IN | in | -
Bajaj Finserv | bajajfinserv.in | fintech | Pune, IN | in p1 | cu:https://www.bajajfinserv.in/careers | Bajaj Finance
HDFC Life | hdfclife.com | - | Mumbai, IN | in | -
ICICI Lombard | icicilombard.com | - | Mumbai, IN | in | -
Jio Financial Services | jfs.in | fintech | Mumbai, IN | in | -
`);
