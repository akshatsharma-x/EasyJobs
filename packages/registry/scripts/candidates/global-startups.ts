import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("global-startups", `
# ── Developer tools & infrastructure ──
Linear | linear.app | startup product | San Francisco, US | remote | ab:linear
Raycast | raycast.com | startup product | London, GB | remote | -
Warp | warp.dev | startup product ai | New York, US | remote | -
Replit | replit.com | startup product ai unicorn | San Francisco, US | - | ab:replit
Sourcegraph | sourcegraph.com | startup product ai | San Francisco, US | remote | -
Render | render.com | startup product | San Francisco, US | remote | -
Railway | railway.com | startup product | San Francisco, US | remote | ab:railway
Fly.io | fly.io | startup product | Chicago, US | remote | - | Fly
Zed Industries | zed.dev | startup product | Boulder, US | remote | - | Zed
Docker | docker.com | product unicorn | Palo Alto, US | in remote | -
Pulumi | pulumi.com | startup product | Seattle, US | remote | -
Spacelift | spacelift.io | startup product | Redwood City, US | remote | -
Harness | harness.io | unicorn product | San Francisco, US | in p1 | -
Buildkite | buildkite.com | startup product | Melbourne, AU | remote | -
Sentry | sentry.io | startup product unicorn | San Francisco, US | - | - | Functional Software
PostHog | posthog.com | startup product | San Francisco, US | remote | ab:posthog
Mixpanel | mixpanel.com | startup product | San Francisco, US | in | -
Amplitude | amplitude.com | product | San Francisco, US | - | -
Heap | heap.io | startup product | San Francisco, US | - | -
FullStory | fullstory.com | startup product | Atlanta, US | - | -
LogRocket | logrocket.com | startup product | Boston, US | remote | -
RudderStack | rudderstack.com | startup product | San Francisco, US | in remote | -
Airbyte | airbyte.com | startup product | San Francisco, US | remote | -
Prefect | prefect.io | startup product | Washington, US | remote | -
Dagster Labs | dagster.io | startup product | San Francisco, US | remote | - | Elementl
Astronomer | astronomer.io | startup product unicorn | New York, US | in remote | -
Hex | hex.tech | startup product ai | San Francisco, US | - | -
Metabase | metabase.com | startup product | San Francisco, US | remote | -
Sigma Computing | sigmacomputing.com | startup product unicorn | San Francisco, US | - | -
Hightouch | hightouch.com | startup product | San Francisco, US | remote | -
Census | getcensus.com | startup product | San Francisco, US | - | -
Monte Carlo | montecarlodata.com | startup product unicorn | San Francisco, US | - | -
Tecton | tecton.ai | startup product ai | San Francisco, US | - | -
Algolia | algolia.com | startup product unicorn | San Francisco, US | - | -
Meilisearch | meilisearch.com | startup product | Paris, FR | remote | -
Typesense | typesense.org | startup product | San Francisco, US | remote | -
Mux | mux.com | startup product | San Francisco, US | - | -
Cloudinary | cloudinary.com | startup product unicorn | Santa Clara, US | - | -
Contentful | contentful.com | startup product unicorn | Berlin, DE | - | -
Sanity | sanity.io | startup product | San Francisco, US | remote | -
Strapi | strapi.io | startup product | Paris, FR | remote | -
Storyblok | storyblok.com | startup product | Linz, AT | remote | -
Builder.io | builder.io | startup product ai | San Francisco, US | remote | -
Framer | framer.com | startup product | Amsterdam, NL | remote | -
Bubble | bubble.io | startup product | New York, US | remote | -
Coda | coda.io | startup product unicorn | San Francisco, US | - | -
ClickUp | clickup.com | startup product unicorn | San Diego, US | - | -
Productboard | productboard.com | startup product unicorn | San Francisco, US | - | -
Pendo | pendo.io | startup product unicorn | Raleigh, US | - | -
Braze | braze.com | product | New York, US | - | -
Iterable | iterable.com | startup product unicorn | San Francisco, US | - | -
Customer.io | customer.io | startup product | Portland, US | remote | -
Klaviyo | klaviyo.com | product | Boston, US | - | -
Attentive | attentive.com | startup product unicorn | New York, US | - | -
Sendbird | sendbird.com | startup product unicorn | San Mateo, US | in | -
Stream | getstream.io | startup product | Boulder, US | remote | -
Agora | agora.io | product | Santa Clara, US | in | -
LiveKit | livekit.io | startup product ai | San Jose, US | remote | -
Daily | daily.co | startup product | San Francisco, US | remote | -
100ms | 100ms.live | startup product | Bengaluru, IN | in | -
Dyte | dyte.io | startup product | Bengaluru, IN | in | -
Plivo | plivo.com | startup product | Austin, US | in | -
Bird | bird.com | startup product | Amsterdam, NL | - | - | MessageBird
Vonage | vonage.com | product | Holmdel, US | in | -
Sinch | sinch.com | product | Stockholm, SE | in | -
Infobip | infobip.com | product | Vodnjan, HR | in | -
Workato | workato.com | startup product unicorn | Mountain View, US | in | -
Tray.ai | tray.ai | startup product | San Francisco, US | - | - | Tray.io
Make | make.com | startup product | Prague, CZ | remote | -
n8n | n8n.io | startup product ai | Berlin, DE | remote | -
Celigo | celigo.com | startup product | San Mateo, US | in | -
MuleSoft | mulesoft.com | product | San Francisco, US | - | -
Apollo.io | apollo.io | startup product unicorn | San Francisco, US | in remote | -
ZoomInfo | zoominfo.com | product | Vancouver, US | in | -
6sense | 6sense.com | startup product unicorn | San Francisco, US | in | -
Demandbase | demandbase.com | startup product | San Francisco, US | in | -
G2 | g2.com | startup product | Chicago, US | in | -
Clari | clari.com | startup product unicorn | Sunnyvale, US | in | -
Salesloft | salesloft.com | startup product | Atlanta, US | - | -
Zuora | zuora.com | product | Redwood City, US | in | -
Recurly | recurly.com | startup product | San Francisco, US | - | -
Paddle | paddle.com | startup product fintech | London, GB | remote | -
Tipalti | tipalti.com | startup product fintech unicorn | San Mateo, US | - | -
Navan | navan.com | startup product unicorn | Palo Alto, US | in | - | TripActions
Expensify | expensify.com | product | Portland, US | - | -
Pleo | pleo.io | startup fintech unicorn | Copenhagen, DK | - | -
Spendesk | spendesk.com | startup fintech unicorn | Paris, FR | - | -
Oyster HR | oysterhr.com | startup product | Wilmington, US | in remote | - | Oyster
Papaya Global | papayaglobal.com | startup product unicorn | New York, US | - | -
Multiplier | usemultiplier.com | startup product | Singapore, SG | in | -
Velocity Global | velocityglobal.com | startup product | Denver, US | - | -
15Five | 15five.com | startup product | San Francisco, US | remote | -
Leapsome | leapsome.com | startup product | Berlin, DE | - | -
Loom by Atlassian | loom.com | product | San Francisco, US | - | - | Loom
Dialpad | dialpad.com | startup product unicorn ai | San Francisco, US | in | -
Aircall | aircall.io | startup product unicorn | Paris, FR | - | -
RingCentral | ringcentral.com | product mnc | Belmont, US | in | -
Talkdesk | talkdesk.com | startup product unicorn | San Francisco, US | - | -
Five9 | five9.com | product | San Ramon, US | in | -
Genesys | genesys.com | product mnc | Menlo Park, US | in | -
NICE | nice.com | product mnc | Ra'anana, IL | in | -
ServiceTitan | servicetitan.com | product | Glendale, US | in | -
Motive | gomotive.com | startup product unicorn ai | San Francisco, US | in | - | KeepTruckin
Flock Safety | flocksafety.com | startup product unicorn | Atlanta, US | - | -
Verkada | verkada.com | startup product unicorn | San Mateo, US | - | -
Chainguard | chainguard.dev | startup product unicorn | Kirkland, US | remote | -
Socket | socket.dev | startup product | San Francisco, US | remote | -
Semgrep | semgrep.dev | startup product | San Francisco, US | remote | -
Aikido Security | aikido.dev | startup product | Ghent, BE | - | -
Orca Security | orca.security | startup product unicorn | Portland, US | - | -
Sysdig | sysdig.com | startup product | San Francisco, US | in | -
Aqua Security | aquasec.com | startup product unicorn | Boston, US | - | -
Teleport | goteleport.com | startup product | Oakland, US | remote | - | Gravitational
Island | island.io | startup product unicorn | Dallas, US | - | -
Cyera | cyera.io | startup product unicorn | New York, US | - | -
Huntress | huntress.com | startup product | Ellicott City, US | remote | -
Expel | expel.com | startup product | Herndon, US | - | -
Red Canary | redcanary.com | startup product | Denver, US | - | -
Material Security | material.security | startup product | San Francisco, US | - | -
Coalition | coalitioninc.com | startup fintech unicorn | San Francisco, US | - | -
Secureframe | secureframe.com | startup product | San Francisco, US | remote | -
OneTrust | onetrust.com | product unicorn | Atlanta, US | in | -
BigID | bigid.com | startup product unicorn | New York, US | in | -
Securiti | securiti.ai | startup product ai | San Jose, US | in | -
Transcend | transcend.io | startup product | San Francisco, US | - | -
Cribl | cribl.io | startup product unicorn | San Francisco, US | remote | -
Observe Inc | observeinc.com | startup product | San Mateo, US | - | -
Mezmo | mezmo.com | startup product | Mountain View, US | - | - | LogDNA
Kentik | kentik.com | startup product | San Francisco, US | - | -
# ── Fintech & crypto ──
Mercury | mercury.com | fintech startup unicorn | San Francisco, US | remote | ab:mercury
Carta | carta.com | fintech startup unicorn | San Francisco, US | - | -
Nubank | nubank.com.br | fintech mnc | Sao Paulo, BR | - | -
Airwallex | airwallex.com | fintech startup unicorn | Singapore, SG | - | -
Modern Treasury | moderntreasury.com | fintech startup | San Francisco, US | - | -
Increase | increase.com | fintech startup | San Francisco, US | - | -
Unit | unit.co | fintech startup | New York, US | - | -
Lithic | lithic.com | fintech startup | New York, US | remote | -
Alloy | alloy.com | fintech startup unicorn | New York, US | - | -
Persona | withpersona.com | startup product unicorn | San Francisco, US | - | -
Sardine | sardine.ai | fintech startup ai | San Francisco, US | remote | -
Socure | socure.com | fintech startup unicorn | Incline Village, US | - | -
Unit21 | unit21.ai | fintech startup | San Francisco, US | - | -
Betterment | betterment.com | fintech startup | New York, US | - | -
Wealthfront | wealthfront.com | fintech startup | Palo Alto, US | - | -
Public.com | public.com | fintech startup | New York, US | - | - | Public
Acorns | acorns.com | fintech startup | Irvine, US | - | -
Kraken | kraken.com | fintech startup unicorn | San Francisco, US | in remote | ab:kraken.com | Payward
Gemini | gemini.com | fintech startup | New York, US | - | -
Chainalysis | chainalysis.com | fintech startup unicorn | New York, US | in | -
Fireblocks | fireblocks.com | fintech startup unicorn | New York, US | - | -
Anchorage Digital | anchorage.com | fintech startup unicorn | San Francisco, US | remote | -
Circle | circle.com | fintech | Boston, US | remote | - | Circle Internet Financial
Ripple | ripple.com | fintech startup unicorn | San Francisco, US | - | -
Consensys | consensys.io | fintech startup | Fort Worth, US | remote | -
Alchemy | alchemy.com | fintech startup unicorn | San Francisco, US | - | -
OpenSea | opensea.io | startup product | New York, US | - | -
Uniswap Labs | uniswap.org | fintech startup | New York, US | remote | -
Phantom | phantom.com | fintech startup | San Francisco, US | remote | -
MoonPay | moonpay.com | fintech startup unicorn | Miami, US | remote | -
Solana Foundation | solana.org | fintech startup | Zug, CH | remote | -
Aptos Labs | aptoslabs.com | fintech startup | Palo Alto, US | - | -
Mysten Labs | mystenlabs.com | fintech startup | Palo Alto, US | - | -
Paxos | paxos.com | fintech startup | New York, US | - | -
Bitgo | bitgo.com | fintech startup | Palo Alto, US | in | -
Ledger | ledger.com | fintech startup | Paris, FR | - | -
Binance | binance.com | fintech mnc | Remote, AE | remote | -
OKX | okx.com | fintech mnc | Seychelles, SC | remote | -
Bybit | bybit.com | fintech mnc | Dubai, AE | remote | -
Crypto.com | crypto.com | fintech mnc | Singapore, SG | remote | -
Dune | dune.com | startup product | Oslo, NO | remote | -
Nansen | nansen.ai | startup product | Singapore, SG | remote | -
Flashbots | flashbots.net | startup | Remote, US | remote | -
Offchain Labs | offchainlabs.com | fintech startup | New York, US | - | - | Arbitrum
Optimism | optimism.io | fintech startup | Remote, US | remote | -
Starkware | starkware.co | fintech startup | Netanya, IL | - | -
Figure | figure.com | fintech startup | San Francisco, US | - | -
Stash | stash.com | fintech startup | New York, US | - | -
Dave | dave.com | fintech | Los Angeles, US | - | -
Upgrade | upgrade.com | fintech startup unicorn | San Francisco, US | - | -
Varo Bank | varomoney.com | fintech startup | San Francisco, US | - | -
Current | current.com | fintech startup | New York, US | - | -
Bilt Rewards | biltrewards.com | fintech startup unicorn | New York, US | - | - | Bilt
Pipe | pipe.com | fintech startup | Miami, US | - | -
Payoneer | payoneer.com | fintech | New York, US | in | -
Remitly | remitly.com | fintech | Seattle, US | in | -
dLocal | dlocal.com | fintech | Montevideo, UY | in | -
Ebanx | ebanx.com | fintech startup | Curitiba, BR | - | -
Thunes | thunes.com | fintech startup | Singapore, SG | in | -
Nium | nium.com | fintech startup unicorn | Singapore, SG | in | -
# ── Consumer & marketplaces ──
Etsy | etsy.com | product | Brooklyn, US | - | -
Faire | faire.com | startup product unicorn | San Francisco, US | - | -
Whatnot | whatnot.com | startup product unicorn | Los Angeles, US | - | -
StockX | stockx.com | startup product unicorn | Detroit, US | - | -
ThredUp | thredup.com | product | Oakland, US | - | -
Poshmark | poshmark.com | product | Redwood City, US | in | -
Depop | depop.com | startup product | London, GB | - | -
Vinted | vinted.com | startup product unicorn | Vilnius, LT | - | -
Zalando | zalando.com | mnc product | Berlin, DE | - | -
Delivery Hero | deliveryhero.com | mnc product | Berlin, DE | - | -
Deliveroo | deliveroo.co.uk | product | London, GB | in | -
Glovo | glovoapp.com | startup product unicorn | Barcelona, ES | - | -
Bolt | bolt.eu | startup product unicorn | Tallinn, EE | - | -
Gopuff | gopuff.com | startup product unicorn | Philadelphia, US | - | -
Nextdoor | nextdoor.com | product | San Francisco, US | - | -
Bumble | bumble.com | product | Austin, US | - | -
Match Group | mtch.com | product mnc | Dallas, US | - | - | Tinder; Hinge
Strava | strava.com | startup product | San Francisco, US | - | -
Peloton | onepeloton.com | product | New York, US | - | -
Calm | calm.com | startup product unicorn | San Francisco, US | - | -
Headspace | headspace.com | startup product | Santa Monica, US | - | -
Quizlet | quizlet.com | startup product | San Francisco, US | - | -
Course Hero | coursehero.com | startup product unicorn | Redwood City, US | - | - | Learneo
Brainly | brainly.com | startup product | Krakow, PL | in | -
Twitch | twitch.tv | product | San Francisco, US | - | -
Patreon | patreon.com | startup product unicorn | San Francisco, US | - | -
Substack | substack.com | startup product | San Francisco, US | - | -
Medium | medium.com | startup product | San Francisco, US | remote | -
Quora | quora.com | product | Mountain View, US | remote | -
Yelp | yelp.com | product | San Francisco, US | remote | -
Zillow | zillow.com | product | Seattle, US | - | -
Redfin | redfin.com | product | Seattle, US | - | -
Opendoor | opendoor.com | product | San Francisco, US | - | -
Compass | compass.com | product | New York, US | in | -
Thumbtack | thumbtack.com | startup product unicorn | San Francisco, US | remote | -
Angi | angi.com | product | Denver, US | - | -
Rover | rover.com | startup product | Seattle, US | - | -
Tripadvisor | tripadvisor.com | product | Needham, US | in | -
Skyscanner | skyscanner.net | product | Edinburgh, GB | - | -
Hopper | hopper.com | startup product unicorn | Montreal, CA | remote | -
GetYourGuide | getyourguide.com | startup product unicorn | Berlin, DE | - | -
Klook | klook.com | startup product unicorn | Hong Kong, HK | in | -
Traveloka | traveloka.com | startup product unicorn | Jakarta, ID | - | -
Gojek | gojek.com | product unicorn | Jakarta, ID | in | - | GoTo
Tokopedia | tokopedia.com | product unicorn | Jakarta, ID | - | -
Carousell | carousell.com | startup product | Singapore, SG | - | -
Careem | careem.com | startup product | Dubai, AE | - | -
Talabat | talabat.com | product | Kuwait City, KW | - | -
Noon | noon.com | product unicorn | Dubai, AE | in | -
Tabby | tabby.ai | fintech startup unicorn | Riyadh, SA | - | -
Tamara | tamara.co | fintech startup unicorn | Riyadh, SA | - | -
Kitopi | kitopi.com | startup unicorn | Dubai, AE | in | -
Swvl | swvl.com | startup | Dubai, AE | - | -
Wolt | wolt.com | product | Helsinki, FI | - | -
# ── Health & bio ──
Oscar Health | hioscar.com | startup product | New York, US | - | -
Ro | ro.co | startup product unicorn | New York, US | - | -
Hims & Hers | forhims.com | product | San Francisco, US | - | -
Noom | noom.com | startup product unicorn | New York, US | - | -
Zocdoc | zocdoc.com | startup product | New York, US | in | -
Flatiron Health | flatiron.com | startup product | New York, US | - | -
Tempus | tempus.com | product ai | Chicago, US | - | -
Benchling | benchling.com | startup product unicorn | San Francisco, US | - | -
Komodo Health | komodohealth.com | startup product unicorn | San Francisco, US | - | -
Abridge | abridge.com | ai startup unicorn | Pittsburgh, US | - | -
Ambience Healthcare | ambiencehealthcare.com | ai startup | San Francisco, US | - | -
Hinge Health | hingehealth.com | startup product unicorn | San Francisco, US | in | -
Sword Health | swordhealth.com | startup product unicorn | New York, US | - | -
Spring Health | springhealth.com | startup product unicorn | New York, US | - | -
Lyra Health | lyrahealth.com | startup product unicorn | Burlingame, US | - | -
Headway | headway.co | startup product unicorn | New York, US | - | -
Cityblock Health | cityblock.com | startup unicorn | New York, US | - | -
Color Health | color.com | startup | Burlingame, US | - | -
Recursion | recursion.com | ai product | Salt Lake City, US | - | -
Insitro | insitro.com | ai startup | South San Francisco, US | - | -
Ginkgo Bioworks | ginkgobioworks.com | product | Boston, US | - | -
Owkin | owkin.com | ai startup | Paris, FR | - | -
# ── Climate, mobility, robotics & hardware ──
Rivian | rivian.com | product | Irvine, US | - | -
Lucid Motors | lucidmotors.com | product | Newark, US | - | -
Waymo | waymo.com | product ai | Mountain View, US | - | -
Aurora Innovation | aurora.tech | product ai | Pittsburgh, US | - | - | Aurora
Zoox | zoox.com | product ai | Foster City, US | - | -
Nuro | nuro.ai | startup ai unicorn | Mountain View, US | - | -
Wayve | wayve.ai | ai startup unicorn | London, GB | - | -
Applied Intuition | appliedintuition.com | startup product unicorn ai | Mountain View, US | - | -
Anduril | anduril.com | startup product unicorn | Costa Mesa, US | - | - | Anduril Industries
Shield AI | shield.ai | ai startup unicorn | San Diego, US | - | -
Skydio | skydio.com | startup product unicorn | San Mateo, US | - | -
SpaceX | spacex.com | product | Hawthorne, US | - | -
Relativity Space | relativityspace.com | startup | Long Beach, US | - | -
Rocket Lab | rocketlabusa.com | product | Long Beach, US | - | -
Planet Labs | planet.com | product | San Francisco, US | - | -
Boston Dynamics | bostondynamics.com | product | Waltham, US | - | -
Figure AI | figure.ai | ai startup unicorn | Sunnyvale, US | - | -
Agility Robotics | agilityrobotics.com | startup | Salem, US | - | -
1X Technologies | 1x.tech | ai startup | Moss, NO | - | - | 1X
Physical Intelligence | physicalintelligence.company | ai startup unicorn | San Francisco, US | - | -
Skild AI | skild.ai | ai startup unicorn | Pittsburgh, US | - | -
Formlabs | formlabs.com | startup product | Somerville, US | - | -
Arcadia | arcadia.com | startup | Washington, US | - | -
Watershed | watershed.com | startup product unicorn | San Francisco, US | - | -
Patch | patch.io | startup | San Francisco, US | - | -
Redwood Materials | redwoodmaterials.com | startup unicorn | Carson City, US | - | -
Form Energy | formenergy.com | startup unicorn | Somerville, US | - | -
Northvolt | northvolt.com | startup | Stockholm, SE | - | -
Octopus Energy | octopus.energy | startup unicorn | London, GB | in | - | Kraken Technologies
# ── European & Asian scaleups ──
Mollie | mollie.com | fintech startup unicorn | Amsterdam, NL | - | -
Bunq | bunq.com | fintech startup unicorn | Amsterdam, NL | - | rc:bunq
N26 | n26.com | fintech startup unicorn | Berlin, DE | - | -
Trade Republic | traderepublic.com | fintech startup unicorn | Berlin, DE | - | -
Qonto | qonto.com | fintech startup unicorn | Paris, FR | - | -
Alan | alan.com | startup unicorn | Paris, FR | - | -
Doctolib | doctolib.com | startup product unicorn | Paris, FR | - | -
BlaBlaCar | blablacar.com | startup product unicorn | Paris, FR | - | -
Back Market | backmarket.com | startup product unicorn | Paris, FR | - | -
Mirakl | mirakl.com | startup product unicorn | Paris, FR | - | -
Dataiku | dataiku.com | startup product unicorn ai | New York, US | in | -
Contentsquare | contentsquare.com | startup product unicorn | Paris, FR | - | -
ManoMano | manomano.com | startup unicorn | Paris, FR | - | -
Payfit | payfit.com | startup product unicorn | Paris, FR | - | -
Swile | swile.co | startup unicorn | Montpellier, FR | - | -
Babbel | babbel.com | startup product | Berlin, DE | - | -
HelloFresh | hellofresh.com | product | Berlin, DE | - | -
Trivago | trivago.com | product | Dusseldorf, DE | - | -
SumUp | sumup.com | fintech startup unicorn | London, GB | - | -
GoCardless | gocardless.com | fintech startup unicorn | London, GB | - | -
Starling Bank | starlingbank.com | fintech startup unicorn | London, GB | - | -
Darktrace | darktrace.com | product ai | Cambridge, GB | in | -
Ocado Technology | ocadogroup.com | product | Hatfield, GB | in | - | Ocado
Cazoo | cazoo.co.uk | startup | London, GB | - | -
Gousto | gousto.co.uk | startup | London, GB | - | -
Synthesia | synthesia.io | ai startup unicorn | London, GB | - | -
ElevenLabs | elevenlabs.io | ai startup unicorn | New York, US | remote | -
Truecaller | truecaller.com | product | Stockholm, SE | in p1 | - | True Software Scandinavia
Kry | kry.se | startup | Stockholm, SE | - | -
Epidemic Sound | epidemicsound.com | startup unicorn | Stockholm, SE | - | -
Tink | tink.com | fintech startup | Stockholm, SE | - | -
Supercell | supercell.com | product | Helsinki, FI | - | -
Paysafe | paysafe.com | fintech | London, GB | in | -
Xendit | xendit.co | fintech startup unicorn | Jakarta, ID | - | -
PatSnap | patsnap.com | startup product unicorn | Singapore, SG | - | -
Ninja Van | ninjavan.co | startup unicorn | Singapore, SG | - | -
Lalamove | lalamove.com | startup unicorn | Hong Kong, HK | in | -
Shopline | shopline.com | startup | Singapore, SG | - | -
SafetyCulture | safetyculture.com | startup product unicorn | Sydney, AU | - | -
Airtasker | airtasker.com | startup | Sydney, AU | - | -
Employment Hero | employmenthero.com | startup product unicorn | Sydney, AU | - | -
Rokt | rokt.com | startup product unicorn | New York, US | - | -
Xero | xero.com | product mnc | Wellington, NZ | - | -
`);
