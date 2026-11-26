import { parseCandidates } from "./parse";

// Y Combinator companies. Entries already listed elsewhere are merged by slug (tags are unioned → they gain "yc").
// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("yc", `
Airbnb | airbnb.com | yc | - | - | -
Stripe | stripe.com | yc | - | - | -
Coinbase | coinbase.com | yc | - | - | -
DoorDash | doordash.com | yc | - | - | -
Instacart | instacart.com | yc | - | - | -
Dropbox | dropbox.com | yc | - | - | -
Reddit | reddit.com | yc | - | - | -
Twitch | twitch.tv | yc | - | - | -
GitLab | gitlab.com | yc | - | - | -
PagerDuty | pagerduty.com | yc | - | - | -
Gusto | gusto.com | yc | - | - | -
Brex | brex.com | yc | - | - | -
Rippling | rippling.com | yc | - | - | -
Deel | deel.com | yc | - | - | -
Razorpay | razorpay.com | yc | - | - | -
Meesho | meesho.com | yc | - | - | -
Groww | groww.in | yc | - | - | -
Zepto | zeptonow.com | yc | - | - | -
Faire | faire.com | yc | - | - | -
Retool | retool.com | yc | - | - | -
Webflow | webflow.com | yc | - | - | -
Zapier | zapier.com | yc | - | - | -
Algolia | algolia.com | yc | - | - | -
Fivetran | fivetran.com | yc | - | - | -
Scale AI | scale.com | yc | - | - | -
OpenSea | opensea.io | yc | - | - | -
Whatnot | whatnot.com | yc | - | - | -
PostHog | posthog.com | yc | - | - | -
Supabase | supabase.com | yc | - | - | -
Replit | replit.com | yc | - | - | -
Vanta | vanta.com | yc | - | - | -
Mixpanel | mixpanel.com | yc | - | - | -
Amplitude | amplitude.com | yc | - | - | -
Heap | heap.io | yc | - | - | -
Docker | docker.com | yc | - | - | -
Sendbird | sendbird.com | yc | - | - | -
Lattice | lattice.com | yc | - | - | -
Front | front.com | yc | - | - | -
Ginkgo Bioworks | ginkgobioworks.com | yc | - | - | -
Mercury | mercury.com | yc | - | - | -
Hightouch | hightouch.com | yc | - | - | -
Airbyte | airbyte.com | yc | - | - | -
Hex | hex.tech | yc | - | - | -
Railway | railway.com | yc | - | - | -
Fly.io | fly.io | yc | - | - | -
Zeni | zeni.ai | yc startup fintech ai | Palo Alto, US | in | -
Flexport | flexport.com | yc startup unicorn product | San Francisco, US | in | -
Checkr | checkr.com | yc startup unicorn product | San Francisco, US | - | -
Segment | segment.com | yc product | San Francisco, US | - | -
Cruise | getcruise.com | yc ai product | San Francisco, US | - | -
Rappi | rappi.com | yc unicorn product | Bogota, CO | - | -
Podium | podium.com | yc unicorn product | Lehi, US | - | -
Pilot | pilot.com | yc startup fintech | San Francisco, US | - | -
Ironclad | ironcladapp.com | yc unicorn product ai | San Francisco, US | - | -
Clipboard Health | clipboardhealth.com | yc unicorn | San Francisco, US | remote | -
Astranis | astranis.com | yc startup unicorn | San Francisco, US | - | -
Boom Supersonic | boomsupersonic.com | yc startup | Denver, US | - | -
Wave | wave.com | yc fintech unicorn | Dakar, SN | - | - | Wave Mobile Money
Paystack | paystack.com | yc fintech startup | Lagos, NG | - | -
Flutterwave | flutterwave.com | yc fintech unicorn | San Francisco, US | - | -
Jeeves | tryjeeves.com | yc fintech unicorn | New York, US | - | -
Platzi | platzi.com | yc startup product | Bogota, CO | - | -
Optimizely | optimizely.com | yc product | New York, US | in | -
Scribd | scribd.com | yc product | San Francisco, US | - | - | Everand
Disqus | disqus.com | yc product | San Francisco, US | - | -
Codecademy | codecademy.com | yc startup product | New York, US | - | -
Embark Trucks | embarktrucks.com | yc startup | San Francisco, US | - | -
Monzo Bank | monzo.com | fintech | - | - | -
Fyle | fylehq.com | yc startup fintech product | Bengaluru, IN | in | -
Vahan AI | vahan.co | yc | - | - | -
FamPay | fampay.in | yc startup fintech | Bengaluru, IN | in | -
BharatX | bharatx.tech | yc startup fintech | Bengaluru, IN | in | -
Pagarbook | pagarbook.com | yc startup product | Bengaluru, IN | in | -
CodeRabbit | coderabbit.ai | yc ai startup product | San Francisco, US | in remote | -
Greptile | greptile.com | yc ai startup | San Francisco, US | - | -
Trigger.dev | trigger.dev | yc startup product | London, GB | remote | -
Resend | resend.com | yc startup product | San Francisco, US | remote | -
Cal.com | cal.com | yc startup product | San Francisco, US | remote | -
Infisical | infisical.com | yc startup product | San Francisco, US | remote | -
Ory | ory.sh | startup product | Munich, DE | remote | -
Medplum | medplum.com | yc startup product | San Francisco, US | remote | -
Mintlify | mintlify.com | yc startup product | San Francisco, US | - | -
Speakeasy | speakeasy.com | yc startup product | San Francisco, US | - | -
Stainless | stainless.com | startup product | New York, US | - | -
Pylon | usepylon.com | yc startup product | San Francisco, US | - | -
Rootly | rootly.com | yc startup product | San Francisco, US | remote | -
Fern | buildwithfern.com | yc startup product | New York, US | - | -
Warp Terminal | warp.dev | yc | - | - | -
Sourcegraph Inc | sourcegraph.com | - | - | - | -
Deepnote | deepnote.com | yc startup product | San Francisco, US | remote | -
Airplane | airplane.dev | yc startup | San Francisco, US | - | -
Jerry | getjerry.com | yc startup fintech | Palo Alto, US | - | -
Truebill | rocketmoney.com | yc fintech | Silver Spring, US | - | - | Rocket Money
Brigit | hellobrigit.com | fintech startup | New York, US | - | -
Atomic | atomic.financial | yc fintech startup | San Francisco, US | - | -
Modern Health | modernhealth.com | yc startup unicorn | San Francisco, US | - | -
Cerebral | cerebral.com | startup unicorn | San Francisco, US | - | -
Nomic | nomic.ai | ai startup | New York, US | - | -
Magic Patterns | magicpatterns.com | yc ai startup | San Francisco, US | - | -
Firecrawl | firecrawl.dev | yc ai startup | San Francisco, US | remote | -
Browser Use | browser-use.com | yc ai startup | San Francisco, US | - | -
Rox | rox.com | ai startup | San Francisco, US | - | -
Hebbia AI | hebbia.ai | yc | - | - | -
Vapi AI | vapi.ai | yc | - | - | -
Bland | bland.ai | yc | - | - | -
Retell | retellai.com | yc | - | - | -
Baseten Labs | baseten.co | - | - | - | -
Mem Labs | mem.ai | ai startup product | San Francisco, US | - | - | Mem
Openpipe | openpipe.ai | yc ai startup | Seattle, US | - | - | OpenPipe
Helicone | helicone.ai | yc ai startup product | San Francisco, US | remote | -
Unify | unifygtm.com | ai startup product | San Francisco, US | - | -
Hatchet | hatchet.run | yc startup product | New York, US | - | -
Windmill | windmill.dev | yc startup product | Paris, FR | remote | -
Gecko Robotics | geckorobotics.com | yc startup unicorn | Pittsburgh, US | - | -
Zipline | flyzipline.com | startup unicorn | South San Francisco, US | - | -
Momentus | momentus.space | yc startup | San Jose, US | - | -
`);
