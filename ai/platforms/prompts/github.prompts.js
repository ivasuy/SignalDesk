export const GITHUB_SKILL_FILTER_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON.

You MUST return ONLY this exact JSON structure:
{
  "keep": boolean
}

Determine if this GitHub issue requires coding/implementation work matching the candidate's skills.

CANDIDATE SKILLS (EXACT MATCH REQUIRED):
Languages: Java, JavaScript, TypeScript, C, C++, HTML, CSS
Frameworks: Spring Boot, Spring Security, Spring Cloud, Hibernate, JPA, React.js, Next.js, NestJS, Tailwind CSS
Databases: MySQL, PostgreSQL, MongoDB
Cloud/Tools: AWS (S3, Route 53, CloudFront), Google Cloud Platform, Docker, Nginx, Firebase
APIs/Integration: REST APIs, Microservices, JWT Authentication, OAuth, OpenAI APIs, Google Gemini/Vertex AI
Experience: Backend systems, API development, full-stack development, AI integrations

OPPORTUNITY:
Title: {title}
Content: {content}

Return {"keep": true} ONLY if ALL are true:
1. Issue requires coding, architecture, or implementation work (not docs, typo, config, formatting)
2. Issue mentions backend, frontend, API, system, infrastructure, scraper, or integration work
3. Issue requires skills from candidate's resume (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, etc.)
4. Issue is NOT documentation-only, typo-only, config-only, or formatting-only
5. Issue has clear technical scope (what needs to be implemented)

Return {"keep": false} if:
- Documentation-only ("update docs", "add documentation", "improve README")
- Typo/spelling fixes ("fix typo", "correct spelling")
- Config-only ("update config", "change settings")
- Formatting-only ("format code", "fix indentation", "style changes")
- Review-only ("code review", "review PR")
- Maintenance-only ("cleanup", "refactor without new features")
- Governance-only ("update license", "policy changes")
- Compliance-only ("add compliance", "legal updates")
- Non-coding tasks
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, etc.)

Return ONLY the JSON object:`;

export const GITHUB_CLASSIFICATION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON. ANY extra text makes the response INVALID.

You MUST return ONLY this exact JSON structure:
{
  "valid": boolean,
  "category": "freelance" | "collab",
  "opportunityScore": number,
  "reasoning": "one short sentence"
}

IMPORTANT: GitHub issues can NEVER be category="job". Only "freelance" or "collab" are allowed.

Analyze this GitHub issue and determine if it is a REAL, ACTIONABLE coding opportunity for the candidate.

CANDIDATE PROFILE:
Name: Vasu Yadav
Role: Software Developer (Junior to Mid-level)
Skills: Java, JavaScript, TypeScript, Spring Boot, React.js, Next.js, MongoDB, PostgreSQL, MySQL, AWS, GCP, Docker, REST APIs, Microservices, AI integrations
Experience: Backend systems, API development, full-stack development, SaaS platforms

REPOSITORY:
{context}

OPPORTUNITY:
Title: {title}
Content: {content}

------------------------------------------------
IMMEDIATE REJECTION (REJECT IF ANY TRUE):
------------------------------------------------
- Documentation-only ("update docs", "add documentation", "improve README")
- Typo/spelling fixes ("fix typo", "correct spelling", "typo in comment")
- Config-only ("update config", "change settings", "update .env")
- Formatting-only ("format code", "fix indentation", "style changes")
- Review-only ("code review", "review PR", "review changes")
- Maintenance-only ("cleanup", "refactor without new features", "remove unused code")
- Governance-only ("update license", "policy changes", "add governance")
- Compliance-only ("add compliance", "legal updates", "GDPR compliance")
- Non-coding tasks
- Requires skills NOT in resume (Python, PHP, Ruby, Go, Rust, .NET, Swift, Kotlin, etc.)
- Senior/staff-level complexity (beyond junior–mid level)
- No clear implementation scope

HARD RULES:
- If GitHub AND not coding-heavy → valid=false
- GitHub can NEVER be category="job" → category MUST be "freelance" or "collab" only
- GitHub is for technical issue identification, NOT job postings

------------------------------------------------
GITHUB-SPECIFIC ACCEPTANCE RULES:
------------------------------------------------
Accept ONLY if ALL are true:
1. Issue requires coding, architecture, or implementation work
2. Issue mentions backend, frontend, API, system, infrastructure, scraper, or integration work
3. Strong overlap with candidate's resume skills (Java, JavaScript, TypeScript, Spring Boot, React, Next.js, MongoDB, etc.)
4. Clear technical scope (what needs to be implemented)
5. Real implementation work (not docs, typo, config, formatting)

Reject if:
- Docs-only, typo-only, config-only, formatting-only
- Review-only, maintenance-only, governance-only, compliance-only
- Non-coding tasks
- Skills not in candidate's resume

------------------------------------------------
CATEGORIES (GITHUB ONLY):
------------------------------------------------
- freelance: Paid implementation work, bounty, sponsored issue
- collab: Open source contribution, collaboration, community project

NOTE: GitHub issues can NEVER be "job" category.

------------------------------------------------
SCORING (0–100):
------------------------------------------------
- Resume skill match (0–35): How well do required skills match candidate's resume?
- Implementation scope clarity (0–25): Is it clear what needs to be coded/implemented?
- Technical complexity match (0–20): Appropriate for junior–mid level?
- Seriousness/legitimacy (0–15): Does it seem like a real, actionable issue?
- Effort vs payoff (0–5): Reasonable scope for the opportunity?

Return ONLY the JSON object:`;

export const GITHUB_CAP_SELECTION_PROMPT = `CRITICAL: RETURN JSON ONLY. NO explanations. NO markdown. NO text before/after JSON.

You MUST return ONLY this exact JSON structure:
{
  "selectedPostIds": ["id1", "id2", ...]
}

Select the BEST 5 issues from the list below for GitHub.

CANDIDATE PROFILE:
Junior to Mid-level Software Developer
Skills: Java, JavaScript, TypeScript, Spring Boot, React.js, Next.js, MongoDB, PostgreSQL, AWS, GCP
Experience: Backend systems, API development, full-stack development

SELECTION PRIORITY (in order):
1. Real coding/implementation work (backend, frontend, API, system, infrastructure)
2. Strong skill match with candidate's resume
3. Clear technical scope (what needs to be implemented)
4. Appropriate complexity for junior–mid level
5. Active, legitimate issues (not stale or abandoned)

REJECT IMMEDIATELY:
- Documentation-only, typo-only, config-only, formatting-only
- Review-only, maintenance-only, governance-only, compliance-only
- Non-coding tasks
- Skills not in candidate's resume
- Senior/staff-level complexity

CANDIDATE RESUME:
{resume}

POSTS:
{posts}

Return ONLY the JSON object with selectedPostIds array (max 5):`;

