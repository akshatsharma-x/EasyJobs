/**
 * Skill dictionary (~650 canonical skills). One line per skill: `Canonical Name :: alias|alias|…`.
 * Aliases are matched on token boundaries (see skills.ts). Per-alias rule prefixes:
 *   (none) any case                       "python", "node.js"
 *   ~      must be capitalised             "~react"  → "React", not "react quickly"
 *   =      must be upper-case              "=sas", "=rest"
 *   !      capitalised AND in a list / tech context — for words that are also English words or letters
 *          ("!go" never matches "go live" / "ready to go"; "!r" never matches "R&D"; "!excel" never matches "excel in")
 * The canonical name is always an alias too (any case) unless an alias with the same key overrides its rule.
 */

export const SKILL_GROUPS = [
  "lang", "web", "mobile", "data", "ml", "db", "cs", "cloud", "devops", "security", "qa", "design", "office",
  "erp", "marketing", "sales", "finance", "hr", "core", "blockchain", "game", "pm", "support", "healthcare",
  "legal", "education", "soft",
] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];

export const SKILL_SOURCE: Readonly<Record<SkillGroup, string>> = {
  lang: `
Python :: python|python3|python 3|core python|advanced python
Java :: java|core java|java 8|java8|java 11|java 17|java 21|j2ee|jee|java ee|java se|advanced java
JavaScript :: javascript|js|java script|ecmascript|es6|es2015|vanilla js|vanilla javascript
TypeScript :: typescript|type script
C++ :: c++|cpp|c plus plus|modern c++
C# :: c#|c sharp|csharp
C :: !c|c programming|c language|ansi c|c lang
Go :: !go|golang|go lang|go-lang|go programming|go language
Rust :: ~rust|rust lang|rustlang
Ruby :: ~ruby
PHP :: php|php7|php 7|php8|php 8|core php
Kotlin :: kotlin
Swift :: !swift|swift programming|swift language|swift 5
Objective-C :: objective-c|objective c|objc|obj-c
Scala :: scala
R :: !r|r programming|r language|rstudio|r studio|r shiny
MATLAB :: matlab
Perl :: ~perl
Dart :: ~dart
Elixir :: ~elixir
Erlang :: erlang
Haskell :: haskell
Clojure :: clojure
F# :: f#|fsharp|f sharp
Lua :: ~lua
Julia :: !julia|julia language|julialang
Groovy :: ~groovy
OCaml :: ocaml
Bash :: bash|bash scripting|bash script|bash scripts
Shell Scripting :: shell scripting|shell script|shell scripts|unix shell scripting|unix scripting|linux shell scripting|shell programming
PowerShell :: powershell|power shell
VBA :: vba|excel vba|vba macros|visual basic for applications
Visual Basic :: visual basic|vb.net|vb6
COBOL :: cobol
Fortran :: fortran
Assembly :: assembly language|x86 assembly|arm assembly|assembly programming
Solidity :: solidity
Verilog :: verilog
SystemVerilog :: systemverilog|system verilog
VHDL :: vhdl
Apex :: !apex|salesforce apex|apex programming
ABAP :: abap|sap abap
HTML :: html|html5|html 5
CSS :: css|css3|css 3
Sass :: sass|scss
XML :: xml
LaTeX :: ~latex
`,
  web: `
React :: ~react|react.js|reactjs|react js|react hooks
Next.js :: next.js|nextjs|next js
Angular :: ~angular|angularjs|angular.js|angular js
Vue.js :: vue|vue.js|vuejs|vue js|vue3
Nuxt.js :: nuxt|nuxt.js|nuxtjs
Svelte :: svelte|sveltekit
Redux :: redux|redux toolkit|redux-saga|redux saga
MobX :: mobx
RxJS :: rxjs
NgRx :: ngrx
jQuery :: jquery
Bootstrap :: ~bootstrap
Tailwind CSS :: tailwind|tailwindcss|tailwind css
Material UI :: material ui|material-ui|mui
Webpack :: webpack
Vite :: ~vite
Node.js :: node.js|nodejs|node js|~node
Express.js :: express.js|expressjs|express js|!express
NestJS :: nestjs|nest.js|nest js
Django :: django|django rest framework|drf
Flask :: ~flask
FastAPI :: fastapi|fast api
Spring Boot :: spring boot|springboot|spring-boot
Spring :: !spring|spring framework|spring mvc|spring security|spring cloud|spring data|spring batch
Hibernate :: hibernate
Ruby on Rails :: ruby on rails|rails framework|ror|~rails
Laravel :: laravel
Symfony :: symfony
CodeIgniter :: codeigniter|code igniter
ASP.NET :: asp.net|asp.net core|asp.net mvc|aspnet|asp .net|asp net
.NET :: .net|dotnet|dot net|.net core|.net framework|net core
Blazor :: blazor
Entity Framework :: entity framework|ef core
JSP :: jsp|java server pages
Servlets :: servlets|servlet|java servlets
Struts :: struts
Micronaut :: micronaut
Quarkus :: quarkus
Deno :: ~deno
Socket.IO :: socket.io|socketio
WebSockets :: websocket|websockets|web sockets|web socket
REST APIs :: =rest|rest api|rest apis|restful|restful api|restful apis|restful services|rest services|restful web services|rest web services|rest endpoints
GraphQL :: graphql|graph ql
gRPC :: grpc
Microservices :: microservices|micro services|microservice|microservice architecture|micro-services
Three.js :: three.js|threejs
D3.js :: d3.js|d3js|=d3
WordPress :: wordpress|word press
Shopify :: shopify
Magento :: magento
Drupal :: drupal
Webflow :: webflow
Storybook :: storybook
Electron :: ~electron|electron.js|electronjs
PWA :: pwa|progressive web apps|progressive web app
Ajax :: ajax
Gatsby :: gatsby|gatsbyjs
Responsive Design :: responsive design|responsive web design
MERN Stack :: mern|mern stack
MEAN Stack :: mean stack
Frontend Development :: frontend development|front-end development|front end development
Backend Development :: backend development|back-end development|back end development
Full Stack Development :: full stack development|full-stack development|fullstack development
`,
  mobile: `
Android :: android|android sdk|android development|android studio
iOS :: ios|ios development|ios sdk
React Native :: react native|react-native|reactnative
Flutter :: flutter
SwiftUI :: swiftui|swift ui
Jetpack Compose :: jetpack compose|jetpack
Xamarin :: xamarin
Ionic :: ionic framework|~ionic
UIKit :: uikit
Xcode :: xcode
`,
  ml: `
Machine Learning :: machine learning|=ml|ml models|ml algorithms
Deep Learning :: deep learning
Artificial Intelligence :: artificial intelligence|!ai
Generative AI :: generative ai|genai|gen ai|gen-ai|generative artificial intelligence|chatgpt
LLMs :: llm|llms|large language models|large language model
NLP :: nlp|natural language processing
Computer Vision :: computer vision
Image Processing :: image processing
TensorFlow :: tensorflow|tensor flow
PyTorch :: pytorch
Keras :: keras
scikit-learn :: scikit-learn|sklearn|scikit learn|scikit
OpenCV :: opencv|open cv
Hugging Face :: hugging face|huggingface|hugging face transformers
LangChain :: langchain|lang chain
LlamaIndex :: llamaindex|llama index
RAG :: =rag|retrieval augmented generation|retrieval-augmented generation
Prompt Engineering :: prompt engineering
MLOps :: mlops|ml ops
XGBoost :: xgboost
LightGBM :: lightgbm
Reinforcement Learning :: reinforcement learning
Neural Networks :: neural networks|neural network|=cnn|=rnn|lstm|=gan|=gans
Recommendation Systems :: recommendation systems|recommender systems|recommendation engines|recommendation engine
Predictive Modeling :: predictive modeling|predictive modelling|predictive analytics
Feature Engineering :: feature engineering
Vector Databases :: vector database|vector databases|vector db|pinecone|weaviate|milvus|chromadb|faiss|qdrant
OpenAI API :: openai api|openai apis
CUDA :: cuda
TensorRT :: tensorrt
SageMaker :: sagemaker|amazon sagemaker|aws sagemaker
Vertex AI :: vertex ai
Amazon Bedrock :: amazon bedrock|aws bedrock
`,
  data: `
Data Science :: data science
Data Analysis :: data analysis|data analytics
Statistics :: statistics|statistical analysis|statistical modeling|statistical modelling|applied statistics
Pandas :: pandas
NumPy :: numpy
SciPy :: scipy
Matplotlib :: matplotlib
Seaborn :: seaborn
Plotly :: plotly
Jupyter :: jupyter|jupyter notebook|jupyter notebooks|jupyterlab
Data Visualization :: data visualization|data visualisation|data viz
A/B Testing :: a/b testing|ab testing|a/b tests|split testing|a/b test
Data Mining :: data mining
Big Data :: big data
ETL :: etl|elt|etl pipelines|etl processes|extract transform load
Data Warehousing :: data warehousing|data warehouse|dwh|data warehouses
Data Modeling :: data modeling|data modelling|dimensional modeling|dimensional modelling
Data Engineering :: data engineering
Data Pipelines :: data pipelines|data pipeline
Time Series :: time series|time-series|time series analysis|time series forecasting
Spark :: ~spark|apache spark|spark sql|spark streaming
PySpark :: pyspark|py spark
Hadoop :: hadoop|apache hadoop|hdfs|mapreduce|map reduce
Hive :: ~hive|apache hive|hiveql|hive ql
Kafka :: kafka|apache kafka|kafka streams
Airflow :: ~airflow|apache airflow
Flink :: flink|apache flink
Databricks :: databricks
Snowflake :: ~snowflake
BigQuery :: bigquery|big query|google bigquery
Redshift :: redshift|amazon redshift|aws redshift
dbt :: dbt|data build tool
Tableau :: tableau
Power BI :: power bi|powerbi|power-bi|microsoft power bi|ms power bi
Looker :: ~looker|looker studio|google data studio
Qlik :: qlik|qlikview|qlik sense|qliksense
Excel :: !excel|ms excel|microsoft excel|ms-excel|advanced excel|excel sheets|excel spreadsheets|excel formulas|excel macros|basic excel|spreadsheets|spreadsheet|pivot tables|vlookup
Google Sheets :: google sheets|google spreadsheets|gsheets
MS Access :: ms access|microsoft access
SAS :: =sas|sas programming|base sas|sas enterprise guide
SPSS :: spss|ibm spss
Stata :: ~stata
Alteryx :: alteryx
Informatica :: informatica|informatica powercenter
Talend :: talend
SSIS :: ssis
SSRS :: ssrs
SSAS :: ssas
Elasticsearch :: elasticsearch|elastic search|=elk|elk stack|elastic stack|opensearch
Kibana :: kibana
Logstash :: logstash
Business Intelligence :: business intelligence|=bi
Data Entry :: data entry|data-entry
`,
  db: `
SQL :: sql|structured query language|sql queries|advanced sql
PL/SQL :: pl/sql|plsql|pl sql
T-SQL :: t-sql|tsql|transact-sql|transact sql
MySQL :: mysql|my sql
PostgreSQL :: postgresql|postgres|postgre sql|postgre|psql
MongoDB :: mongodb|mongo|mongo db|mongoose
Redis :: redis
SQLite :: sqlite
Oracle Database :: oracle db|oracle database|oracle sql|oracle 11g|oracle 12c|oracle 19c|oracle rdbms|!oracle
SQL Server :: sql server|ms sql|mssql|ms-sql|microsoft sql server|ms sql server
MariaDB :: mariadb
Cassandra :: cassandra|apache cassandra
DynamoDB :: dynamodb|dynamo db|amazon dynamodb
Couchbase :: couchbase
Firebase :: firebase|firestore|firebase realtime database
Supabase :: supabase
Neo4j :: neo4j
HBase :: hbase
ClickHouse :: clickhouse
NoSQL :: nosql|no sql|no-sql
DBMS :: dbms|rdbms|database management systems|database management system|relational databases|relational database
Database Design :: database design
DB2 :: db2|ibm db2
Teradata :: teradata
Memcached :: memcached
InfluxDB :: influxdb
Prisma :: ~prisma
Sequelize :: sequelize
JPA :: jpa|java persistence api
`,
  cs: `
Data Structures :: data structures|data structure|=dsa|data structures and algorithms|data structure and algorithms|ds and algo
Algorithms :: algorithms|algorithm design
OOP :: oop|oops|object oriented programming|object-oriented programming|object oriented design|object-oriented design|ood|oops concepts|oop concepts
System Design :: system design|low level design|high level design|=lld|=hld
Design Patterns :: design patterns
Operating Systems :: operating systems|operating system concepts
Computer Networks :: computer networks|computer networking|networking concepts
Distributed Systems :: distributed systems|distributed computing
Multithreading :: multithreading|multi-threading|concurrency
Competitive Programming :: competitive programming|competitive coding
`,
  cloud: `
AWS :: aws|amazon web services|aws cloud
Azure :: azure|microsoft azure|ms azure|azure cloud
GCP :: gcp|google cloud|google cloud platform
Oracle Cloud :: oci|oracle cloud|oracle cloud infrastructure
IBM Cloud :: ibm cloud
AWS Lambda :: aws lambda|lambda functions
EC2 :: ec2|amazon ec2|aws ec2
S3 :: =s3|amazon s3|aws s3
CloudFormation :: cloudformation|aws cloudformation
EKS :: =eks|amazon eks|aws eks
ECS :: =ecs|amazon ecs|aws ecs
AKS :: =aks|azure kubernetes service
GKE :: =gke|google kubernetes engine
Azure DevOps :: azure devops|vsts
Azure Data Factory :: azure data factory|=adf
Azure Functions :: azure functions
AWS Glue :: aws glue
Serverless :: serverless|serverless architecture|serverless computing
Cloud Computing :: cloud computing|cloud technologies|cloud platforms|cloud services
OpenShift :: openshift|red hat openshift
VMware :: vmware|vsphere|esxi
Virtualization :: virtualization|virtualisation
Heroku :: heroku
Vercel :: vercel
Netlify :: netlify
Cloudflare :: cloudflare
DigitalOcean :: digitalocean|digital ocean
`,
  devops: `
Docker :: docker|docker compose|docker-compose|dockerfile
Kubernetes :: kubernetes|k8s|kubectl
Terraform :: terraform
Ansible :: ansible
Jenkins :: jenkins
GitHub Actions :: github actions
GitLab CI :: gitlab ci|gitlab-ci|gitlab pipelines
CircleCI :: circleci|circle ci
Travis CI :: travis ci
Argo CD :: argo cd|argocd
Helm :: !helm|helm charts|helm chart
Prometheus :: ~prometheus
Grafana :: grafana
Datadog :: datadog
New Relic :: new relic|newrelic
Splunk :: splunk
Nagios :: nagios
Zabbix :: zabbix
Linux :: linux|unix/linux|gnu/linux|ubuntu|centos|rhel|red hat linux|redhat linux|debian|linux administration|linux os
Unix :: unix|unix systems
Windows Server :: windows server|windows administration|windows servers
Windows :: !windows|windows os|ms windows|microsoft windows
macOS :: macos|mac os|os x
CI/CD :: ci/cd|ci cd|cicd|ci-cd|continuous integration|continuous delivery|continuous deployment|ci/cd pipelines
DevOps :: devops|dev ops|devops practices
Git :: git|git version control
GitHub :: github
GitLab :: gitlab
Bitbucket :: bitbucket
SVN :: svn|subversion
Version Control :: version control|version control systems
Nginx :: nginx
Apache Tomcat :: tomcat|apache tomcat
Apache HTTP Server :: apache http server|apache httpd|apache web server|httpd
Maven :: ~maven|apache maven
Gradle :: gradle
npm :: npm
RabbitMQ :: rabbitmq|rabbit mq
ActiveMQ :: activemq
Istio :: istio
Pulumi :: pulumi
Puppet :: !puppet
Chef :: !chef
SRE :: =sre|site reliability engineering|site reliability
Observability :: observability
TCP/IP :: tcp/ip|tcp ip|tcp-ip|=tcp|=udp
DNS :: =dns
Load Balancing :: load balancing|load balancers|load balancer
Networking :: !networking|network administration|routing and switching|routing & switching|lan/wan|lan wan|network engineering
CCNA :: ccna|ccnp|ccie
Active Directory :: active directory|azure ad|azure active directory|entra id
ITIL :: itil|itil v4
Infrastructure as Code :: infrastructure as code|=iac
`,
  security: `
Cybersecurity :: cybersecurity|cyber security|information security|infosec|it security
Network Security :: network security
Penetration Testing :: penetration testing|pen testing|pentesting|pentest|pen test|=vapt|vulnerability assessment and penetration testing
Ethical Hacking :: ethical hacking
Vulnerability Assessment :: vulnerability assessment|vulnerability management|vulnerability scanning
SIEM :: siem|security information and event management
OWASP :: owasp|owasp top 10
Burp Suite :: burp suite|burpsuite
Metasploit :: metasploit
Wireshark :: wireshark
Nmap :: nmap
Kali Linux :: kali linux
Firewalls :: firewall|firewalls|firewall management
IAM :: =iam|identity and access management|identity & access management
OAuth :: oauth|oauth2|oauth 2.0|openid connect|oidc
JWT :: jwt|json web tokens|json web token
SSO :: single sign-on|single sign on|=sso
Cryptography :: cryptography|encryption
ISO 27001 :: iso 27001|iso/iec 27001|iso27001
SOC 2 :: soc 2|soc2
GDPR :: gdpr
Incident Response :: incident response
Malware Analysis :: malware analysis
Digital Forensics :: digital forensics|computer forensics
Cloud Security :: cloud security
DevSecOps :: devsecops
Application Security :: application security|appsec
Threat Intelligence :: threat intelligence|threat hunting
CISSP :: cissp
CEH :: =ceh|certified ethical hacker
CompTIA Security+ :: security+|comptia security+
`,
  qa: `
Selenium :: ~selenium|selenium webdriver|selenium grid
Cypress :: ~cypress|cypress.io
Playwright :: ~playwright
Appium :: appium
JUnit :: junit|junit5
TestNG :: testng
PyTest :: pytest
Jest :: ~jest
Mocha :: !mocha
Postman :: ~postman
JMeter :: jmeter|apache jmeter
LoadRunner :: loadrunner|load runner
Cucumber :: ~cucumber|gherkin
BDD :: =bdd|behavior driven development|behaviour driven development
TDD :: =tdd|test driven development|test-driven development
Manual Testing :: manual testing|manual qa
Automation Testing :: automation testing|test automation|automated testing
API Testing :: api testing
Performance Testing :: performance testing|load testing|stress testing
Regression Testing :: regression testing
Unit Testing :: unit testing|unit tests
Integration Testing :: integration testing
Robot Framework :: robot framework
Rest Assured :: rest assured|restassured|rest-assured
SoapUI :: soapui|soap ui
Katalon :: katalon|katalon studio
TestRail :: testrail
UFT :: uft|qtp|unified functional testing
Software Testing :: software testing|qa testing|quality assurance testing
Mobile Testing :: mobile testing|mobile app testing
STLC :: stlc
`,
  design: `
Figma :: figma
Adobe XD :: adobe xd|=xd
Sketch :: !sketch|sketch app
Photoshop :: photoshop|adobe photoshop
Illustrator :: ~illustrator|adobe illustrator
InDesign :: indesign|adobe indesign
After Effects :: after effects|adobe after effects|aftereffects
Premiere Pro :: premiere pro|adobe premiere|adobe premiere pro
Lightroom :: lightroom|adobe lightroom
CorelDRAW :: coreldraw|corel draw|corel
Canva :: canva
Blender :: !blender|blender 3d
Maya :: !maya|autodesk maya
3ds Max :: 3ds max|3dsmax|3d studio max|3d max
Cinema 4D :: cinema 4d|cinema4d|=c4d
UI/UX Design :: ui/ux|ux/ui|ui ux|ui-ux|ui and ux|ux design|ui design|user experience design|user interface design|ux designer|ui designer|ux/ui design
Wireframing :: wireframing|wireframes|wireframe
Prototyping :: prototyping|rapid prototyping
User Research :: user research|ux research|usability testing
Design Systems :: design systems|design system
Interaction Design :: interaction design
Typography :: typography
Motion Graphics :: motion graphics|motion design
Video Editing :: video editing
Graphic Design :: graphic design|graphic designing|graphics design
Adobe Creative Suite :: adobe creative suite|adobe creative cloud|creative cloud|adobe cc|adobe suite
InVision :: invision
Zeplin :: zeplin
Framer :: ~framer
Miro :: ~miro
Final Cut Pro :: final cut pro|final cut
DaVinci Resolve :: davinci resolve|da vinci resolve
Unity :: !unity|unity3d|unity 3d|unity engine
Unreal Engine :: unreal engine|=ue4|=ue5|~unreal
Animation :: 2d animation|3d animation|~animation
3D Modeling :: 3d modeling|3d modelling
Illustration :: digital illustration|~illustration
Branding :: branding|brand identity
Logo Design :: logo design
Web Design :: web design|web designing
Visual Design :: visual design
`,
  office: `
MS Office :: ms office|microsoft office|ms-office|office 365|microsoft 365|m365|o365|ms office suite
MS Word :: ms word|microsoft word|ms-word
PowerPoint :: powerpoint|power point|ms powerpoint|microsoft powerpoint|ms-powerpoint
Google Workspace :: google workspace|g suite|gsuite|google suite|google docs
Outlook :: ~outlook|ms outlook|microsoft outlook
Jira :: jira|atlassian jira
Confluence :: ~confluence
Trello :: trello
Asana :: ~asana
Notion :: !notion|notion.so
Slack :: !slack
Monday.com :: monday.com
ClickUp :: clickup
Typing :: typing speed|fast typing|~typing
`,
  erp: `
SAP :: =sap|sap erp|sap ecc
SAP HANA :: sap hana|hana
SAP FICO :: sap fico|sap fi/co|sap fi co|sap fi|sap co
SAP MM :: sap mm
SAP SD :: sap sd
SAP S/4HANA :: s/4hana|s4hana|s4 hana|sap s/4hana|sap s4hana
SAP BW :: sap bw|sap bi
SAP SuccessFactors :: successfactors|sap successfactors|success factors
SAP Ariba :: ariba|sap ariba
Oracle ERP :: oracle erp|oracle ebs|oracle e-business suite|oracle fusion|oracle apps
Salesforce :: salesforce|sfdc|salesforce.com|salesforce crm|salesforce lightning
HubSpot :: hubspot|hub spot
Zoho CRM :: zoho crm
Microsoft Dynamics :: dynamics 365|ms dynamics|microsoft dynamics|dynamics crm|d365
ServiceNow :: servicenow|service now
Workday :: workday hcm|~workday
Power Apps :: power apps|powerapps
Power Automate :: power automate|microsoft flow
SharePoint :: sharepoint|share point
Tally :: !tally|tally erp|tally erp 9|tally prime|tallyprime
QuickBooks :: quickbooks|quick books
Xero :: ~xero
Zendesk :: zendesk
Freshdesk :: freshdesk
CRM :: =crm|crm software|crm tools
ERP :: =erp|erp systems
RPA :: =rpa|robotic process automation
UiPath :: uipath|ui path
Automation Anywhere :: automation anywhere
Blue Prism :: blue prism
Guidewire :: guidewire
Pega :: pega|pegasystems
Appian :: appian
Mainframe :: mainframe|mainframes|z/os
JCL :: jcl
CICS :: cics
`,
  marketing: `
SEO :: seo|search engine optimization|search engine optimisation|on-page seo|off-page seo|technical seo
SEM :: =sem|search engine marketing
Social Media Marketing :: social media marketing|=smm|social media management|social media
Digital Marketing :: digital marketing|online marketing
Content Marketing :: content marketing
Email Marketing :: email marketing|e-mail marketing|email campaigns
Performance Marketing :: performance marketing
Affiliate Marketing :: affiliate marketing
Influencer Marketing :: influencer marketing
Google Analytics :: google analytics|ga4|universal analytics
Google Ads :: google ads|adwords|google adwords
Meta Ads :: facebook ads|meta ads|instagram ads|facebook marketing|facebook ads manager|meta ads manager
PPC :: =ppc|pay per click|pay-per-click
Google Tag Manager :: google tag manager
Mailchimp :: mailchimp
Semrush :: semrush
Ahrefs :: ahrefs
Marketing Automation :: marketing automation
Market Research :: market research|marketing research
Brand Management :: brand management
Copywriting :: copywriting|copy writing
Content Writing :: content writing|blog writing|article writing
Creative Writing :: creative writing
Technical Writing :: technical writing|technical documentation
Proofreading :: proofreading|proof reading
Public Relations :: public relations
Growth Marketing :: growth hacking|growth marketing
Product Marketing :: product marketing
Event Management :: event management|event planning
Lead Generation :: lead generation|lead gen
`,
  sales: `
B2B Sales :: b2b sales|b2b
B2C Sales :: b2c sales|b2c
Inside Sales :: inside sales
Cold Calling :: cold calling|cold calls|tele calling|telecalling|tele-calling
Business Development :: business development
Account Management :: account management|key account management
Relationship Management :: client relationship management|customer relationship management|relationship management
Pre-sales :: pre-sales|presales|pre sales
Channel Sales :: channel sales
Field Sales :: field sales
`,
  finance: `
Financial Modeling :: financial modeling|financial modelling
Financial Analysis :: financial analysis|financial statement analysis
Accounting :: accounting|accountancy
Bookkeeping :: bookkeeping|book keeping
Taxation :: taxation|direct tax|indirect tax|income tax
GST :: =gst|goods and services tax|gst filing|gst returns
TDS :: =tds
Auditing :: auditing|internal audit|statutory audit|external audit
Valuation :: business valuation|valuation modeling|valuation modelling|equity valuation|company valuations|=dcf|discounted cash flow|~valuation
Equity Research :: equity research
FP&A :: fp&a|financial planning and analysis|financial planning & analysis
Budgeting :: budgeting|budget management
IFRS :: ifrs
US GAAP :: us gaap|=gaap
Ind AS :: ind as|ind-as
Accounts Payable :: accounts payable
Accounts Receivable :: accounts receivable
Payroll :: payroll|payroll processing|payroll management
Reconciliation :: reconciliation|bank reconciliation|account reconciliation
Bloomberg Terminal :: bloomberg terminal
Credit Analysis :: credit analysis|credit risk|credit appraisal
Risk Management :: risk management|risk assessment
KYC :: =kyc|know your customer
AML :: =aml|anti-money laundering|anti money laundering
Investment Banking :: investment banking
Portfolio Management :: portfolio management
Financial Reporting :: financial reporting
Cost Accounting :: cost accounting
MIS Reporting :: =mis|mis reporting|management information systems
`,
  hr: `
Recruitment :: !recruitment|!recruiting|talent acquisition|end to end recruitment|end-to-end recruitment|full cycle recruiting|full-cycle recruiting|technical recruiting|technical recruitment|it recruitment|bulk hiring|volume hiring|recruitment strategy|candidate screening
Candidate Sourcing :: candidate sourcing|talent sourcing
Onboarding :: employee onboarding|!onboarding
HRIS :: hris|hrms|hr information systems
Employee Engagement :: employee engagement
Labour Laws :: labour laws|labor laws|labour law|labor law|statutory compliance
Performance Management :: performance management|performance appraisal
Compensation and Benefits :: ~compensation and benefits|~compensation & benefits|c&b management|benefits administration
HR Operations :: hr operations|hr ops
Learning and Development :: ~learning and development|~learning & development|~training and development|l&d programs|l&d strategy
Talent Management :: talent management
LinkedIn Recruiter :: linkedin recruiter
`,
  core: `
AutoCAD :: autocad|auto cad|autodesk autocad|autocad 2d|autocad 3d
SolidWorks :: solidworks|solid works
CATIA :: catia|catia v5
Creo :: creo|ptc creo|pro/e|pro-e|pro engineer|proe
ANSYS :: ansys|ansys fluent|ansys workbench
Siemens NX :: siemens nx|unigraphics|nx cad|=nx
Fusion 360 :: fusion 360|fusion360|autodesk fusion
Revit :: revit|autodesk revit
STAAD.Pro :: staad pro|staad.pro|staad|staadpro
ETABS :: etabs
Primavera P6 :: primavera p6|primavera
MS Project :: ms project|microsoft project
Simulink :: simulink
LabVIEW :: labview
PLC :: =plc|plc programming|programmable logic controller
SCADA :: scada
HMI :: =hmi
DCS :: =dcs|distributed control system
PCB Design :: pcb design|=pcb|pcb layout
Altium Designer :: altium|altium designer
KiCad :: kicad
Cadence :: cadence virtuoso|~cadence|orcad
Synopsys :: synopsys
VLSI :: vlsi|vlsi design
FPGA :: fpga|fpgas
ASIC :: asic|asic design
RTL Design :: =rtl|rtl design|rtl coding
Physical Design :: physical design
Embedded C :: embedded c
Embedded Systems :: embedded systems|embedded system|embedded software|embedded development
Microcontrollers :: microcontrollers|microcontroller|=mcu|stm32|pic microcontroller
Arduino :: arduino
Raspberry Pi :: raspberry pi|raspberrypi
RTOS :: rtos|freertos|real time operating systems|real-time operating systems
IoT :: iot|internet of things|=iiot
CAN Bus :: can bus|can protocol|canbus
AUTOSAR :: autosar
GD&T :: gd&t|geometric dimensioning and tolerancing
CNC Programming :: =cnc|cnc programming|cnc machining
Six Sigma :: six sigma|lean six sigma|6 sigma
Lean Manufacturing :: lean manufacturing|lean principles
Kaizen :: kaizen
Quality Control :: quality control|=qc
HVAC :: hvac
MEP :: =mep
FEA :: =fea|finite element analysis
CFD :: =cfd|computational fluid dynamics
Robotics :: robotics
ROS :: =ros|robot operating system|ros2
ETAP :: etap
Power Systems :: power systems|power system
Circuit Design :: circuit design|analog circuit design|digital circuit design|analog design
Signal Processing :: signal processing|digital signal processing|=dsp
Thermodynamics :: thermodynamics
Machine Design :: machine design
Surveying :: surveying|land surveying|total station
Structural Analysis :: structural analysis|structural design
Quantity Surveying :: quantity surveying|=boq|bill of quantities
Aspen HYSYS :: aspen hysys|hysys
Aspen Plus :: aspen plus
Instrumentation :: instrumentation
Solar PV :: solar pv|photovoltaics|photovoltaic
`,
  blockchain: `
Blockchain :: blockchain|block chain
Ethereum :: ethereum
Web3 :: web3|web 3.0|web3.js|ethers.js
Smart Contracts :: smart contracts|smart contract
Hyperledger :: hyperledger|hyperledger fabric
DeFi :: defi
`,
  game: `
Game Development :: game development|game dev
Godot :: godot
`,
  pm: `
Agile :: ~agile|agile methodology|agile methodologies|agile development|agile scrum
Scrum :: scrum|scrum methodology
Kanban :: kanban
SDLC :: sdlc|software development life cycle|software development lifecycle
Product Management :: product management
Product Roadmapping :: product roadmap|product roadmaps|roadmapping
Project Management :: project management|=pmp|project planning|project coordination
Program Management :: program management|programme management
Stakeholder Management :: stakeholder management
Requirements Gathering :: requirements gathering|requirement gathering|requirement analysis|requirements analysis|business requirements
User Stories :: user stories|user story
Waterfall :: ~waterfall
PRINCE2 :: prince2
Change Management :: change management
Business Analysis :: business analysis
Process Improvement :: process improvement|business process improvement|process optimization|process optimisation
Operations Management :: operations management
Supply Chain Management :: supply chain management|supply chain
Logistics :: logistics|logistics management
Procurement :: procurement|purchasing|sourcing and procurement
Inventory Management :: inventory management|inventory control|stock management
Vendor Management :: vendor management|supplier management
OKRs :: =okr|=okrs
Root Cause Analysis :: root cause analysis|=rca
`,
  support: `
Customer Service :: customer service|customer support|customer care|client servicing
Technical Support :: technical support|tech support|it support|desktop support|helpdesk|help desk|service desk
Troubleshooting :: troubleshooting|trouble shooting
Ticketing Systems :: ticketing systems|ticketing tools|ticketing system|ticketing tool
Voice Process :: voice process|inbound calls|outbound calls|international voice process
Chat Support :: chat support|non-voice|non voice|email support
`,
  healthcare: `
Medical Coding :: medical coding|icd-10|icd 10|cpt coding
Clinical Research :: clinical research|clinical trials
Pharmacovigilance :: pharmacovigilance
Patient Care :: patient care
Medical Writing :: medical writing
Regulatory Affairs :: regulatory affairs
GMP :: =gmp|good manufacturing practices|good manufacturing practice
EHR :: electronic health records|=ehr|=emr
`,
  legal: `
Contract Drafting :: contract drafting|drafting contracts|legal drafting
Legal Research :: legal research
Regulatory Compliance :: regulatory compliance|compliance management
Corporate Law :: corporate law
Intellectual Property :: intellectual property|ip law|patent drafting
Litigation :: litigation
`,
  education: `
Teaching :: ~teaching
Curriculum Development :: curriculum development|curriculum design|instructional design
Tutoring :: tutoring
E-learning :: e-learning|elearning|=lms|articulate storyline|articulate 360
`,
  soft: `
Communication :: communication|communication skills|verbal communication|written communication|good communication|excellent communication|effective communication|communications skills
English Proficiency :: english proficiency|spoken english|written english|fluent english|english communication|english speaking|proficiency in english|fluency in english|good english|english (spoken)|english (written)
Hindi Proficiency :: hindi proficiency|spoken hindi|fluent hindi|hindi speaking|proficiency in hindi|fluency in hindi|hindi (spoken)
Problem Solving :: problem solving|problem-solving|problem solving skills
Teamwork :: teamwork|team work|team player|team-player|collaboration skills
Leadership :: leadership skills|team leadership|people management|~leadership
Time Management :: time management
Critical Thinking :: critical thinking
Attention to Detail :: attention to detail|detail oriented|detail-oriented|eye for detail
Presentation Skills :: presentation skills|public speaking
Interpersonal Skills :: interpersonal skills|interpersonal
Negotiation :: negotiation|negotiation skills|negotiating
Analytical Skills :: analytical skills|analytical thinking|analytical mindset|analytical ability
Creativity :: creativity|creative thinking
Multitasking :: multitasking|multi-tasking
Decision Making :: decision making|decision-making
Adaptability :: adaptability
`,
};
