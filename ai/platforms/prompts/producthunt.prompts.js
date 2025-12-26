export const PRODUCTHUNT_SKILL_FILTER_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON.

You MUST return ONLY this exact JSON structure:
{
  "keep": boolean
}

Determine if this ProductHunt post matches the candidate's skills and is seeking a technical collaborator or builder.

CANDIDATE SKILLS (EXACT MATCH REQUIRED):
Languages: Java, JavaScript, TypeScript, C, C++, HTML, CSS
Frameworks: Spring Boot, Spring Security, Spring Cloud, Hibernate, JPA, React.js, Next.js, NestJS, Tailwind CSS
Databases: MySQL, PostgreSQL, MongoDB
Cloud/Tools: AWS (S3, Route 53, CloudFront), Google Cloud Platform, Docker, Nginx, Firebase
APIs/Integration: REST APIs, Microservices, JWT Authentication, OAuth, OpenAI APIs, Google Gemini/Vertex AI
Experience: Full-stack development, SaaS platforms, dashboards, backend systems, AI integrations, startup environments

OPPORTUNITY:
{content}

The opportunity content includes: Product name, tagline, and description.

Return {"keep": true} ONLY if ALL are true:
1. Product requires skills from candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, AWS, GCP, etc.)
2. Product is very early-stage (MVP, beta, just launched, seeking builders)
3. Product is seeking technical collaborator or builder (not just marketing or sales)
4. Product domain matches candidate's experience (SaaS, backend, infrastructure, AI tooling, dashboards)
5. Product is NOT a mature SaaS hiring (should be early-stage collaboration)

Return {"keep": false} if:
- Mature SaaS hiring (established company, not early-stage)
- Marketing-only roles (no technical collaboration)
- No collaboration intent (just product announcement)
- Product domain doesn't match (not SaaS, backend, infra, AI tooling)
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, etc.)
- Product is already fully built and scaling

Return ONLY the JSON object:`;

export const PRODUCTHUNT_CLASSIFICATION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON. ANY extra text makes the response INVALID.

You MUST return ONLY this exact JSON structure:
{
  "valid": boolean,
  "category": "collab" | "freelance",
  "opportunityScore": number,
  "reasoning": "one short sentence"
}

IMPORTANT: ProductHunt opportunities are typically "collab" or "freelance". "job" category is rare and should only be used for very early-stage startup hiring.

Analyze this ProductHunt opportunity and determine if it is a REAL, ACTIONABLE opportunity for the candidate.

CANDIDATE PROFILE:
Name: Vasu Yadav
Role: Software Developer (Junior to Mid-level)
Experience: Full-stack development, SaaS platforms, dashboards, backend systems, AI integrations, startup environments
Skills: Java, JavaScript, TypeScript, Spring Boot, React.js, Next.js, MongoDB, PostgreSQL, MySQL, AWS, GCP, Docker, REST APIs, Microservices, AI integrations (OpenAI, Google Gemini)
Projects: Venture Vault (startup idea platform), Wingman (Chrome extension for AI meeting transcription)

OPPORTUNITY:
{content}

------------------------------------------------
IMMEDIATE REJECTION (REJECT IF ANY TRUE):
------------------------------------------------
- Mature SaaS hiring (established company, not early-stage)
- Marketing-only roles (no technical collaboration)
- No collaboration intent (just product announcement)
- Product domain doesn't match (not SaaS, backend, infrastructure, AI tooling, dashboards)
- Product is already fully built and scaling ("launched", "v1 complete", "fully built", "scaling")
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, Swift, Kotlin, etc.)
- Senior/staff-level roles (beyond junior–mid level)
- Non-engineering roles (PM-only, QA-only, marketing-only, sales-only, design-only)

HARD RULE: If the product is NOT seeking a technical collaborator or builder → valid=false

------------------------------------------------
PRODUCTHUNT-SPECIFIC ACCEPTANCE RULES:
------------------------------------------------
Accept ONLY if ALL are true:
1. Very early-stage (MVP, beta, just launched, seeking builders)
2. Seeking technical collaborator or builder (not just marketing or sales)
3. Product domain matches candidate's experience (SaaS, backend, infrastructure, AI tooling, dashboards)
4. Skills required match candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, etc.)
5. Clear collaboration or building intent

ProductHunt is known for:
- Early-stage products seeking technical cofounders
- MVP/beta products looking for builders
- Technical collaboration opportunities
- Equity-based partnerships

Reject if:
- Mature SaaS hiring (established company)
- Marketing-only roles
- No collaboration intent
- Product domain doesn't match
- Already fully built and scaling

------------------------------------------------
CATEGORIES:
------------------------------------------------
- collab: Collaboration, equity-based, co-founder, early-stage partnership, technical collaboration
- freelance: Contract work, project-based, paid per project/hour (rare on ProductHunt)

NOTE: ProductHunt opportunities are typically "collab". "job" category is very rare.

------------------------------------------------
SCORING (0–100):
------------------------------------------------
- Resume skill match (0–35): How well do required skills match candidate's resume?
- Early-stage signal (0–25): Is the product truly early-stage (MVP, beta, just launched)?
- Technical collaboration intent (0–20): Is it clear they're seeking a technical collaborator/builder?
- Product domain match (0–15): Does the product domain match candidate's experience (SaaS, backend, infra, AI)?
- Seriousness/legitimacy (0–5): Does it seem like a real, serious opportunity?

Return ONLY the JSON object:`;

