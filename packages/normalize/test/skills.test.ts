import { describe, expect, it } from "vitest";
import { canonicalizeSkill, cleanSkillList, extractSkills, MAX_SKILLS, SKILL_COUNT } from "../src/index";

describe("extractSkills — boundary-safe matching", () => {
  const cases: [string, string, string[], string[]][] = [
    // [title, description, must include, must NOT include]
    ["Backend Engineer (Go)", "We use Go, Kubernetes and PostgreSQL.", ["Go", "Kubernetes", "PostgreSQL"], []],
    ["Operations Executive", "You'll go above and beyond. Ready to go live? Let's go!", [], ["Go"]],
    ["Go-To-Market Manager", "Drive our go-to-market strategy with HubSpot.", ["HubSpot"], ["Go"]],
    ["Software Engineer", "Strong in C/C++ and C#.", ["C", "C++", "C#"], []],
    ["Developer", "Experience with .NET Core and ASP.NET MVC", [".NET", "ASP.NET"], []],
    ["Full Stack Developer", "React.js, Node.js, Express.js and MongoDB", ["React", "Node.js", "Express.js", "MongoDB"], []],
    ["Frontend Engineer", "ReactJS, NextJS, TypeScript, Tailwind CSS", ["React", "Next.js", "TypeScript", "Tailwind CSS"], []],
    ["Engineer", "Golang microservices on AWS", ["Go", "Microservices", "AWS"], []],
    ["Data Analyst", "Proficiency in R and Python, SQL, Tableau and Power BI.", ["R", "Python", "SQL", "Tableau", "Power BI"], []],
    ["R&D Engineer", "Join our R&D team.", [], ["R"]],
    ["Manager", "Exposure to C-suite stakeholders; USB Type-C devices.", [], ["C"]],
    ["Analyst", "Advanced Excel, MS Excel macros, pivot tables.", ["Excel"], []],
    ["Associate", "Candidates who excel in communication will thrive.", ["Communication"], ["Excel"]],
    ["Designer", "Figma, Adobe XD, Photoshop, Illustrator and Canva.", ["Figma", "Adobe XD", "Photoshop", "Illustrator", "Canva"], []],
    ["Mechanical GET", "AutoCAD, SolidWorks, CATIA, GD&T and Six Sigma.", ["AutoCAD", "SolidWorks", "CATIA", "GD&T", "Six Sigma"], []],
    ["SAP Consultant", "SAP FICO and S/4HANA implementation.", ["SAP FICO", "SAP S/4HANA"], []],
    ["Salesforce Developer", "Apex, Lightning, SOQL on Salesforce.", ["Salesforce"], []],
    ["Cloud Engineer", "AWS, GCP and Azure; Terraform; CI/CD pipelines.", ["AWS", "GCP", "Azure", "Terraform", "CI/CD"], []],
    ["Java Developer", "Java, Spring Boot, Hibernate, REST APIs, microservices.", ["Java", "Spring Boot", "Hibernate", "REST APIs"], ["Spring"]],
    ["Spring Intern", "Spring 2026 internship in our Pune office.", [], ["Spring"]],
    ["ML Engineer", "AI/ML, PyTorch, TensorFlow, LLMs, RAG and LangChain.", ["Machine Learning", "Artificial Intelligence", "PyTorch", "TensorFlow", "LLMs", "RAG", "LangChain"], []],
    ["iOS Developer", "Swift, SwiftUI and Xcode.", ["iOS", "Swift", "SwiftUI", "Xcode"], []],
    ["Attorney - Immigration", "Enabled by data, AI and advanced technology, our teams help clients.", [], ["Artificial Intelligence"]],
    ["Consultant", "Specialists across AI Studio, Cloud Platforms Studio and Industry Studios.", [], ["Artificial Intelligence"]],
    ["AI Engineer", "Build agents.", ["Artificial Intelligence"], []],
    ["Account Executive", "We offer competitive compensation and benefits and learning and development opportunities at a $43B valuation.", [], ["Compensation and Benefits", "Learning and Development", "Valuation"]],
    ["HR Generalist", "Skills: Compensation and Benefits, Learning and Development, HRIS", ["Compensation and Benefits", "Learning and Development", "HRIS"], []],
    ["Data Scientist", "Experience in artificial intelligence and statistics.", ["Artificial Intelligence", "Statistics"], []],
    ["Associate", "Swift action is expected from the team.", [], ["Swift"]],
    ["Android Developer", "Kotlin, Jetpack Compose, Android SDK", ["Android", "Kotlin", "Jetpack Compose"], []],
    ["QA Engineer", "Selenium, Cypress, Postman, JMeter, manual testing", ["Selenium", "Cypress", "Postman", "JMeter", "Manual Testing"], []],
    ["DevOps Engineer", "Docker, K8s, Jenkins, Ansible, Linux, Git", ["Docker", "Kubernetes", "Jenkins", "Ansible", "Linux", "Git"], []],
    ["Data Engineer", "Apache Spark, PySpark, Kafka, Airflow, Snowflake, dbt", ["Spark", "PySpark", "Kafka", "Airflow", "Snowflake", "dbt"], []],
    ["HVAC Technician", "Check airflow in ducts and filters.", ["HVAC"], ["Airflow"]],
    ["Intern", "skills: react, node, mongodb, express", ["React", "Node.js", "MongoDB", "Express.js"], []],
    ["Accountant", "Tally ERP 9, GST filing, TDS, bank reconciliation", ["Tally", "GST", "TDS", "Reconciliation"], []],
    ["Associate", "Please tally the totals at day end.", [], ["Tally"]],
    ["Marketing Intern", "SEO, Google Analytics, social media marketing, content writing", ["SEO", "Google Analytics", "Social Media Marketing", "Content Writing"], []],
    ["Security Analyst", "SIEM, Splunk, penetration testing, OWASP Top 10", ["SIEM", "Splunk", "Penetration Testing", "OWASP"], []],
    ["Embedded Engineer", "Embedded C, RTOS, ARM microcontrollers, CAN protocol", ["Embedded C", "RTOS", "Microcontrollers", "CAN Bus"], []],
    ["Engineer", "We can help. Customers can call us anytime.", [], ["CAN Bus"]],
    ["Data Scientist", "Statistics, NumPy, Pandas, scikit-learn and Jupyter", ["Statistics", "NumPy", "Pandas", "scikit-learn", "Jupyter"], []],
    // Real-data regressions: bare "UI"/"UX" mentions are not the UI/UX Design skill.
    ["Partner Operations Manager", "Delivery through UI, API or a vendor route.", [], ["UI/UX Design"]],
    ["ML Ops Engineer", "A model failure is not a UX problem.", [], ["UI/UX Design"]],
    ["Frontend Developer", "Translate UI/UX design wireframes into code.", ["UI/UX Design"], []],
  ];
  it.each(cases)("%s | %s", (title, description, include, exclude) => {
    const skills = extractSkills({ title, description });
    for (const s of include) expect(skills).toContain(s);
    for (const s of exclude) expect(skills).not.toContain(s);
  });
});

describe("extractSkills — ranking", () => {
  it("ranks title skills first, then by frequency, and caps at 12", () => {
    const skills = extractSkills({
      title: "Senior Java Developer",
      description:
        "Python python Python. AWS AWS. Docker. Kubernetes. Kafka. Redis. MySQL. PostgreSQL. MongoDB. Jenkins. Terraform. Ansible. Git. Linux. Spark.",
    });
    expect(skills[0]).toBe("Java");
    expect(skills[1]).toBe("Python");
    expect(skills[2]).toBe("AWS");
    expect(skills).toHaveLength(MAX_SKILLS);
  });
  it("keeps at most 2 soft skills, and none when the job lists plenty of hard skills", () => {
    const many = extractSkills("Java, Python, SQL, AWS, Docker, Kubernetes. Communication, teamwork, leadership skills, time management.");
    expect(many).not.toContain("Communication");
    const few = extractSkills("Excel. Communication skills, teamwork, time management and negotiation.");
    expect(few.filter((s) => ["Communication", "Teamwork", "Time Management", "Negotiation"].includes(s))).toHaveLength(2);
  });
  it("ranks soft skills after hard skills", () => {
    const skills = extractSkills("Communication skills. Communication. Teamwork. SQL.");
    expect(skills.indexOf("SQL")).toBeLessThan(skills.indexOf("Communication"));
  });
});

describe("canonicalizeSkill / cleanSkillList", () => {
  it.each([
    ["ReactJS", "React"],
    ["react.js", "React"],
    ["MS-Excel", "Excel"],
    ["Golang", "Go"],
    ["Go", "Go"],
    ["node js", "Node.js"],
    ["c++", "C++"],
    ["K8s", "Kubernetes"],
    ["English Proficiency (Spoken)", "English Proficiency"],
    ["Unknown Tool XYZ", null],
  ])("%s → %s", (label, expected) => expect(canonicalizeSkill(label)).toBe(expected));

  it("cleans scraper hints: canonical, deduped, junk dropped, unknown kept tidy", () => {
    expect(cleanSkillList(["reactjs", "React", "MS-Excel", "n/a", "data structures", "some custom thing", ""])).toEqual([
      "React",
      "Excel",
      "Data Structures",
      "Some Custom Thing",
    ]);
    expect(cleanSkillList("Java, Spring Boot; SQL | AWS")).toEqual(["Java", "Spring Boot", "SQL", "AWS"]);
    expect(cleanSkillList(Array.from({ length: 30 }, (_, i) => `Tool ${i}`))).toHaveLength(12);
  });

  it("has a ~500+ skill dictionary", () => {
    expect(SKILL_COUNT).toBeGreaterThanOrEqual(500);
  });
});
