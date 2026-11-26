import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("enterprise-software", `
Databricks | databricks.com | product unicorn ai | San Francisco, US | in p1 | gh:databricks
Snowflake | snowflake.com | mnc product ai | Bozeman, US | in p1 | ab:snowflake
MongoDB | mongodb.com | mnc product | New York, US | in | gh:mongodb
Datadog | datadoghq.com | mnc product | New York, US | in | gh:datadog | Datadog
Cloudflare | cloudflare.com | mnc product | San Francisco, US | in | gh:cloudflare
Okta | okta.com | mnc product gcc | San Francisco, US | in | gh:okta
Zscaler | zscaler.com | mnc product gcc | San Jose, US | in p1 | gh:zscaler
CrowdStrike | crowdstrike.com | mnc product | Austin, US | in | wd:https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers
SentinelOne | sentinelone.com | mnc product | Mountain View, US | in | gh:sentinellabs
Splunk | splunk.com | mnc product gcc | San Francisco, US | in | -
Elastic | elastic.co | mnc product | Mountain View, US | in remote | gh:elastic
Confluent | confluent.io | mnc product | Mountain View, US | in | ab:confluent
HashiCorp | hashicorp.com | product | San Francisco, US | in remote | gh:hashicorp
GitLab | gitlab.com | mnc product | Remote, US | in remote | gh:gitlab
Twilio Segment | segment.com | product | San Francisco, US | - | -
HubSpot | hubspot.com | mnc product | Cambridge, US | in | gh:hubspot
Zendesk | zendesk.com | mnc product gcc | San Francisco, US | in | gh:zendesk
DocuSign | docusign.com | mnc product gcc | San Francisco, US | in | wd:https://docusign.wd1.myworkdayjobs.com/External
Box | box.com | mnc product | Redwood City, US | - | gh:boxinc
Asana | asana.com | product | San Francisco, US | - | gh:asana
Monday.com | monday.com | product mnc | Tel Aviv, IL | - | gh:mondaycom
Smartsheet | smartsheet.com | product | Bellevue, US | in | gh:smartsheet
Airtable | airtable.com | product unicorn | San Francisco, US | - | gh:airtable
Miro | miro.com | product unicorn | Amsterdam, NL | - | gh:realtimeboardglobal
Figma | figma.com | product unicorn | San Francisco, US | - | gh:figma
Notion | notion.so | product unicorn | San Francisco, US | in | ab:notion
Grammarly | grammarly.com | product unicorn ai | San Francisco, US | - | gh:grammarly | Superhuman
Rubrik | rubrik.com | mnc product gcc | Palo Alto, US | in p1 | gh:rubrik
Cohesity | cohesity.com | product unicorn gcc | San Jose, US | in p1 | gh:cohesity
Druva | druva.com | product unicorn | Pune, IN | in p1 | gh:druva
Commvault | commvault.com | mnc product gcc | Tinton Falls, US | in | wd:https://commvault.wd1.myworkdayjobs.com/Commvault
Veeam Software | veeam.com | mnc product | Columbus, US | - | -
Pure Storage | purestorage.com | mnc product gcc | Santa Clara, US | in | gh:purestorage
Informatica | informatica.com | mnc product gcc | Redwood City, US | in p1 | wd:https://informatica.wd5.myworkdayjobs.com/Informatica
Teradata | teradata.com | mnc product gcc | San Diego, US | in | wd:https://teradata.wd1.myworkdayjobs.com/Teradata
Cloudera | cloudera.com | product gcc | Santa Clara, US | in | wd:https://cloudera.wd5.myworkdayjobs.com/External_Career
Alteryx | alteryx.com | product | Irvine, US | in | -
Tableau | tableau.com | product | Seattle, US | - | -
Qlik | qlik.com | mnc product gcc | King of Prussia, US | in | wd:https://qlik.wd3.myworkdayjobs.com/Qlik | Qlik Technologies
MicroStrategy | microstrategy.com | product | Tysons, US | in | - | Strategy
ThoughtSpot | thoughtspot.com | product unicorn | Mountain View, US | in | gh:thoughtspot
Fivetran | fivetran.com | product unicorn | Oakland, US | in | gh:fivetran
dbt Labs | getdbt.com | product unicorn | Philadelphia, US | in remote | gh:dbtlabsinc
Starburst | starburst.io | product unicorn | Boston, US | - | gh:starburst
Couchbase | couchbase.com | product | Santa Clara, US | in | gh:couchbase
Redis | redis.io | product unicorn | Mountain View, US | in | gh:redislabs | Redis Labs
Neo4j | neo4j.com | product unicorn | San Mateo, US | - | gh:neo4j
Cockroach Labs | cockroachlabs.com | product unicorn | New York, US | - | gh:cockroachlabs | CockroachDB
Yugabyte | yugabyte.com | product unicorn | Sunnyvale, US | in | lv:yugabyte
SingleStore | singlestore.com | product | San Francisco, US | in | gh:singlestore
ClickHouse | clickhouse.com | product unicorn | San Francisco, US | in remote | gh:clickhouse
Grafana Labs | grafana.com | product unicorn | New York, US | in remote | gh:grafanalabs
New Relic | newrelic.com | product gcc | San Francisco, US | in | gh:newrelic
Dynatrace | dynatrace.com | mnc product | Waltham, US | in | -
PagerDuty | pagerduty.com | product | San Francisco, US | - | gh:pagerduty
Sumo Logic | sumologic.com | product | Redwood City, US | in | gh:sumologic
AppDynamics | appdynamics.com | product | San Francisco, US | in | -
Chronosphere | chronosphere.io | product unicorn | New York, US | - | ab:chronosphere
Honeycomb | honeycomb.io | product startup | San Francisco, US | remote | gh:honeycomb
LaunchDarkly | launchdarkly.com | product unicorn | Oakland, US | - | gh:launchdarkly
CircleCI | circleci.com | product unicorn | San Francisco, US | - | gh:circleci
JFrog | jfrog.com | product mnc | Sunnyvale, US | in | -
Sonatype | sonatype.com | product | Fulton, US | - | gh:sonatype
Snyk | snyk.io | product unicorn | Boston, US | in | gh:snyk
Postman | postman.com | product unicorn | San Francisco, US | in p1 | gh:postman
Kong | konghq.com | product unicorn | San Francisco, US | in | gh:kong | Kong Inc
Vercel | vercel.com | product unicorn | San Francisco, US | remote | gh:vercel
Netlify | netlify.com | product | San Francisco, US | remote | gh:netlify
Fastly | fastly.com | product | San Francisco, US | - | gh:fastly
DigitalOcean | digitalocean.com | product | New York, US | in remote | gh:digitalocean98 | DigitalOcean
Supabase | supabase.com | product startup | Singapore, SG | remote | ab:supabase
PlanetScale | planetscale.com | product startup | San Francisco, US | remote | gh:planetscale
Neon | neon.tech | product startup | San Francisco, US | remote | ab:neon
Temporal Technologies | temporal.io | product unicorn | Bellevue, US | remote | gh:temporaltechnologies | Temporal
Retool | retool.com | product unicorn | San Francisco, US | - | ab:retool
Zapier | zapier.com | product | Remote, US | remote | ab:zapier
Webflow | webflow.com | product unicorn | San Francisco, US | remote | gh:webflow
Calendly | calendly.com | product unicorn | Atlanta, US | - | gh:calendly
Loom | loom.com | product | San Francisco, US | - | -
Intercom | intercom.com | product unicorn | San Francisco, US | - | gh:intercom
Front | front.com | product | San Francisco, US | - | gh:frontapp
Gong | gong.io | product unicorn | San Francisco, US | in | gh:gongio
Outreach | outreach.io | product unicorn | Seattle, US | - | gh:outreach
Highspot | highspot.com | product unicorn | Seattle, US | in | gh:highspot
Seismic | seismic.com | product unicorn | San Diego, US | in | gh:seismic
Gainsight | gainsight.com | product | San Francisco, US | in | gh:gainsight
Sprinklr | sprinklr.com | product gcc | New York, US | in p1 | wd:https://sprinklr.wd1.myworkdayjobs.com/careers
Medallia | medallia.com | product | San Francisco, US | in | -
Qualtrics | qualtrics.com | product mnc | Provo, US | - | gh:qualtrics
SurveyMonkey | surveymonkey.com | product | San Mateo, US | - | gh:surveymonkey | Momentive
Coupa | coupa.com | product gcc | San Mateo, US | in | gh:coupasoftware | Coupa Software
Anaplan | anaplan.com | product | San Francisco, US | in | gh:anaplan
Workiva | workiva.com | product | Ames, US | - | wd:https://workiva.wd1.myworkdayjobs.com/careers
BlackLine | blackline.com | product | Woodland Hills, US | in | -
Avalara | avalara.com | product gcc | Seattle, US | in | wd:https://avalara.wd1.myworkdayjobs.com/External
Bill.com | bill.com | product fintech | San Jose, US | - | gh:billcom | BILL
Paychex | paychex.com | product mnc | Rochester, US | - | wd:https://paychex.wd5.myworkdayjobs.com/External
ADP | adp.com | mnc product gcc | Roseland, US | in p1 | wd:https://adp.wd5.myworkdayjobs.com/External | Automatic Data Processing
UKG | ukg.com | product mnc gcc | Weston, US | in | wd:https://ukg.wd5.myworkdayjobs.com/UKGCareers
Ceridian Dayforce | dayforce.com | product | Minneapolis, US | in | - | Dayforce
Rippling | rippling.com | product unicorn | San Francisco, US | in p1 | ab:rippling
Deel | deel.com | product unicorn | San Francisco, US | in remote | ab:deel
Remote | remote.com | product unicorn | San Francisco, US | in remote | gh:remotecom | Remote Technology
Gusto | gusto.com | product unicorn | San Francisco, US | - | gh:gusto
Lattice | lattice.com | product unicorn | San Francisco, US | - | gh:lattice
Culture Amp | cultureamp.com | product unicorn | Melbourne, AU | - | gh:cultureamp
Personio Software | personio.com | product unicorn | Munich, DE | - | ps:personio | Personio
HiBob | hibob.com | product unicorn | London, GB | - | -
Greenhouse Software | greenhouse.com | product | New York, US | remote | gh:greenhouse | Greenhouse
Lever Talent | lever.co | product | San Francisco, US | - | lv:lever | Lever
iCIMS Software | icims.com | product | Holmdel, US | in | - | iCIMS
Eightfold AI | eightfold.ai | product unicorn ai | Santa Clara, US | in | gh:eightfold | Eightfold
Phenom People | phenom.com | product unicorn | Ambler, US | in | - | Phenom
HackerRank | hackerrank.com | product startup | Mountain View, US | in p1 | gh:hackerrank
HackerEarth | hackerearth.com | product startup | Bengaluru, IN | in | -
Coursera | coursera.org | product mnc | Mountain View, US | in | gh:coursera
Udemy | udemy.com | product mnc | San Francisco, US | in | gh:udemy
Duolingo | duolingo.com | product mnc | Pittsburgh, US | - | gh:duolingo
Chegg | chegg.com | product mnc gcc | Santa Clara, US | in | gh:chegg
Pearson | pearson.com | mnc product gcc | London, GB | in | wd:https://pearson.wd3.myworkdayjobs.com/Pearson
Thomson Reuters | thomsonreuters.com | mnc product gcc | Toronto, CA | in p1 | wd:https://thomsonreuters.wd5.myworkdayjobs.com/External_Career_Site
RELX | relx.com | mnc product gcc | London, GB | in | - | Elsevier; LexisNexis
Wolters Kluwer | wolterskluwer.com | mnc product gcc | Alphen aan den Rijn, NL | in | wd:https://wk.wd3.myworkdayjobs.com/External
Gartner | gartner.com | mnc consulting gcc | Stamford, US | in p1 | wd:https://gartner.wd5.myworkdayjobs.com/EXT
Verisk | verisk.com | mnc product gcc | Jersey City, US | in | wd:https://verisk.wd5.myworkdayjobs.com/Verisk
Guidewire Software | guidewire.com | product gcc | San Mateo, US | in | gh:guidewire | Guidewire
Duck Creek Technologies | duckcreek.com | product gcc | Boston, US | in | -
Epic Systems | epic.com | product | Verona, US | - | -
Cerner | cerner.com | product | Kansas City, US | in | -
Veeva Systems | veeva.com | product mnc | Pleasanton, US | in | lv:veeva | Veeva
IQVIA | iqvia.com | mnc gcc | Durham, US | in p1 | wd:https://iqvia.wd1.myworkdayjobs.com/IQVIA
Optum | optum.com | mnc gcc | Eden Prairie, US | in p1 | cu:https://careers.unitedhealthgroup.com/ url:https://www.optum.com/careers.html | UnitedHealth Group; UHG; Optum Global Solutions
Cvent | cvent.com | product gcc | Tysons, US | in p1 | -
Blackbaud | blackbaud.com | product | Charleston, US | - | -
Tyler Technologies | tylertech.com | product | Plano, US | - | -
Procore Technologies | procore.com | product | Carpinteria, US | in | gh:procoretechnologies | Procore
Samsara | samsara.com | product mnc | San Francisco, US | in | gh:samsara
Squarespace | squarespace.com | product | New York, US | - | gh:squarespace
Wix | wix.com | product mnc | Tel Aviv, IL | - | -
GoDaddy | godaddy.com | product mnc gcc | Tempe, US | in | -
Unity Technologies | unity.com | product mnc | San Francisco, US | in | gh:unity3d | Unity
Roblox | roblox.com | product mnc | San Mateo, US | - | gh:roblox
Epic Games | epicgames.com | product unicorn | Cary, US | - | gh:epicgames
Riot Games | riotgames.com | product | Los Angeles, US | - | gh:riotgames
Discord | discord.com | product unicorn | San Francisco, US | - | gh:discord
Slack | slack.com | product | San Francisco, US | - | -
Citrix | citrix.com | mnc product gcc | Fort Lauderdale, US | in | - | Cloud Software Group
Tibco | tibco.com | product | Palo Alto, US | in | -
OpenText | opentext.com | mnc product gcc | Waterloo, CA | in | -
Micro Focus | microfocus.com | mnc product | Newbury, GB | in | -
Infor | infor.com | mnc product gcc | New York, US | in | wd:https://infor.wd1.myworkdayjobs.com/infor_careers
Epicor | epicor.com | product | Austin, US | in | wd:https://epicor.wd5.myworkdayjobs.com/Epicor_Careers
IFS | ifs.com | product mnc | Linkoping, SE | in | -
Manhattan Associates | manh.com | product gcc | Atlanta, US | in | -
Blue Yonder | blueyonder.com | product gcc | Scottsdale, US | in p1 | wd:https://blueyonder.wd5.myworkdayjobs.com/Blue_Yonder
o9 Solutions | o9solutions.com | product unicorn | Dallas, US | in p1 | -
Kinaxis | kinaxis.com | product | Ottawa, CA | in | -
Celonis | celonis.com | product unicorn | Munich, DE | in | gh:celonis
UiPath | uipath.com | product mnc ai | New York, US | in | -
Automation Anywhere | automationanywhere.com | product unicorn ai | San Jose, US | in p1 | -
SailPoint | sailpoint.com | product | Austin, US | in | wd:https://sailpoint.wd1.myworkdayjobs.com/SailPoint
CyberArk | cyberark.com | product mnc | Newton, US | in | -
Ping Identity | pingidentity.com | product | Denver, US | in | -
Tanium | tanium.com | product unicorn | Kirkland, US | - | gh:tanium
Netskope | netskope.com | product unicorn | Santa Clara, US | in | gh:netskope
Illumio | illumio.com | product unicorn | Sunnyvale, US | - | gh:illumio
Arctic Wolf | arcticwolf.com | product unicorn | Eden Prairie, US | in | gh:arcticwolfnetworks
Wiz | wiz.io | product unicorn | New York, US | - | gh:wizinc
Lacework | lacework.com | product | San Jose, US | - | -
Abnormal Security | abnormalsecurity.com | product unicorn ai | San Francisco, US | - | gh:abnormalsecurity
Vanta | vanta.com | product unicorn | San Francisco, US | - | ab:vanta
Drata | drata.com | product unicorn | San Diego, US | - | ab:drata
1Password | 1password.com | product unicorn | Toronto, CA | remote | ab:1password
Bitwarden | bitwarden.com | product | Santa Barbara, US | remote | gh:bitwarden
Tailscale | tailscale.com | product startup | Toronto, CA | remote | gh:tailscale
Auth0 | auth0.com | product | Bellevue, US | - | -
Trellix | trellix.com | product | Milpitas, US | in | -
McAfee | mcafee.com | product mnc | San Jose, US | in | wd:https://mcafee.wd1.myworkdayjobs.com/External
Gen Digital | gendigital.com | product mnc | Tempe, US | in | wd:https://gen.wd1.myworkdayjobs.com/careers | NortonLifeLock; Norton; Avast
Trend Micro | trendmicro.com | product mnc | Tokyo, JP | in | -
Sophos | sophos.com | product | Abingdon, GB | in | -
Qualys | qualys.com | product | Foster City, US | in p1 | -
Tenable | tenable.com | product | Columbia, US | in | -
Rapid7 | rapid7.com | product | Boston, US | in | -
Imperva | imperva.com | product | San Mateo, US | - | -
Mimecast | mimecast.com | product | London, GB | - | -
Proofpoint | proofpoint.com | product | Sunnyvale, US | in | wd:https://proofpoint.wd5.myworkdayjobs.com/ProofpointCareers
Securonix | securonix.com | product | Addison, US | in | -
`);
