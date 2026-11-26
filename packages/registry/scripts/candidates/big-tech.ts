import { parseCandidates } from "./parse";

// name | domain | tags | hq | flags | hints | aka
export default parseCandidates("big-tech", `
Google | google.com | big_tech mnc product gcc ai | Mountain View, US | in p1 | cu:https://www.google.com/about/careers/applications/ url:https://www.google.com/about/careers/applications/ | Alphabet; Google India; Google LLC
Microsoft | microsoft.com | big_tech mnc product gcc ai | Redmond, US | in p1 | cu:https://jobs.careers.microsoft.com/global/en/search url:https://careers.microsoft.com/ | Microsoft India; Microsoft IDC
Amazon | amazon.com | big_tech mnc product gcc | Seattle, US | in p1 | cu:https://www.amazon.jobs/en/ url:https://www.amazon.jobs/en/ | Amazon.com; Amazon Web Services; AWS; Amazon Development Centre India
Apple | apple.com | big_tech mnc product | Cupertino, US | in p1 | cu:https://jobs.apple.com/en-in/search url:https://jobs.apple.com/en-in/search | Apple Inc
Meta | meta.com | big_tech mnc product ai | Menlo Park, US | in p1 | cu:https://www.metacareers.com/jobs url:https://www.metacareers.com/jobs | Facebook; Meta Platforms
Netflix | netflix.com | big_tech mnc product | Los Gatos, US | in p1 | ef:explore.jobs.netflix.net,netflix.com url:https://jobs.netflix.com/
NVIDIA | nvidia.com | big_tech mnc product gcc ai | Santa Clara, US | in p1 | wd:https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite url:https://www.nvidia.com/en-us/about-nvidia/careers/
Adobe | adobe.com | big_tech mnc product gcc | San Jose, US | in p1 | wd:https://adobe.wd5.myworkdayjobs.com/external_experienced url:https://careers.adobe.com/us/en
Salesforce | salesforce.com | big_tech mnc product gcc | San Francisco, US | in p1 | wd:https://salesforce.wd12.myworkdayjobs.com/External_Career_Site url:https://careers.salesforce.com/en/jobs/
Oracle | oracle.com | big_tech mnc product gcc | Austin, US | in p1 | or:https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch url:https://careers.oracle.com/
IBM | ibm.com | big_tech mnc product service gcc | Armonk, US | in p1 | cu:https://www.ibm.com/careers/search url:https://www.ibm.com/careers/search
Intel | intel.com | big_tech mnc product gcc | Santa Clara, US | in p1 | wd:https://intel.wd1.myworkdayjobs.com/External url:https://jobs.intel.com/
Cisco | cisco.com | big_tech mnc product gcc | San Jose, US | in p1 | wd:https://cisco.wd5.myworkdayjobs.com/Cisco_Careers url:https://jobs.cisco.com/
SAP | sap.com | big_tech mnc product gcc | Walldorf, DE | in p1 | sf:https://jobs.sap.com/ url:https://jobs.sap.com/ | SAP SE; SAP Labs India
Uber | uber.com | big_tech mnc product | San Francisco, US | in p1 | cu:https://www.uber.com/us/en/careers/list/ url:https://www.uber.com/us/en/careers/
LinkedIn | linkedin.com | big_tech mnc product | Sunnyvale, US | in p1 | cu:https://careers.linkedin.com/ url:https://careers.linkedin.com/
Airbnb | airbnb.com | big_tech mnc product | San Francisco, US | in p1 | gh:airbnb url:https://careers.airbnb.com/
Samsung | samsung.com | big_tech mnc product gcc | Suwon, KR | in p1 | wd:https://sec.wd3.myworkdayjobs.com/Samsung_Careers url:https://www.samsung.com/in/about-us/careers/ | Samsung R&D Institute India; Samsung Semiconductor India
Dell Technologies | dell.com | big_tech mnc product gcc | Round Rock, US | in p1 | wd:https://dell.wd1.myworkdayjobs.com/External url:https://jobs.dell.com/ | Dell
Qualcomm | qualcomm.com | big_tech mnc product gcc | San Diego, US | in p1 | wd:https://qualcomm.wd5.myworkdayjobs.com/External url:https://careers.qualcomm.com/
AMD | amd.com | big_tech mnc product gcc | Santa Clara, US | in p1 | wd:https://amd.wd1.myworkdayjobs.com/External url:https://careers.amd.com/ | Advanced Micro Devices
X | x.com | mnc product | San Francisco, US | - | gh:x url:https://careers.x.com/ | Twitter
ByteDance | bytedance.com | mnc product ai | Beijing, CN | - | cu:https://jobs.bytedance.com/en/ url:https://jobs.bytedance.com/en/ | TikTok
Alibaba | alibabagroup.com | mnc product | Hangzhou, CN | - | cu:https://careers.alibaba.com/ url:https://careers.alibaba.com/
Tencent | tencent.com | mnc product | Shenzhen, CN | - | cu:https://careers.tencent.com/en-us/home.html url:https://careers.tencent.com/en-us/home.html
Sony | sony.com | mnc product gcc | Tokyo, JP | in | wd:https://sonyglobal.wd1.myworkdayjobs.com/SonyGlobalCareers url:https://www.sony.com/en/SonyInfo/Careers/
HP | hp.com | mnc product gcc | Palo Alto, US | in p1 | wd:https://hp.wd5.myworkdayjobs.com/ExternalCareerSite url:https://jobs.hp.com/ | HP Inc
Hewlett Packard Enterprise | hpe.com | mnc product gcc | Houston, US | in p1 | wd:https://hpe.wd5.myworkdayjobs.com/Jobsathpe url:https://careers.hpe.com/ | HPE
Broadcom | broadcom.com | mnc product gcc | Palo Alto, US | in p1 | wd:https://broadcom.wd1.myworkdayjobs.com/External_Career url:https://www.broadcom.com/company/careers | VMware
Spotify | spotify.com | mnc product | Stockholm, SE | - | lv:spotify url:https://www.lifeatspotify.com/jobs
Shopify | shopify.com | mnc product | Ottawa, CA | remote | ab:shopify url:https://www.shopify.com/careers
Atlassian | atlassian.com | mnc product gcc | Sydney, AU | in p1 | lv:atlassian url:https://www.atlassian.com/company/careers/all-jobs
Booking.com | booking.com | mnc product | Amsterdam, NL | - | cu:https://jobs.booking.com/booking/jobs url:https://jobs.booking.com/booking/jobs | Booking Holdings
Expedia Group | expediagroup.com | mnc product gcc | Seattle, US | in p1 | wd:https://expedia.wd5.myworkdayjobs.com/search url:https://careers.expediagroup.com/
PayPal | paypal.com | mnc product fintech gcc | San Jose, US | in p1 | wd:https://paypal.wd1.myworkdayjobs.com/jobs url:https://careers.pypl.com/
Intuit | intuit.com | mnc product fintech gcc | Mountain View, US | in p1 | wd:https://intuit.wd1.myworkdayjobs.com/Intuit url:https://jobs.intuit.com/
ServiceNow | servicenow.com | mnc product gcc | Santa Clara, US | in p1 | sr:ServiceNow url:https://careers.servicenow.com/
Workday | workday.com | mnc product gcc | Pleasanton, US | in p1 | wd:https://workday.wd5.myworkdayjobs.com/Workday url:https://www.workday.com/en-us/company/careers.html
VMware | vmware.com | mnc product gcc | Palo Alto, US | in | wd:https://vmware.wd1.myworkdayjobs.com/VMware
Electronic Arts | ea.com | mnc product gcc | Redwood City, US | in | wd:https://ea.wd1.myworkdayjobs.com/EA_Careers url:https://www.ea.com/careers | EA
Autodesk | autodesk.com | mnc product gcc | San Francisco, US | in p1 | wd:https://autodesk.wd1.myworkdayjobs.com/Ext url:https://www.autodesk.com/careers
Red Hat | redhat.com | mnc product gcc | Raleigh, US | in p1 | wd:https://redhat.wd5.myworkdayjobs.com/jobs url:https://www.redhat.com/en/jobs
Snap | snap.com | mnc product | Santa Monica, US | - | wd:https://snapchat.wd1.myworkdayjobs.com/snap url:https://careers.snap.com/ | Snapchat; Snap Inc
Pinterest | pinterest.com | mnc product | San Francisco, US | - | gh:pinterest url:https://www.pinterestcareers.com/
Reddit | reddit.com | mnc product | San Francisco, US | remote | gh:reddit url:https://www.redditinc.com/careers
Dropbox | dropbox.com | mnc product | San Francisco, US | remote | gh:dropbox url:https://jobs.dropbox.com/
Lyft | lyft.com | mnc product | San Francisco, US | - | gh:lyft url:https://www.lyft.com/careers
DoorDash | doordash.com | mnc product | San Francisco, US | - | gh:doordashusa url:https://careersatdoordash.com/
Instacart | instacart.com | mnc product | San Francisco, US | remote | gh:instacart url:https://instacart.careers/
Coinbase | coinbase.com | mnc product fintech | Remote, US | in remote | gh:coinbase url:https://www.coinbase.com/careers
Robinhood | robinhood.com | mnc product fintech | Menlo Park, US | - | gh:robinhood url:https://careers.robinhood.com/
Block | block.xyz | mnc product fintech | Oakland, US | remote | gh:block url:https://block.xyz/careers | Square; Cash App; Afterpay
Stripe | stripe.com | mnc product fintech unicorn | San Francisco, US | in remote p1 | gh:stripe url:https://stripe.com/jobs
Twilio | twilio.com | mnc product gcc | San Francisco, US | in remote | gh:twilio url:https://www.twilio.com/en-us/company/jobs
Zoom | zoom.us | mnc product | San Jose, US | in | wd:https://zoom.wd5.myworkdayjobs.com/Zoom url:https://careers.zoom.us/ | Zoom Video Communications
Palantir | palantir.com | mnc product ai | Denver, US | - | lv:palantir url:https://www.palantir.com/careers/ | Palantir Technologies
Tesla | tesla.com | mnc product | Austin, US | - | cu:https://www.tesla.com/careers/search/ url:https://www.tesla.com/careers/search/
Wayfair | wayfair.com | mnc product | Boston, US | - | gh:wayfair url:https://www.aboutwayfair.com/careers
eBay | ebay.com | mnc product gcc | San Jose, US | in p1 | wd:https://ebay.wd5.myworkdayjobs.com/apply url:https://jobs.ebayinc.com/
Yahoo | yahooinc.com | mnc product gcc | New York, US | in | wd:https://ouryahoo.wd5.myworkdayjobs.com/careers url:https://www.yahooinc.com/careers/
Rakuten | rakuten.com | mnc product gcc | Tokyo, JP | in | wd:https://rakuten.wd1.myworkdayjobs.com/RakutenAmericas url:https://global.rakuten.com/corp/careers/
Grab | grab.com | mnc product | Singapore, SG | - | wd:https://grab.wd3.myworkdayjobs.com/Careers url:https://www.grab.careers/
Sea Limited | sea.com | mnc product | Singapore, SG | - | cu:https://www.sea.com/careers url:https://www.sea.com/careers | Shopee; Garena
Agoda | agoda.com | mnc product | Singapore, SG | in | gh:agoda url:https://careersatagoda.com/
Canva | canva.com | mnc product unicorn | Sydney, AU | - | sr:Canva url:https://www.canva.com/careers/
GitHub | github.com | mnc product | San Francisco, US | in remote | cu:https://www.github.careers/careers-home url:https://www.github.careers/careers-home
Akamai | akamai.com | mnc product gcc | Cambridge, US | in | wd:https://akamai.wd1.myworkdayjobs.com/akamai_careers url:https://www.akamai.com/careers
Juniper Networks | juniper.net | mnc product gcc | Sunnyvale, US | in p1 | wd:https://juniper.wd1.myworkdayjobs.com/JuniperCareers url:https://careers.juniper.net/
Arista Networks | arista.com | mnc product gcc | Santa Clara, US | in | wd:https://arista.wd5.myworkdayjobs.com/AristaCareers url:https://www.arista.com/en/careers
NetApp | netapp.com | mnc product gcc | San Jose, US | in p1 | wd:https://netapp.wd1.myworkdayjobs.com/NetAppCareers url:https://careers.netapp.com/
Nutanix | nutanix.com | mnc product gcc | San Jose, US | in p1 | wd:https://nutanix.wd1.myworkdayjobs.com/Nutanix_Careers url:https://careers.nutanix.com/
Lenovo | lenovo.com | mnc product gcc | Beijing, CN | in | wd:https://lenovo.wd1.myworkdayjobs.com/global url:https://jobs.lenovo.com/
Siemens | siemens.com | mnc product gcc | Munich, DE | in p1 | av:https://jobs.siemens.com/careers url:https://jobs.siemens.com/careers | Siemens Healthineers
Philips | philips.com | mnc product gcc | Amsterdam, NL | in p1 | wd:https://philips.wd3.myworkdayjobs.com/jobs-and-careers url:https://www.careers.philips.com/
Bosch | bosch.com | mnc product gcc | Stuttgart, DE | in p1 | sr:BoschGroup url:https://www.bosch.in/careers/ | Robert Bosch; Bosch Global Software Technologies
`);
