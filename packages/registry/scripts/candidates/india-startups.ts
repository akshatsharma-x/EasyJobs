import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("india-startups", `
# ── Consumer internet & commerce ──
Flipkart | flipkart.com | unicorn product mnc | Bengaluru, IN | in p1 | url:https://www.flipkartcareers.com/ | Flipkart Internet
Myntra | myntra.com | unicorn product | Bengaluru, IN | in p1 | url:https://careers.myntra.com/ | Myntra Designs
Cleartrip | cleartrip.com | product startup | Bengaluru, IN | in | -
Swiggy | swiggy.com | unicorn product | Bengaluru, IN | in p1 | url:https://careers.swiggy.com/ | Bundl Technologies; Swiggy Instamart
Zomato | zomato.com | unicorn product | Gurugram, IN | in p1 | cu:https://www.zomato.com/careers url:https://www.zomato.com/careers | Eternal; Eternal Limited; Zomato Limited
Blinkit | blinkit.com | unicorn product | Gurugram, IN | in p1 | - | Grofers
Zepto | zeptonow.com | unicorn product startup | Mumbai, IN | in p1 | - | Kiranakart Technologies
BigBasket | bigbasket.com | unicorn product | Bengaluru, IN | in p1 | - | Supermarket Grocery Supplies
Meesho | meesho.com | unicorn product | Bengaluru, IN | in p1 | url:https://www.meesho.io/jobs | Fashnear Technologies
Nykaa | nykaa.com | unicorn product | Mumbai, IN | in p1 | url:https://careers.nykaa.com/ | FSN E-Commerce Ventures
Lenskart | lenskart.com | unicorn product | Gurugram, IN | in p1 | - | Lenskart Solutions
FirstCry | firstcry.com | unicorn product | Pune, IN | in p1 | - | Brainbees Solutions
Urban Company | urbancompany.com | unicorn product | Gurugram, IN | in p1 | - | UrbanClap
Udaan | udaan.com | unicorn product | Bengaluru, IN | in p1 | -
Licious | licious.in | unicorn product | Bengaluru, IN | in p1 | -
Country Delight | countrydelight.in | startup product | Gurugram, IN | in | -
FreshToHome | freshtohome.com | startup product | Bengaluru, IN | in | -
Dunzo | dunzo.com | startup product | Bengaluru, IN | in | -
Snapdeal | snapdeal.com | product | New Delhi, IN | in | - | AceVector
ShopClues | shopclues.com | product | Gurugram, IN | in | -
Pepperfry | pepperfry.com | product startup | Mumbai, IN | in | -
Livspace | livspace.com | unicorn product | Bengaluru, IN | in p1 | -
HomeLane | homelane.com | startup product | Bengaluru, IN | in | -
NoBroker | nobroker.in | unicorn product | Bengaluru, IN | in p1 | -
Housing.com | housing.com | product | Mumbai, IN | in | -
Square Yards | squareyards.com | product startup | Gurugram, IN | in | -
Info Edge | infoedge.in | product | Noida, IN | in p1 | cu:https://careers.infoedge.com/ | Naukri; Naukri.com; 99acres; Jeevansathi; Shiksha
foundit | foundit.in | product | Hyderabad, IN | in | - | Monster India
Purplle | purplle.com | unicorn product | Mumbai, IN | in | -
Mamaearth | honasa.in | unicorn product | Gurugram, IN | in | - | Honasa Consumer
Sugar Cosmetics | sugarcosmetics.com | startup product | Mumbai, IN | in | -
boAt | boat-lifestyle.com | unicorn product | New Delhi, IN | in | - | Imagine Marketing
Noise | gonoise.com | startup product | Gurugram, IN | in | -
Bewakoof | bewakoof.com | startup product | Mumbai, IN | in | -
Wakefit | wakefit.co | startup product | Bengaluru, IN | in | -
Rebel Foods | rebelfoods.com | unicorn product | Mumbai, IN | in | - | Faasos; EatSure
Magicpin | magicpin.in | startup product | Gurugram, IN | in | -
CityMall | citymall.live | startup product | Gurugram, IN | in | -
DealShare | dealshare.in | unicorn startup | Bengaluru, IN | in | -
Jumbotail | jumbotail.com | startup product | Bengaluru, IN | in | -
ElasticRun | elastic.run | unicorn startup | Pune, IN | in | -
Moglix | moglix.com | unicorn product | Noida, IN | in | -
OfBusiness | ofbusiness.com | unicorn startup | Gurugram, IN | in | -
Zetwerk | zetwerk.com | unicorn startup | Bengaluru, IN | in p1 | -
Infra.Market | infra.market | unicorn startup | Mumbai, IN | in | -
Bizongo | bizongo.com | startup | Mumbai, IN | in | -
Tata Digital | tatadigital.com | product | Mumbai, IN | in p1 | cu:https://www.tatadigital.com/careers | Tata Neu; Tata CLiQ; Tata 1mg
Tata 1mg | 1mg.com | product unicorn | Gurugram, IN | in | -
PharmEasy | pharmeasy.in | unicorn product | Mumbai, IN | in | - | API Holdings
Practo | practo.com | product startup | Bengaluru, IN | in | -
Cult.fit | cult.fit | unicorn product | Bengaluru, IN | in | - | Curefit
HealthifyMe | healthifyme.com | startup product | Bengaluru, IN | in | -
Ultrahuman | ultrahuman.com | startup product | Bengaluru, IN | in | -
Pristyn Care | pristyncare.com | unicorn startup | Gurugram, IN | in | -
MediBuddy | medibuddy.in | startup product | Bengaluru, IN | in | -
Innovaccer | innovaccer.com | unicorn product ai | San Francisco, US | in p1 | -
Qure.ai | qure.ai | ai startup | Mumbai, IN | in | -
Eka Care | eka.care | startup product | Bengaluru, IN | in | -
OYO | oyorooms.com | unicorn product | Gurugram, IN | in p1 | - | Oravel Stays; OYO Rooms
MakeMyTrip | makemytrip.com | product mnc | Gurugram, IN | in p1 | cu:https://careers.makemytrip.com/ | MMT; GoIbibo
ixigo | ixigo.com | product startup | Gurugram, IN | in | - | Le Travenues Technology
EaseMyTrip | easemytrip.com | product | New Delhi, IN | in | -
Yatra | yatra.com | product | Gurugram, IN | in | -
Treebo Hotels | treebo.com | startup product | Bengaluru, IN | in | - | Treebo
Cars24 | cars24.com | unicorn product | Gurugram, IN | in p1 | -
Spinny | spinny.com | unicorn product | Gurugram, IN | in p1 | -
CarDekho | cardekho.com | unicorn product | Jaipur, IN | in p1 | - | Girnar Software
Park+ | parkplus.io | startup product | Gurugram, IN | in | - | Park Plus
Droom | droom.in | startup product | Gurugram, IN | in | -
Zoomcar | zoomcar.com | startup product | Bengaluru, IN | in | -
Ola | olacabs.com | unicorn product | Bengaluru, IN | in p1 | - | ANI Technologies; Ola Cabs
Rapido | rapido.bike | unicorn product | Bengaluru, IN | in p1 | - | Roppen Transportation Services
BluSmart | blu-smart.com | startup product | Gurugram, IN | in | -
Yulu | yulu.bike | startup product | Bengaluru, IN | in | -
Porter | porter.in | unicorn product | Bengaluru, IN | in p1 | - | SmartShift Logistics
Delhivery | delhivery.com | unicorn product | Gurugram, IN | in p1 | -
Shiprocket | shiprocket.in | unicorn product | New Delhi, IN | in | - | Bigfoot Retail Solutions
Xpressbees | xpressbees.com | unicorn startup | Pune, IN | in | -
Ecom Express | ecomexpress.in | startup | Gurugram, IN | in | -
Shadowfax | shadowfax.in | startup product | Bengaluru, IN | in | -
BlackBuck | blackbuck.com | unicorn product | Bengaluru, IN | in | - | Zinka Logistics
Rivigo | rivigo.com | startup product | Gurugram, IN | in | -
LoadShare | loadshare.net | startup | Bengaluru, IN | in | -
Locus | locus.sh | startup product ai | Bengaluru, IN | in | - | Locus.sh
FarEye | fareye.com | startup product | Noida, IN | in | -
LogiNext | loginextsolutions.com | startup product | Mumbai, IN | in | -
GreyOrange | greyorange.com | startup product | Atlanta, US | in | -
Addverb | addverb.com | startup product | Noida, IN | in | -
Unbox Robotics | unboxrobotics.com | startup product | Pune, IN | in | -
# ── Fintech ──
Razorpay | razorpay.com | unicorn fintech product | Bengaluru, IN | in p1 | url:https://razorpay.com/jobs/
CRED | cred.club | unicorn fintech product | Bengaluru, IN | in p1 | url:https://careers.cred.club/ | Dreamplug Technologies
PhonePe | phonepe.com | unicorn fintech product | Bengaluru, IN | in p1 | gh:phonepe url:https://www.phonepe.com/careers/
Paytm | paytm.com | unicorn fintech product | Noida, IN | in p1 | url:https://paytm.com/careers/ | One97 Communications
Groww | groww.in | unicorn fintech product | Bengaluru, IN | in p1 | url:https://groww.in/careers | Nextbillion Technology
Zerodha | zerodha.com | fintech product | Bengaluru, IN | in p1 | url:https://zerodha.com/careers/
Upstox | upstox.com | unicorn fintech product | Mumbai, IN | in p1 | - | RKSV Securities
Angel One | angelone.in | fintech product | Mumbai, IN | in p1 | - | Angel Broking
Dhan | dhan.co | fintech startup | Mumbai, IN | in | - | Raise Securities
INDmoney | indmoney.com | fintech startup | Gurugram, IN | in | - | Finzoom Investment Advisors
smallcase | smallcase.com | fintech startup | Bengaluru, IN | in | -
Navi | navi.com | fintech product | Bengaluru, IN | in p1 | - | Navi Technologies
Slice | sliceit.com | unicorn fintech product | Bengaluru, IN | in p1 | -
Jupiter | jupiter.money | fintech startup | Mumbai, IN | in | - | Amica Financial Technologies
Fi Money | fi.money | fintech startup | Bengaluru, IN | in | - | epiFi Technologies; Fi
Niyo | goniyo.com | fintech startup | Bengaluru, IN | in | -
OneCard | getonecard.app | unicorn fintech | Pune, IN | in | - | FPL Technologies
Uni Cards | uni.club | fintech startup | Bengaluru, IN | in | -
Scapia | scapia.cards | fintech startup | Bengaluru, IN | in | -
Jar | myjar.app | fintech startup | Bengaluru, IN | in | - | Jar App
KreditBee | kreditbee.in | unicorn fintech | Bengaluru, IN | in | -
Money View | moneyview.in | unicorn fintech | Bengaluru, IN | in | - | MoneyView
Lendingkart | lendingkart.com | fintech startup | Ahmedabad, IN | in | -
Fibe | fibe.in | fintech startup | Pune, IN | in | - | EarlySalary
Kissht | kissht.com | fintech startup | Mumbai, IN | in | - | OnEMI Technology
Stashfin | stashfin.com | fintech startup | New Delhi, IN | in | -
Rupeek | rupeek.com | fintech startup | Bengaluru, IN | in | -
Indifi | indifi.com | fintech startup | Gurugram, IN | in | -
FlexiLoans | flexiloans.com | fintech startup | Mumbai, IN | in | -
Credgenics | credgenics.com | fintech startup | New Delhi, IN | in | -
Mintifi | mintifi.com | fintech startup | Mumbai, IN | in | -
Progcap | progcap.com | fintech startup | New Delhi, IN | in | -
Vayana | vayana.com | fintech startup | Pune, IN | in | -
Simpl | getsimpl.com | fintech startup | Bengaluru, IN | in | -
BharatPe | bharatpe.com | unicorn fintech | New Delhi, IN | in p1 | - | Resilient Innovations
Pine Labs | pinelabs.com | unicorn fintech product | Noida, IN | in p1 | -
Cashfree Payments | cashfree.com | fintech startup product | Bengaluru, IN | in p1 | - | Cashfree
PayU India | payu.in | fintech mnc | Gurugram, IN | in p1 | - | PayU
Juspay | juspay.in | unicorn fintech product | Bengaluru, IN | in p1 | url:https://juspay.io/careers
MobiKwik | mobikwik.com | fintech product | Gurugram, IN | in | - | One MobiKwik Systems
Freecharge | freecharge.in | fintech product | Gurugram, IN | in | -
Instamojo | instamojo.com | fintech startup | Bengaluru, IN | in | -
Open Financial Technologies | open.money | unicorn fintech | Bengaluru, IN | in | - | Open
Perfios | perfios.com | unicorn fintech product | Bengaluru, IN | in | -
M2P Fintech | m2pfintech.com | unicorn fintech | Chennai, IN | in | - | M2P
Zeta | zeta.tech | unicorn fintech product | Bengaluru, IN | in p1 | - | Zeta Suite
Setu | setu.co | fintech startup | Bengaluru, IN | in | -
Decentro | decentro.tech | fintech startup | Bengaluru, IN | in | -
Signzy | signzy.com | fintech startup ai | Bengaluru, IN | in | -
IDfy | idfy.com | fintech startup | Mumbai, IN | in | -
HyperVerge | hyperverge.co | fintech startup ai | Bengaluru, IN | in | -
Khatabook | khatabook.com | fintech startup | Bengaluru, IN | in | -
OkCredit | okcredit.in | fintech startup | Bengaluru, IN | in | -
Vyapar | vyaparapp.in | fintech startup | Bengaluru, IN | in | -
PolicyBazaar | policybazaar.com | unicorn fintech product | Gurugram, IN | in p1 | cu:https://www.policybazaar.com/careers/ | PB Fintech; Paisabazaar
Acko | acko.com | unicorn fintech product | Bengaluru, IN | in p1 | - | ACKO General Insurance
Digit Insurance | godigit.com | unicorn fintech | Bengaluru, IN | in | - | Go Digit
Turtlemint | turtlemint.com | fintech startup | Mumbai, IN | in | -
InsuranceDekho | insurancedekho.com | fintech startup | Gurugram, IN | in | -
Ditto Insurance | joinditto.in | fintech startup | Bengaluru, IN | in | -
Plum | plumhq.com | fintech startup | Bengaluru, IN | in | - | Plum Benefits
Leap Finance | leapfinance.com | fintech startup | Bengaluru, IN | in | - | Leap Scholar
Kotak Securities | kotaksecurities.com | fintech | Mumbai, IN | in | -
CoinDCX | coindcx.com | unicorn fintech | Mumbai, IN | in | -
CoinSwitch | coinswitch.co | unicorn fintech | Bengaluru, IN | in | -
Mudrex | mudrex.com | fintech startup | Bengaluru, IN | in | -
Polygon Labs | polygon.technology | fintech unicorn startup | Remote, IN | in remote | gh:polygontechnology | Polygon
# ── SaaS & B2B software ──
Freshworks | freshworks.com | product mnc unicorn | San Mateo, US | in p1 | sr:Freshworks url:https://careers.freshworks.com/
Zoho | zoho.com | product mnc | Chennai, IN | in p1 | url:https://www.zoho.com/careers/ | Zoho Corporation; ManageEngine; Zoho Corp
BrowserStack | browserstack.com | unicorn product | Mumbai, IN | in p1 | url:https://www.browserstack.com/careers
Chargebee | chargebee.com | unicorn product | Chennai, IN | in p1 | url:https://www.chargebee.com/careers/
Icertis | icertis.com | unicorn product ai | Bellevue, US | in p1 | -
Whatfix | whatfix.com | unicorn product | Bengaluru, IN | in p1 | -
MindTickle | mindtickle.com | unicorn product | San Francisco, US | in | -
Hasura | hasura.io | product startup | San Francisco, US | in remote | -
Gupshup | gupshup.io | unicorn product ai | San Francisco, US | in | -
Yellow.ai | yellow.ai | product startup ai | San Mateo, US | in | -
Haptik | haptik.ai | product startup ai | Mumbai, IN | in | -
Uniphore | uniphore.com | unicorn product ai | Palo Alto, US | in | -
Observe.AI | observe.ai | product startup ai | San Francisco, US | in | -
LeadSquared | leadsquared.com | unicorn product | Bengaluru, IN | in | -
Capillary Technologies | capillarytech.com | product | Bengaluru, IN | in | -
MoEngage | moengage.com | unicorn product | San Francisco, US | in | -
CleverTap | clevertap.com | product startup | Mountain View, US | in | -
WebEngage | webengage.com | product startup | Mumbai, IN | in | -
Netcore Cloud | netcorecloud.com | product | Mumbai, IN | in | -
Exotel | exotel.com | product startup | Bengaluru, IN | in | -
Ozonetel | ozonetel.com | product startup | Hyderabad, IN | in | -
Route Mobile | routemobile.com | product | Mumbai, IN | in | -
Rocketlane | rocketlane.com | product startup | Chennai, IN | in | -
Atlan | atlan.com | product unicorn | Singapore, SG | in remote | -
Sprinto | sprinto.com | product startup | Bengaluru, IN | in | -
Scrut Automation | scrut.io | product startup | Bengaluru, IN | in | - | Scrut
Zluri | zluri.com | product startup | Bengaluru, IN | in | -
SurveySparrow | surveysparrow.com | product startup | Kochi, IN | in | -
VWO | vwo.com | product | New Delhi, IN | in | - | Wingify
Kissflow | kissflow.com | product startup | Chennai, IN | in | -
Zenoti | zenoti.com | unicorn product | Bellevue, US | in p1 | -
Darwinbox | darwinbox.com | unicorn product | Hyderabad, IN | in p1 | -
Keka HR | keka.com | product startup | Hyderabad, IN | in | - | Keka
greytHR | greythr.com | product | Bengaluru, IN | in | - | Greytip Software
Vymo | getvymo.com | product startup | Bengaluru, IN | in | -
Facilio | facilio.com | product startup | Chennai, IN | in | -
SirionLabs | sirion.ai | product startup ai | Seattle, US | in | - | Sirion
HighRadius | highradius.com | unicorn product fintech | Houston, US | in p1 | -
Amagi | amagi.com | unicorn product | Bengaluru, IN | in p1 | -
Leena AI | leena.ai | product startup ai | San Francisco, US | in | -
Hevo Data | hevodata.com | product startup | San Francisco, US | in | -
Sigmoid | sigmoid.com | service ai | San Francisco, US | in | -
Tredence | tredence.com | service ai consulting | San Jose, US | in | -
Quantiphi | quantiphi.com | service ai | Marlborough, US | in | -
Sarvam AI | sarvam.ai | ai startup | Bengaluru, IN | in | -
Gnani.ai | gnani.ai | ai startup | Bengaluru, IN | in | -
CoRover | corover.ai | ai startup | Bengaluru, IN | in | -
Vue.ai | vue.ai | ai startup product | Chennai, IN | in | - | Mad Street Den
Neysa | neysa.ai | ai startup | Mumbai, IN | in | -
E2E Networks | e2enetworks.com | product | New Delhi, IN | in | -
Yotta Data Services | yotta.com | product | Mumbai, IN | in | - | Yotta
Lentra | lentra.ai | fintech startup ai | Pune, IN | in | -
Kapture CX | kapturecx.com | product startup | Bengaluru, IN | in | -
Dukaan | mydukaan.io | product startup | Bengaluru, IN | in | -
Bikayi | bikayi.com | product startup | Bengaluru, IN | in | -
Zinier | zinier.com | product startup | San Francisco, US | in | -
Uniqus | uniqus.com | consulting startup | Mumbai, IN | in | -
Saarthi.ai | saarthi.ai | ai startup | Bengaluru, IN | in | -
Mad Street Den | madstreetden.com | ai startup | Chennai, IN | in | -
Wysa | wysa.com | ai startup | Bengaluru, IN | in | -
Ninjacart | ninjacart.in | startup product | Bengaluru, IN | in | -
DeHaat | agrevolution.in | startup product | Patna, IN | in | - | Green Agrevolution
AgroStar | agrostar.in | startup product | Pune, IN | in | -
Arya.ag | arya.ag | startup | New Delhi, IN | in | -
# ── Edtech & careers ──
BYJU'S | byjus.com | unicorn product | Bengaluru, IN | in | - | Think and Learn; BYJUS
Unacademy | unacademy.com | unicorn product | Bengaluru, IN | in p1 | - | Sorting Hat Technologies
upGrad | upgrad.com | unicorn product | Mumbai, IN | in p1 | - | upGrad Education
PhysicsWallah | pw.live | unicorn product | Noida, IN | in p1 | - | Physics Wallah; PW
Vedantu | vedantu.com | unicorn product | Bengaluru, IN | in | -
Eruditus | eruditus.com | unicorn product | Mumbai, IN | in | - | Emeritus
Simplilearn | simplilearn.com | product startup | Bengaluru, IN | in | -
Great Learning | mygreatlearning.com | product startup | Gurugram, IN | in | -
Scaler | scaler.com | product startup | Bengaluru, IN | in | - | InterviewBit
Masai School | masaischool.com | product startup | Bengaluru, IN | in | -
Newton School | newtonschool.co | product startup | Bengaluru, IN | in | -
Coding Ninjas | codingninjas.com | product startup | New Delhi, IN | in | -
GeeksforGeeks | geeksforgeeks.org | product startup | Noida, IN | in | -
Testbook | testbook.com | product startup | Navi Mumbai, IN | in | -
Adda247 | adda247.com | product startup | Gurugram, IN | in | -
Classplus | classplus.co | product startup | Noida, IN | in | -
Teachmint | teachmint.com | product startup | Bengaluru, IN | in | -
Cuemath | cuemath.com | product startup | Bengaluru, IN | in | -
LEAD Group | leadschool.in | unicorn product | Mumbai, IN | in | - | LEAD School
Seekho | seekho.ai | product startup | Bengaluru, IN | in | -
Leap Scholar | leapscholar.com | product startup | Bengaluru, IN | in | -
Unstop | unstop.com | product startup | New Delhi, IN | in | - | Dare2Compete
Internshala | internshala.com | product startup | Gurugram, IN | in | -
Apna | apna.co | unicorn product | Bengaluru, IN | in p1 | - | Apnatime Tech
WorkIndia | workindia.in | product startup | Mumbai, IN | in | -
Instahyre | instahyre.com | product startup | Bengaluru, IN | in | -
Cutshort | cutshort.io | product startup | Bengaluru, IN | in | -
Vahan | vahan.co | product startup ai | Bengaluru, IN | in | -
# ── Media, gaming & social ──
Dream11 | dream11.com | unicorn product | Mumbai, IN | in p1 | - | Dream Sports; Dream Sports Group
ShareChat | sharechat.com | unicorn product | Bengaluru, IN | in p1 | - | Mohalla Tech; Moj
InMobi | inmobi.com | unicorn product mnc | Bengaluru, IN | in p1 | - | InMobi Technologies
Glance | glance.com | unicorn product | Bengaluru, IN | in p1 | - | Roposo
Games24x7 | games24x7.com | unicorn product | Mumbai, IN | in | -
Mobile Premier League | mpl.live | unicorn product | Bengaluru, IN | in | - | MPL; Galactus Funware
WinZO | winzogames.com | startup product | New Delhi, IN | in | -
Zupee | zupee.com | startup product | Gurugram, IN | in | -
Gameskraft | gameskraft.com | unicorn product | Bengaluru, IN | in | -
Nazara Technologies | nazara.com | product | Mumbai, IN | in | -
Pocket FM | pocketfm.com | unicorn product | Bengaluru, IN | in | -
Kuku FM | kukufm.com | startup product | Mumbai, IN | in | -
VerSe Innovation | verse.in | unicorn product | Bengaluru, IN | in | - | Dailyhunt; Josh
Inshorts | inshorts.com | startup product | Noida, IN | in | -
Pratilipi | pratilipi.com | startup product | Bengaluru, IN | in | -
JioHotstar | hotstar.com | product mnc | Mumbai, IN | in p1 | - | Disney+ Hotstar; Hotstar; JioStar
Zee Entertainment | zee.com | mnc | Mumbai, IN | in | - | ZEE5
Times Internet | timesinternet.in | product | Noida, IN | in | -
Gaana | gaana.com | product | Noida, IN | in | -
# ── Mobility, energy, deep tech ──
Simple Energy | simpleenergy.in | startup product | Bengaluru, IN | in | -
Ultraviolette | ultraviolette.com | startup product | Bengaluru, IN | in | -
Euler Motors | eulermotors.com | startup product | New Delhi, IN | in | -
Exponent Energy | exponent.energy | startup product | Bengaluru, IN | in | -
Battery Smart | batterysmart.in | startup product | Gurugram, IN | in | -
Log9 Materials | log9materials.com | startup product | Bengaluru, IN | in | -
Skyroot Aerospace | skyroot.in | startup product | Hyderabad, IN | in | -
Agnikul Cosmos | agnikul.in | startup product | Chennai, IN | in | -
Pixxel | pixxel.space | startup product | Bengaluru, IN | in | -
Dhruva Space | dhruvaspace.com | startup product | Hyderabad, IN | in | -
ideaForge | ideaforgetech.com | product | Mumbai, IN | in | -
Servify | servify.in | startup product | Mumbai, IN | in | -
Cashify | cashify.in | startup product | Gurugram, IN | in | -
Bounce | bounceshare.com | startup product | Bengaluru, IN | in | -
Stanza Living | stanzaliving.com | startup | New Delhi, IN | in | -
Furlenco | furlenco.com | startup product | Bengaluru, IN | in | -
RentoMojo | rentomojo.com | startup product | Bengaluru, IN | in | -
Zolo | zolostays.com | startup | Bengaluru, IN | in | -
`);
