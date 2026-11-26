import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("ai", `
# ── Frontier labs ──
OpenAI | openai.com | ai unicorn product | San Francisco, US | in | ab:openai
Anthropic | anthropic.com | ai unicorn product | San Francisco, US | in | gh:anthropic
Google DeepMind | deepmind.google | ai big_tech | London, GB | in | gh:deepmind | DeepMind
xAI | x.ai | ai unicorn | Palo Alto, US | - | gh:xai
Mistral AI | mistral.ai | ai unicorn | Paris, FR | - | lv:mistral | Mistral
Cohere | cohere.com | ai unicorn product | Toronto, CA | - | ab:cohere
Perplexity | perplexity.ai | ai unicorn product | San Francisco, US | - | ab:perplexity | Perplexity AI
Hugging Face | huggingface.co | ai unicorn product | New York, US | remote | wk:huggingface
Scale AI | scale.com | ai unicorn | San Francisco, US | - | gh:scaleai | Scale
Character.AI | character.ai | ai unicorn product | Menlo Park, US | - | ab:character
Thinking Machines Lab | thinkingmachines.ai | ai unicorn | San Francisco, US | - | -
Safe Superintelligence | ssi.inc | ai unicorn | Palo Alto, US | - | - | SSI
Reflection AI | reflection.ai | ai unicorn | Brooklyn, US | - | -
AI21 Labs | ai21.com | ai unicorn | Tel Aviv, IL | - | -
Aleph Alpha | aleph-alpha.com | ai startup | Heidelberg, DE | - | -
Reka AI | reka.ai | ai startup | Sunnyvale, US | - | - | Reka
Sakana AI | sakana.ai | ai unicorn | Tokyo, JP | - | -
Inflection AI | inflection.ai | ai unicorn | Palo Alto, US | - | -
Imbue | imbue.com | ai startup | San Francisco, US | - | -
World Labs | worldlabs.ai | ai unicorn | San Francisco, US | - | -
Midjourney | midjourney.com | ai product | San Francisco, US | - | -
Stability AI | stability.ai | ai startup | London, GB | - | -
Runway | runwayml.com | ai unicorn product | New York, US | - | - | RunwayML
Black Forest Labs | bfl.ai | ai startup | Freiburg, DE | - | -
Luma AI | lumalabs.ai | ai startup | San Francisco, US | - | -
Pika | pika.art | ai startup | Palo Alto, US | - | - | Pika Labs
Suno | suno.com | ai unicorn product | Cambridge, US | - | -
Ideogram | ideogram.ai | ai startup | Toronto, CA | - | -
# ── AI apps, agents & coding ──
Anysphere | cursor.com | ai unicorn product | San Francisco, US | - | - | Cursor
Cognition | cognition.ai | ai unicorn product | San Francisco, US | - | - | Cognition AI; Devin; Windsurf
Poolside | poolside.ai | ai unicorn | Paris, FR | - | -
Magic | magic.dev | ai startup | San Francisco, US | - | - | Magic AI
Augment Code | augmentcode.com | ai startup | Palo Alto, US | - | - | Augment
Factory | factory.ai | ai startup | San Francisco, US | - | - | Factory AI
Lovable | lovable.dev | ai unicorn product | Stockholm, SE | - | -
StackBlitz | stackblitz.com | ai startup product | San Francisco, US | remote | - | Bolt.new
Tabnine | tabnine.com | ai startup product | Tel Aviv, IL | - | -
Qodo | qodo.ai | ai startup product | Tel Aviv, IL | - | - | CodiumAI
Glean | glean.com | ai unicorn product | Palo Alto, US | in p1 | gh:gleanwork
Harvey | harvey.ai | ai unicorn product | San Francisco, US | - | ab:harvey
Sierra | sierra.ai | ai unicorn product | San Francisco, US | - | ab:sierra
Decagon | decagon.ai | ai unicorn product | San Francisco, US | - | ab:decagon
Hebbia | hebbia.ai | ai startup product | New York, US | - | -
Writer | writer.com | ai unicorn product | San Francisco, US | - | -
Jasper | jasper.ai | ai unicorn product | Austin, US | remote | -
Copy.ai | copy.ai | ai startup product | Memphis, US | remote | -
Typeface | typeface.ai | ai startup product | San Francisco, US | - | -
Tome | tome.app | ai startup product | San Francisco, US | - | -
Gamma | gamma.app | ai startup product | San Francisco, US | - | -
Descript | descript.com | ai startup product | San Francisco, US | - | -
Captions | captions.ai | ai startup product | New York, US | - | -
HeyGen | heygen.com | ai startup product | Los Angeles, US | - | -
Speak | speak.com | ai startup product | San Francisco, US | - | -
Otter.ai | otter.ai | ai startup product | Mountain View, US | - | -
Fireflies.ai | fireflies.ai | ai startup product | San Francisco, US | in remote | -
Fathom | fathom.video | ai startup product | San Francisco, US | remote | -
Moveworks | moveworks.com | ai unicorn product | Mountain View, US | in | gh:moveworks
Aisera | aisera.com | ai startup product | Palo Alto, US | in | -
Ema | ema.co | ai startup product | Mountain View, US | in | -
Kore.ai | kore.ai | ai startup product | Orlando, US | in p1 | -
Cresta | cresta.com | ai startup product | San Francisco, US | - | -
ASAPP | asapp.com | ai startup product | New York, US | - | -
Forethought | forethought.ai | ai startup product | San Francisco, US | - | -
Ada | ada.cx | ai startup product | Toronto, CA | - | - | Ada Support
PolyAI | poly.ai | ai startup product | London, GB | - | -
Rasa | rasa.com | ai startup product | San Francisco, US | remote | -
Vapi | vapi.ai | ai startup product | San Francisco, US | - | -
Bland AI | bland.ai | ai startup product | San Francisco, US | - | -
Retell AI | retellai.com | ai startup product | San Francisco, US | - | -
Deepgram | deepgram.com | ai startup product | San Francisco, US | remote | -
AssemblyAI | assemblyai.com | ai startup product | San Francisco, US | remote | -
Cartesia | cartesia.ai | ai startup | San Francisco, US | - | -
Rev | rev.com | ai product | Austin, US | remote | -
Hippocratic AI | hippocraticai.com | ai unicorn | Palo Alto, US | - | -
Clay | clay.com | ai unicorn product | New York, US | - | - | Clay Labs
Mercor | mercor.com | ai unicorn | San Francisco, US | remote | -
micro1 | micro1.ai | ai startup | Los Angeles, US | in remote | -
Turing | turing.com | ai unicorn | Palo Alto, US | in remote p1 | -
Invisible Technologies | invisible.co | ai startup | San Francisco, US | remote | - | Invisible
Surge AI | surgehq.ai | ai startup | San Francisco, US | remote | -
Snorkel AI | snorkel.ai | ai unicorn | Redwood City, US | in | -
Labelbox | labelbox.com | ai startup | San Francisco, US | - | -
Handshake | joinhandshake.com | product unicorn ai | San Francisco, US | - | -
You.com | you.com | ai startup product | Palo Alto, US | - | -
Exa | exa.ai | ai startup | San Francisco, US | - | -
Browserbase | browserbase.com | ai startup | San Francisco, US | - | -
E2B | e2b.dev | ai startup | San Francisco, US | remote | -
Instabase | instabase.com | ai unicorn product | San Francisco, US | in | -
Hyperscience | hyperscience.ai | ai startup product | New York, US | - | -
Rossum | rossum.ai | ai startup product | Prague, CZ | - | -
Sana Labs | sanalabs.com | ai startup product | Stockholm, SE | - | -
Limitless | limitless.ai | ai startup product | San Francisco, US | - | - | Rewind AI
Unstructured | unstructured.io | ai startup | San Francisco, US | remote | -
DeepL | deepl.com | ai unicorn product | Cologne, DE | - | -
Helsing | helsing.ai | ai unicorn | Munich, DE | - | -
Covariant | covariant.ai | ai startup | Emeryville, US | - | -
Viam | viam.com | startup product | New York, US | - | -
Harmonic | harmonic.fun | ai startup | Palo Alto, US | - | -
# ── AI infrastructure & MLOps ──
Together AI | together.ai | ai unicorn | San Francisco, US | - | -
Fireworks AI | fireworks.ai | ai unicorn | Redwood City, US | - | -
Baseten | baseten.co | ai unicorn | San Francisco, US | - | ab:baseten
Modal | modal.com | ai startup | New York, US | - | ab:modal | Modal Labs
Replicate | replicate.com | ai startup | San Francisco, US | remote | -
Anyscale | anyscale.com | ai unicorn | San Francisco, US | - | -
Lambda | lambda.ai | ai unicorn | San Jose, US | - | - | Lambda Labs
CoreWeave | coreweave.com | ai product | Livingston, US | - | gh:coreweave
Crusoe | crusoe.ai | ai unicorn | Denver, US | - | - | Crusoe Energy
Nebius | nebius.com | ai product | Amsterdam, NL | - | -
Lightning AI | lightning.ai | ai startup | New York, US | - | -
Weights & Biases | wandb.ai | ai unicorn product | San Francisco, US | - | -
Pinecone | pinecone.io | ai unicorn product | New York, US | - | -
Weaviate | weaviate.io | ai startup product | Amsterdam, NL | remote | -
Qdrant | qdrant.tech | ai startup product | Berlin, DE | remote | -
Chroma | trychroma.com | ai startup product | San Francisco, US | - | -
Zilliz | zilliz.com | ai startup product | Redwood City, US | - | - | Milvus
LangChain | langchain.com | ai unicorn product | San Francisco, US | - | ab:langchain
LlamaIndex | llamaindex.ai | ai startup product | San Francisco, US | - | ab:llamaindex
Arize AI | arize.com | ai startup product | Berkeley, US | - | -
Fiddler AI | fiddler.ai | ai startup product | Palo Alto, US | in | -
Galileo | galileo.ai | ai startup product | San Francisco, US | - | -
Braintrust | braintrust.dev | ai startup product | San Francisco, US | - | - | Braintrust Data
Langfuse | langfuse.com | ai startup product | Berlin, DE | remote | -
Comet | comet.com | ai startup product | New York, US | - | - | Comet ML
Predibase | predibase.com | ai startup | San Francisco, US | - | -
Vectara | vectara.com | ai startup product | Palo Alto, US | - | -
Contextual AI | contextual.ai | ai startup | Mountain View, US | - | -
DataRobot | datarobot.com | ai product | Boston, US | in | -
H2O.ai | h2o.ai | ai startup product | Mountain View, US | in | -
Domino Data Lab | domino.ai | ai startup product | San Francisco, US | - | -
Clarifai | clarifai.com | ai startup product | Wilmington, US | in | -
Hive AI | thehive.ai | ai unicorn | San Francisco, US | - | - | Hive
C3 AI | c3.ai | ai product | Redwood City, US | in | - | C3.ai
Abacus.AI | abacus.ai | ai startup | San Francisco, US | in | -
SiMa.ai | sima.ai | ai startup product | San Jose, US | in | -
`);
