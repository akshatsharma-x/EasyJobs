import { parseCandidates } from "./parse";

// Second wave: product companies with Indian engineering centres, remote-first companies, quant firms,
// more Indian startups and IT firms, and Greenhouse/Lever/Ashby-heavy scaleups.
// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("more", `
# ── Global product companies with Indian engineering centres ──
Tekion | tekion.com | unicorn product startup | San Ramon, US | in p1 | -
Roku | roku.com | mnc product gcc | San Jose, US | in | -
Indeed | indeed.com | mnc product gcc | Austin, US | in p1 | -
Zynga | zynga.com | mnc product | San Francisco, US | in | -
FICO | fico.com | mnc product gcc fintech | Bozeman, US | in | - | Fair Isaac
GoTo | goto.com | product mnc | Boston, US | in | - | LogMeIn
Helpshift | helpshift.com | product startup | San Francisco, US | in | -
Egnyte | egnyte.com | product unicorn | Mountain View, US | in | -
DevRev | devrev.ai | product unicorn ai | Palo Alto, US | in p1 | -
Branch | branch.io | product unicorn | Mountain View, US | in | - | Branch Metrics
Canonical | canonical.com | product mnc | London, GB | in remote | gh:canonical | Ubuntu
Fanatics | fanatics.com | product mnc | Jacksonville, US | in | -
Alation | alation.com | product unicorn | Redwood City, US | in | -
Visier | visier.com | product unicorn | Vancouver, CA | in | -
Contentstack | contentstack.com | product startup | San Francisco, US | in | -
Mattermost | mattermost.com | product startup | Palo Alto, US | in remote | -
HackerOne | hackerone.com | product startup | San Francisco, US | in remote | -
Khan Academy | khanacademy.org | product | Mountain View, US | in remote | -
Upwork | upwork.com | product | San Francisco, US | in remote | -
Automattic | automattic.com | product | San Francisco, US | in remote | - | WordPress.com; Tumblr
Wikimedia Foundation | wikimediafoundation.org | product | San Francisco, US | remote | -
Mozilla | mozilla.org | product | San Francisco, US | remote | -
DuckDuckGo | duckduckgo.com | product | Paoli, US | remote | -
Doist | doist.com | product startup | Remote, PT | remote | - | Todoist
Buffer | buffer.com | product startup | Remote, US | remote | -
Stack Overflow | stackoverflow.co | product | New York, US | remote | -
Globalization Partners | globalization-partners.com | product | Boston, US | remote | - | G-P
Pluralsight | pluralsight.com | product | Draper, US | in | -
LiveRamp | liveramp.com | product | San Francisco, US | in | -
Domo | domo.com | product | American Fork, US | in | -
Jamf | jamf.com | product | Minneapolis, US | in | -
Exabeam | exabeam.com | product startup | Foster City, US | in | -
Dremio | dremio.com | product unicorn | Santa Clara, US | in | -
Mapbox | mapbox.com | product startup | Washington, US | in | -
Sift | sift.com | product startup | San Francisco, US | in | -
Udacity | udacity.com | product | Mountain View, US | in | -
Asurion | asurion.com | mnc product gcc | Nashville, US | in | -
Appian | appian.com | product | McLean, US | in | -
Pipedrive | pipedrive.com | product unicorn | New York, US | - | -
Athenahealth | athenahealth.com | product gcc | Watertown, US | in p1 | - | athenahealth
Siemens Healthineers | siemens-healthineers.com | mnc product gcc | Erlangen, DE | in | -
Arcesium | arcesium.com | fintech product | New York, US | in p1 | -
AlphaGrep | alphagrep.com | fintech startup | Singapore, SG | in | - | AlphaGrep Securities
iRage | irage.in | fintech startup | Mumbai, IN | in | -
Futures First | futuresfirst.com | fintech | Gurugram, IN | in | -
NK Securities Research | nksecurities.com | fintech startup | Gurugram, IN | in | -
Akuna Capital | akunacapital.com | fintech | Chicago, US | - | -
Susquehanna International Group | sig.com | fintech mnc | Bala Cynwyd, US | in | - | SIG; Susquehanna
DRW | drw.com | fintech | Chicago, US | - | -
Flow Traders | flowtraders.com | fintech | Amsterdam, NL | in | -
Maven Securities | mavensecurities.com | fintech | London, GB | - | -
Qube Research & Technologies | qube-rt.com | fintech | London, GB | in | - | QRT
Balyasny Asset Management | bamfunds.com | fintech | Chicago, US | in | - | Balyasny
Point72 | point72.com | fintech mnc | Stamford, US | in | -
Bridgewater Associates | bridgewater.com | fintech mnc | Westport, US | - | -
Man Group | man.com | fintech mnc | London, GB | - | -
Schonfeld | schonfeld.com | fintech | New York, US | in | -
Coupang | coupang.com | mnc product | Seattle, US | in | -
Workiva Inc | workiva.com | product | Ames, US | in | -
Sprout Social | sproutsocial.com | product | Chicago, US | - | -
Hootsuite | hootsuite.com | product | Vancouver, CA | - | -
Vimeo | vimeo.com | product | New York, US | in | -
Wrike | wrike.com | product | San Diego, US | - | -
Prezi | prezi.com | product startup | San Francisco, US | - | -
PandaDoc | pandadoc.com | product unicorn | San Francisco, US | - | -
Kaseya | kaseya.com | product mnc | Miami, US | in | -
Datto | datto.com | product | Norwalk, US | - | -
ConnectWise | connectwise.com | product | Tampa, US | in | -
SolarWinds | solarwinds.com | product | Austin, US | in | -
ManageEngine | manageengine.com | product | Chennai, IN | in | -
Progress Software | progress.com | product | Burlington, US | in | -
Rocket Software | rocketsoftware.com | product | Waltham, US | in | -
Quest Software | quest.com | product | Aliso Viejo, US | in | -
BMC Software | bmc.com | product mnc gcc | Houston, US | in p1 | - | BMC Helix
Unisys | unisys.com | mnc service | Blue Bell, US | in | -
NCR Voyix | ncrvoyix.com | mnc product gcc | Atlanta, US | in | - | NCR
NCR Atleos | ncratleos.com | mnc product gcc | Atlanta, US | in | -
Diebold Nixdorf | dieboldnixdorf.com | mnc product | Hudson, US | in | -
Xerox | xerox.com | mnc product | Norwalk, US | in | -
Pitney Bowes | pitneybowes.com | mnc product | Stamford, US | in | -
Conduent | conduent.com | mnc service | Florham Park, US | in | -
Gainwell Technologies | gainwelltechnologies.com | service | Conshohocken, US | in | -
Cotiviti | cotiviti.com | product | Atlanta, US | in | -
Change Healthcare | changehealthcare.com | product | Nashville, US | in | -
R1 RCM | r1rcm.com | service | Murray, US | in | -
Inovalon | inovalon.com | product | Bowie, US | in | -
Netsmart | ntst.com | product | Overland Park, US | in | -
Allscripts | veradigm.com | product | Chicago, US | in | - | Veradigm
Ellucian | ellucian.com | product | Reston, US | in | -
PowerSchool | powerschool.com | product | Folsom, US | in | -
Anthology | anthology.com | product | Boca Raton, US | in | - | Blackboard
2U | 2u.com | product | Lanham, US | - | -
McGraw Hill | mheducation.com | product mnc | New York, US | in | -
Wiley | wiley.com | mnc product | Hoboken, US | in | -
Springer Nature | springernature.com | mnc product | London, GB | in | -
Elsevier | elsevier.com | mnc product gcc | Amsterdam, NL | in | -
Clarivate | clarivate.com | mnc product | London, GB | in | -
IDC | idc.com | mnc consulting | Needham, US | in | -
Nielsen | nielsen.com | mnc product gcc | New York, US | in | - | NielsenIQ
NielsenIQ | nielseniq.com | mnc product gcc | Chicago, US | in | - | NIQ
Kantar | kantar.com | mnc consulting | London, GB | in | -
Ipsos | ipsos.com | mnc consulting | Paris, FR | in | -
Circana | circana.com | mnc product | Chicago, US | in | - | IRI; NPD
Dentsu | dentsu.com | mnc service | Tokyo, JP | in | - | Merkle
WPP | wpp.com | mnc service | London, GB | in | - | GroupM; Ogilvy
Publicis Groupe | publicisgroupe.com | mnc service | Paris, FR | in | - | Epsilon
Omnicom | omnicomgroup.com | mnc service | New York, US | in | -
Havas | havas.com | mnc service | Paris, FR | in | -
# ── Indian startups & product companies (more) ──
Clear | clear.in | fintech startup product | Bengaluru, IN | in | - | ClearTax
Yubi | go-yubi.com | unicorn fintech product | Chennai, IN | in p1 | - | CredAvenue
Kuvera | kuvera.in | fintech startup | Bengaluru, IN | in | -
Scripbox | scripbox.com | fintech startup | Bengaluru, IN | in | -
ET Money | etmoney.com | fintech product | Gurugram, IN | in | -
Sensibull | sensibull.com | fintech startup | Bengaluru, IN | in | -
Fisdom | fisdom.com | fintech startup | Bengaluru, IN | in | -
Kiwi | gokiwi.in | fintech startup | Bengaluru, IN | in | -
Freo | freo.money | fintech startup | Bengaluru, IN | in | - | MoneyTap
CASHe | cashe.co.in | fintech startup | Mumbai, IN | in | -
Kinara Capital | kinaracapital.com | fintech | Bengaluru, IN | in | -
Vivriti Capital | vivriticapital.com | fintech | Chennai, IN | in | -
Northern Arc | northernarc.com | fintech | Chennai, IN | in | -
Easebuzz | easebuzz.in | fintech startup | Pune, IN | in | -
Innoviti | innoviti.com | fintech startup | Bengaluru, IN | in | -
Hyperface | hyperface.co | fintech startup | Bengaluru, IN | in | -
Fello | fello.in | fintech startup | Bengaluru, IN | in | -
WazirX | wazirx.com | fintech startup | Mumbai, IN | in | -
ZebPay | zebpay.com | fintech startup | Bengaluru, IN | in | -
Tookitaki | tookitaki.com | fintech startup ai | Singapore, SG | in | -
SpotDraft | spotdraft.com | product startup ai | Bengaluru, IN | in | -
Airmeet | airmeet.com | product startup | Bengaluru, IN | in | -
Zoko | zoko.io | product startup | Bengaluru, IN | in | -
Toplyne | toplyne.io | product startup ai | Bengaluru, IN | in | -
Signeasy | signeasy.com | product startup | Bengaluru, IN | in | -
LambdaTest | lambdatest.com | product startup | San Francisco, US | in | -
Testsigma | testsigma.com | product startup | Bengaluru, IN | in | -
DronaHQ | dronahq.com | product startup | Mumbai, IN | in | -
Appsmith | appsmith.com | product startup | San Francisco, US | in remote | -
ToolJet | tooljet.com | product startup | San Francisco, US | in remote | -
SigNoz | signoz.io | product startup | San Francisco, US | in remote | -
Last9 | last9.io | product startup | Bengaluru, IN | in | -
Middleware | middleware.io | product startup | San Francisco, US | in | -
Zenduty | zenduty.com | product startup | Bengaluru, IN | in | -
Fynd | fynd.com | product startup | Mumbai, IN | in | - | Shopsense Retail Technologies
GoKwik | gokwik.co | product startup | New Delhi, IN | in | -
Shopflo | shopflo.com | product startup | Bengaluru, IN | in | -
Wati | wati.io | product startup | Singapore, SG | in | -
Interakt | interakt.shop | product startup | Mumbai, IN | in | -
Gallabox | gallabox.com | product startup | Bengaluru, IN | in | -
BiteSpeed | bitespeed.co | product startup | Bengaluru, IN | in | -
Knowlarity | knowlarity.com | product | Gurugram, IN | in | -
Shipsy | shipsy.io | product startup | Gurugram, IN | in | -
Pickrr | pickrr.com | product startup | Gurugram, IN | in | -
Zippee | zippee.delivery | startup | Gurugram, IN | in | -
Vahak | vahak.in | startup product | Bengaluru, IN | in | -
LetsTransport | letstransport.in | startup | Bengaluru, IN | in | -
Onsurity | onsurity.com | startup fintech | Bengaluru, IN | in | -
Loop Health | loophealth.com | startup | Bengaluru, IN | in | -
Truemeds | truemeds.in | startup | Mumbai, IN | in | -
Healthians | healthians.com | startup | Gurugram, IN | in | -
Redcliffe Labs | redcliffelabs.com | startup | Noida, IN | in | -
Sugar.fit | sugarfit.com | startup product | Bengaluru, IN | in | -
Tricog | tricog.com | startup ai | Bengaluru, IN | in | -
SigTuple | sigtuple.com | startup ai | Bengaluru, IN | in | -
Wadhwani AI | wadhwaniai.org | ai | Mumbai, IN | in | -
Niramai | niramai.com | startup ai | Bengaluru, IN | in | -
Rephrase.ai | rephrase.ai | startup ai | Bengaluru, IN | in | -
Lumiq | lumiq.ai | startup ai | Noida, IN | in | -
Arya.ai | arya.ai | startup ai | Mumbai, IN | in | -
Course5 Intelligence | course5i.com | service ai | Mumbai, IN | in | -
Indium Software | indiumsoftware.com | service | Chennai, IN | in | -
Kellton | kellton.com | service | Gurugram, IN | in | -
Saksoft | saksoft.com | service | Chennai, IN | in | -
Datamatics | datamatics.com | service | Mumbai, IN | in | -
Junglee Games | jungleegames.com | startup product | Gurugram, IN | in | -
Head Digital Works | headdigitalworks.com | startup product | Hyderabad, IN | in | - | A23
Baazi Games | baazigames.com | startup product | New Delhi, IN | in | - | PokerBaazi
Octro | octro.com | startup product | Noida, IN | in | -
SuperGaming | supergaming.com | startup product | Pune, IN | in | -
Nodwin Gaming | nodwingaming.com | startup | Gurugram, IN | in | -
Loco | loco.com | startup product | Mumbai, IN | in | -
Rooter | rooter.gg | startup product | New Delhi, IN | in | -
CaratLane | caratlane.com | startup product | Chennai, IN | in | -
BlueStone | bluestone.com | startup product | Bengaluru, IN | in | -
GIVA | giva.co | startup product | Bengaluru, IN | in | -
Pilgrim | discoverpilgrim.com | startup | Mumbai, IN | in | -
Minimalist | beminimalist.co | startup | Jaipur, IN | in | -
The Souled Store | thesouledstore.com | startup | Mumbai, IN | in | -
Bombay Shaving Company | bombayshavingcompany.com | startup | New Delhi, IN | in | -
Mokobara | mokobara.com | startup | Bengaluru, IN | in | -
Curefoods | curefoods.in | startup | Bengaluru, IN | in | -
Third Wave Coffee | thirdwavecoffee.in | startup | Bengaluru, IN | in | -
Blue Tokai | bluetokaicoffee.com | startup | New Delhi, IN | in | -
Milkbasket | milkbasket.com | startup | Gurugram, IN | in | -
CarTrade | cartrade.com | product | Mumbai, IN | in | -
Revv | revv.co.in | startup | Gurugram, IN | in | -
Vogo | vogo.in | startup | Bengaluru, IN | in | -
NoPaperForms | nopaperforms.com | product startup | Gurugram, IN | in | - | Meritto
Doubtnut | doubtnut.com | startup product | Gurugram, IN | in | -
Toppr | toppr.com | startup product | Mumbai, IN | in | -
Embibe | embibe.com | startup product ai | Bengaluru, IN | in | -
Byju's Aakash | aakash.ac.in | product | New Delhi, IN | in | - | Aakash Educational Services
Allen Digital | allen.in | startup product | Bengaluru, IN | in | - | Allen Career Institute
Hashnode | hashnode.com | startup product | Bengaluru, IN | in remote | -
Frappe | frappe.io | startup product | Mumbai, IN | in | - | ERPNext
Zerodha Rainmatter | rainmatter.com | fintech | Bengaluru, IN | in | -
# ── More global startups & scaleups ──
Blend | blend.com | fintech product | San Francisco, US | - | -
Bloomreach | bloomreach.com | product unicorn | Mountain View, US | in | -
Brightwheel | mybrightwheel.com | startup product | San Francisco, US | - | -
ClassPass | classpass.com | startup product | New York, US | - | -
Clever | clever.com | startup product | San Francisco, US | - | -
CloudKitchens | cloudkitchens.com | startup unicorn | Los Angeles, US | - | -
Doximity | doximity.com | product | San Francisco, US | remote | -
Earnin | earnin.com | fintech startup | Palo Alto, US | - | -
Everlaw | everlaw.com | product startup | Oakland, US | - | -
fuboTV | fubo.tv | product | New York, US | - | - | Fubo
Imply | imply.io | product startup | Burlingame, US | in | -
Justworks | justworks.com | product | New York, US | - | -
Lime | li.me | product startup | San Francisco, US | - | -
Lucid Software | lucid.co | product unicorn | South Jordan, US | in | - | Lucidchart
MasterClass | masterclass.com | product startup | San Francisco, US | - | -
Neuralink | neuralink.com | startup | Fremont, US | - | -
Niantic | nianticlabs.com | product | San Francisco, US | - | -
Omada Health | omadahealth.com | product | San Francisco, US | - | -
Postscript | postscript.io | startup product | San Francisco, US | remote | -
StackAdapt | stackadapt.com | startup product | Toronto, CA | remote | -
Upstart | upstart.com | fintech product | San Mateo, US | remote | -
Via | ridewithvia.com | startup unicorn product | New York, US | - | - | Via Transportation
Voleon | voleon.com | fintech | Berkeley, US | - | -
Workrise | workrise.com | startup | Austin, US | - | -
Yext | yext.com | product | New York, US | - | -
AppFolio | appfolio.com | product | Santa Barbara, US | - | -
Articulate | articulate.com | product | New York, US | remote | -
BetterUp | betterup.com | startup unicorn | San Francisco, US | - | -
BigCommerce | bigcommerce.com | product | Austin, US | - | -
Bitly | bitly.com | product | New York, US | - | -
Bugcrowd | bugcrowd.com | startup product | San Francisco, US | remote | -
Carbon Health | carbonhealth.com | startup | San Francisco, US | - | -
Cedar | cedar.com | startup unicorn | New York, US | - | -
Clio | clio.com | product unicorn | Burnaby, CA | - | -
Collibra | collibra.com | product unicorn | New York, US | - | -
Commure | commure.com | startup unicorn | Mountain View, US | in | -
Copper | copper.com | product startup | San Francisco, US | - | -
Dashlane | dashlane.com | product startup | New York, US | - | -
Dataminr | dataminr.com | product unicorn ai | New York, US | - | -
DoubleVerify | doubleverify.com | product | New York, US | - | -
Dutchie | dutchie.com | startup unicorn | Bend, US | - | -
Envoy | envoy.com | startup product | San Francisco, US | - | -
Everbridge | everbridge.com | product | Burlington, US | in | -
Evernote | evernote.com | product | Redwood City, US | - | -
FanDuel | fanduel.com | product | New York, US | - | -
Fetch | fetch.com | startup unicorn | Madison, US | - | - | Fetch Rewards
Filevine | filevine.com | startup unicorn | Salt Lake City, US | - | -
FloQast | floqast.com | startup product | Los Angeles, US | - | -
Fountain | fountain.com | startup | San Francisco, US | - | -
Frontify | frontify.com | startup product | St. Gallen, CH | - | -
Gitpod | gitpod.io | startup product | Kiel, DE | remote | - | Ona
Glassdoor | glassdoor.com | product | San Francisco, US | - | -
GoodRx | goodrx.com | product | Santa Monica, US | - | -
Grubhub | grubhub.com | product | Chicago, US | - | -
Wellhub | wellhub.com | startup unicorn | New York, US | - | - | Gympass
iCapital | icapitalnetwork.com | fintech unicorn | New York, US | in | -
InfluxData | influxdata.com | startup product | San Francisco, US | remote | -
Instructure | instructure.com | product | Salt Lake City, US | - | - | Canvas LMS
Intapp | intapp.com | product | Palo Alto, US | in | -
Jumio | jumio.com | startup product | Sunnyvale, US | in | -
Kinsta | kinsta.com | startup product | Los Angeles, US | remote | -
Knock | knock.app | startup product | San Francisco, US | - | -
Kustomer | kustomer.com | startup product | New York, US | - | -
Liferay | liferay.com | product | Diamond Bar, US | in | -
Lucidworks | lucidworks.com | product startup ai | San Francisco, US | - | -
MeridianLink | meridianlink.com | fintech product | Costa Mesa, US | - | -
Nextiva | nextiva.com | product | Scottsdale, US | in | -
Nuvei | nuvei.com | fintech | Montreal, CA | - | -
Olo | olo.com | product | New York, US | - | -
OneSignal | onesignal.com | startup product | San Mateo, US | remote | -
Onfido | onfido.com | startup product | London, GB | in | -
OpenTable | opentable.com | product | San Francisco, US | - | -
Outschool | outschool.com | startup product | San Francisco, US | remote | -
Paylocity | paylocity.com | product | Schaumburg, US | - | -
Pitch | pitch.com | startup product | Berlin, DE | remote | -
Qualia | qualia.com | startup product | San Francisco, US | - | -
Quantcast | quantcast.com | product | San Francisco, US | - | -
Quantum Metric | quantummetric.com | startup product | Colorado Springs, US | - | -
Recharge | rechargepayments.com | startup product | Santa Monica, US | - | -
Relativity | relativity.com | product | Chicago, US | in | -
SeatGeek | seatgeek.com | product unicorn | New York, US | - | -
ShipBob | shipbob.com | startup unicorn | Chicago, US | - | -
Shippo | goshippo.com | startup product | San Francisco, US | - | -
Showpad | showpad.com | startup product | Ghent, BE | - | -
Signifyd | signifyd.com | startup product | San Jose, US | - | -
SimilarWeb | similarweb.com | product | Tel Aviv, IL | - | -
Smartling | smartling.com | product startup | New York, US | - | -
Sonos | sonos.com | product | Santa Barbara, US | - | -
SoundCloud | soundcloud.com | product | Berlin, DE | - | -
Tala | tala.co | fintech startup | Santa Monica, US | in | -
Turo | turo.com | product | San Francisco, US | - | -
Wealthsimple | wealthsimple.com | fintech unicorn | Toronto, CA | - | -
ZipRecruiter | ziprecruiter.com | product | Santa Monica, US | - | -
Anrok | anrok.com | startup fintech | San Francisco, US | - | -
Arc | arc.dev | startup | Remote, US | remote | -
Ashby | ashbyhq.com | startup product | San Francisco, US | remote | ab:ashby
Attio | attio.com | startup product | London, GB | remote | -
Clerk | clerk.com | startup product | San Francisco, US | remote | -
Convex | convex.dev | startup product | San Francisco, US | - | -
Cortex | cortex.io | startup product | San Francisco, US | - | -
Coder | coder.com | startup product | Austin, US | remote | -
Codeium | codeium.com | ai startup product | Mountain View, US | - | -
Depot | depot.dev | startup product | Remote, US | remote | -
Doppler | doppler.com | startup product | San Francisco, US | remote | -
Encore | encore.dev | startup product | Stockholm, SE | remote | -
Eppo | geteppo.com | startup product | San Francisco, US | - | -
Grafbase | grafbase.com | startup product | Stockholm, SE | remote | -
Graphite | graphite.dev | startup product | New York, US | - | -
Hookdeck | hookdeck.com | startup product | Montreal, CA | remote | -
Inngest | inngest.com | startup product | San Francisco, US | remote | -
Liveblocks | liveblocks.io | startup product | San Francisco, US | remote | -
Motherduck | motherduck.com | startup product | Seattle, US | - | - | MotherDuck
Nango | nango.dev | startup product | San Francisco, US | remote | -
Novu | novu.co | startup product | Tel Aviv, IL | remote | -
Nx | nx.dev | startup product | Phoenix, US | remote | - | Nrwl
Paragon | useparagon.com | startup product | San Francisco, US | - | -
Prisma | prisma.io | startup product | Berlin, DE | remote | -
Propel | propel.app | startup fintech | Brooklyn, US | - | -
Quadratic | quadratichq.com | startup product | Remote, US | remote | -
Rive | rive.app | startup product | San Francisco, US | remote | -
Statsig | statsig.com | startup product | Bellevue, US | - | -
Svix | svix.com | startup product | New York, US | remote | -
Tinybird | tinybird.co | startup product | Madrid, ES | remote | -
Turso | turso.tech | startup product | Remote, US | remote | -
Upstash | upstash.com | startup product | Santa Clara, US | remote | -
Val Town | val.town | startup product | Brooklyn, US | - | -
WorkOS | workos.com | startup product | San Francisco, US | remote | -
Xata | xata.io | startup product | Berlin, DE | remote | -
Ramp Network | rampnetwork.com | fintech startup | London, GB | remote | -
Gorgias | gorgias.com | startup product | San Francisco, US | - | -
Okendo | okendo.io | startup product | Sydney, AU | remote | -
Yotpo | yotpo.com | startup product | New York, US | - | -
Triple Whale | triplewhale.com | startup product | Columbus, US | - | -
`);
