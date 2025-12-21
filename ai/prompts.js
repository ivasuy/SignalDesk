export const CLASSIFICATION_PROMPT = `Analyze this Reddit post and classify if it's a REAL OPPORTUNITY that matches the candidate's domain and experience.

CANDIDATE PROFILE:
{resume}

CRITICAL: REJECT posts that are:
- "[FOR HIRE]" or "For Hire" posts - people offering their services (NOT seeking to hire)
- "Looking for partner" or "Seeking partner" posts from NON-TECH roles (sales, marketing, business, consultants) - these are seeking developers but not as co-developers
- "Developer looking to partner" with sales/marketing/business people - REJECT these
- Showcasing/sharing completed projects ("I built...", "I made...", "Check out my...")
- Asking for feedback on existing products ("feedback on my app", "what do you think")
- General discussions or questions
- Personal project announcements
- "I've been building" posts without seeking help
- Posts offering services ("I'm available", "I offer", "My services", "Hire me", "Rate: $X/hr")
- Portfolio/showcase posts
- Posts that don't match candidate's skills/experience domain

ONLY ACCEPT posts that are:
- Actively seeking developers/freelancers/contractors (someone wants to HIRE)
- Developers/engineers looking for TECH PARTNERS/cofounders (another developer to build together) - ACCEPT these
- Non-tech people (sales, marketing, business) looking for developers - REJECT these (they want to hire, not partner)
- Offering paid work TO developers (must mention payment/budget/compensation)
- Seeking collaboration on NEW ventures (not existing products) - ONLY if from tech people
- Product ideas seeking technical cofounder/developer - ONLY if from another developer
- MUST match candidate's skills: React, Next.js, Java, Spring Boot, TypeScript, JavaScript, Node.js, full-stack, SaaS, APIs, MongoDB, etc.

CATEGORIES:
1. HIRING - Actively hiring developers (must mention payment/budget)
2. FREELANCE - Seeking freelancers for paid project work
3. COLLABORATION - Seeking technical partner/cofounder for NEW project/startup
4. IDEAS - Product idea seeking technical cofounder/developer to BUILD it

STRICT RULES:
- Must be SEEKING TO HIRE someone (developer, freelancer, partner, cofounder) OR be a developer seeking another developer partner
- MUST STRICTLY MATCH candidate's tech stack: React, Next.js, TypeScript, JavaScript, Node.js, Java, Spring Boot, MongoDB, PostgreSQL, AWS, GCP
- ACCEPT: "Developer looking for developer partner" - two devs partnering is acceptable
- REJECT if requires technologies NOT in candidate's resume (e.g., ASP.NET, C#, Python, Ruby, PHP, Go, Rust, etc.)
- REJECT if requires senior/staff level experience beyond candidate's level (Junior to Mid-level)
- REJECT: "[FOR HIRE] Web Developer..." - this is someone offering services, not seeking to hire
- REJECT: "I'm available for work" - this is offering services
- REJECT: "Sales/marketing/business person looking for developer partner" - this is hiring, not partnering
- REJECT: "Looking for partner" from non-tech roles - these want to hire developers
- REJECT: "I built X, feedback?" - this is showcasing, not seeking
- REJECT: "I made Y, check it out" - this is sharing, not opportunity
- REJECT: General questions or discussions
- REJECT: Posts requiring skills/experience not in candidate's profile

Return format: JSON only:
{
  "valid": boolean,
  "category": "job" | "freelance" | "collab" | "build" | null,
  "opportunityScore": number (0-100),
  "reasoning": "brief explanation"
}

Scoring rules:
- 0-49: reject (not a valid opportunity or poor fit)
- 50-79: valid opportunity, reply only
- 80-100: high-value opportunity, reply + resume

Score factors:
- Relevance to resume skills (0-30 points)
- Clarity of ask (0-20 points)
- Seriousness/legitimacy (0-20 points)
- Effort vs payoff (0-15 points)
- Recency (0-10 points)
- Platform quality signal (0-5 points)

Post:`;

export const HIGH_VALUE_PROMPT = `Evaluate if this opportunity is HIGH-VALUE enough to warrant generating a tailored resume and cover letter.

HIGH-VALUE CRITERIA (ALL must be true):
1. Category is HIRING, FREELANCE, or COLLABORATION
2. Mentions specific budget/payment/compensation OR serious business opportunity
3. Requires skills matching: React, Next.js, Java, Spring Boot, TypeScript, JavaScript, full-stack, backend, frontend, SaaS, APIs
4. Not a generic "looking for dev" post - has specific requirements or project scope
5. Appears legitimate and professional (not spam/scam)

Return format: "YES" or "NO" (only)

Post:`;

export const REPLY_PROMPT = `Generate a short, professional reply that the candidate would write directly to this opportunity post. Write in FIRST PERSON ("I", "my", "me") as if the candidate is replying.

CANDIDATE RESUME:
{resume}

Requirements:
- 4-6 lines maximum
- Write in FIRST PERSON (I have experience..., My background includes..., I've built...)
- No emojis
- Confident, human tone (not salesy)
- Reference specific relevant experience from resume using "I" statements
- Match the opportunity's requirements with candidate's skills
- Show genuine interest based on actual experience
- End with clear CTA to DM/connect
- DO NOT mention the candidate's name
- DO NOT write in third person

Post title: {title}
Post content: {content}
Category: {category}

Reply:`;

export const COVER_LETTER_PROMPT = `Generate a short, personal cover letter for this opportunity.

Requirements:
- Maximum 100 words
- Super short and specific
- Personal, conversational tone (not corporate)
- Address 1-2 key requirements from the post
- Mention 1 relevant experience/skill from resume
- Sound genuine and human
- No fluff or generic phrases

Post title: {title}
Post content: {content}
Category: {category}
Resume data: {resume}

Cover Letter:`;

export const RESUME_PROMPT = `Refactor the candidate's existing resume data into STRICT JSON format, tailored to highlight relevance for this opportunity. ONLY USE DATA FROM THE PROVIDED RESUME - DO NOT ADD, INVENT, OR CREATE NEW INFORMATION.

JSON Schema:
{
  "summary": "Refactor the existing profile summary to emphasize aspects matching this opportunity (use only existing summary text, reword if needed, 2-3 sentences)",
  "experience": [
    {
      "title": "Use exact role from resume",
      "company": "Use exact company name from resume",
      "period": "Use exact duration from resume",
      "description": "Refactor existing work_description to emphasize relevant aspects (use only existing information, 1-2 sentences)",
      "achievements": ["Extract 5 detailed bullet points from existing work_description that match the opportunity. Break down the work_description into specific, actionable achievements. Each bullet should be a complete sentence describing a specific task, feature, or accomplishment."]
    }
  ],
  "skills": {
    "languages": ["Select languages from resume that match the opportunity"],
    "frameworks": ["Select frameworks/libraries from resume that match the opportunity"],
    "databases": ["Select databases from resume that match the opportunity"],
    "tools": ["Select tools/cloud platforms from resume that match the opportunity"],
    "other": ["Select other relevant skills from resume that match the opportunity"]
  },
  "projects": [
    {
      "name": "Use exact project name from resume",
      "description": "Refactor existing description to emphasize relevant aspects (use only existing information, 1-2 sentences)",
      "technologies": ["Use exact technologies from resume tech_stack"],
      "achievements": ["Extract 5 detailed bullet points from existing project description that match the opportunity. Break down the description into specific features, implementations, or technical accomplishments. Each bullet should describe a specific aspect of the project."]
    }
  ],
}

CRITICAL RULES:
- Return ONLY valid JSON, no markdown, no code blocks, no explanations
- ONLY use data that exists in the provided resume - DO NOT invent or add new information
- NEVER return empty arrays - always include at least one item in each array field
- ONE PAGE REQUIREMENT: The resume MUST fit exactly one page - balance content accordingly
- experience: MUST include AT LEAST 2 most relevant experience roles (can include 3 if it fits on one page, prioritize the most relevant ones)
  - If 2 experiences: Each MUST have exactly 5 achievement bullet points
  - If 3 experiences: Each MUST have 3-4 bullet points to ensure one-page fit
  - Extract bullet points by breaking down the work_description into specific tasks, features, implementations, or accomplishments
  - Each bullet point should be a complete sentence describing a specific contribution
  - Prioritize achievements that match the job requirements (tech stack, responsibilities, domain)
  - Keep bullet points concise but informative
- projects: MUST include AT LEAST 2 most relevant projects (can include 3 if it fits on one page, prioritize the most relevant ones)
  - If 2 projects: Each MUST have exactly 5 achievement bullet points in the "achievements" array
  - If 3 projects: Each MUST have 3-4 bullet points to ensure one-page fit
  - Extract bullet points by breaking down the project description into specific features, technical implementations, or accomplishments
  - Each bullet point should describe a specific aspect: features built, technologies used, problems solved, integrations implemented
  - Prioritize projects that match the job requirements
  - Keep bullet points concise but informative
- skills: MUST organize skills into categories (languages, frameworks, databases, tools, other)
  - Include AT LEAST 3-5 items per category that match the opportunity
  - MINIMUM REQUIREMENT: Total MUST be AT LEAST 15 skills across all categories (aim for 15-25)
  - If a category has fewer relevant skills, include more from other categories to reach the 15 minimum
  - This saves space and makes the resume more organized and scannable
  - Format: {"languages": [...], "frameworks": [...], "databases": [...], "tools": [...], "other": [...]}
  - CRITICAL: Never return fewer than 15 total skills - always ensure the sum of all categories equals at least 15
- summary: MUST always be provided (use existing profile summary, reword to emphasize relevance, 2-3 sentences max)
- Use exact institution names, degrees, locations, graduation dates, and CGPA from resume
- Refactor/reword existing descriptions to emphasize relevance, but use only existing facts
- Extract multiple bullet points from longer descriptions - break down sentences into individual achievements
- Use exact names, dates, and details from resume - do not modify them
- If work_description or project description is long, extract distinct points from it
- If description is short, expand by breaking it into more granular points based on what's mentioned
- Prioritize quality and relevance over quantity - better to have fewer, highly relevant points than many generic ones

Post title: {title}
Post content: {content}
Category: {category}
Resume data: {resume}

Return ONLY the JSON object:`;

export const BUILDABLE_IDEA_PROMPT = `Evaluate if this Product Hunt startup idea can be built by ONE developer in ≤ 2 days. Match against the candidate's skills.

CANDIDATE PROFILE:
{resume}

Product Hunt Post:
- Name: {name}
- Tagline: {tagline}
- Description: {description}
- Topics: {topics}
- Votes: {votesCount}

STRICT EVALUATION CRITERIA:

REJECT if:
- Complexity is NOT "low" (must be simple wrapper, automation, extension, micro-SaaS)
- Requires infrastructure-heavy setup (marketplaces, platforms, complex backend)
- Needs deep research or domain expertise
- Requires multiple developers or team coordination
- Needs technologies NOT in candidate's resume (e.g., Python, Ruby, Go, Rust, ASP.NET, C#)
- Requires senior/staff level experience beyond candidate's level (Junior to Mid-level)

ACCEPT if:
- Can be built as a simple wrapper around existing APIs
- Is an automation tool or browser extension
- Is a micro-SaaS with minimal backend
- Uses candidate's tech stack: Next.js, React, Node.js, Java, Spring Boot, MongoDB, PostgreSQL, AWS, GCP
- Can be MVP'd in 1-2 days by one person
- Solves a clear, specific problem

Return ONLY valid JSON:
{
  "buildable_in_2_days": boolean,
  "complexity": "low" | "medium" | "high",
  "why": "Brief explanation of why it's buildable or not",
  "suggested_mvp_scope": "What can be built in 2 days (1-2 sentences)",
  "recommended_tech_stack": ["List of technologies from candidate's resume"],
  "go_to_market_strategy": ["Strategy 1", "Strategy 2", "Strategy 3"],
  "confidence_score": number (0-100)
}`;

export const COLLAB_OPPORTUNITY_PROMPT = `Evaluate if this Product Hunt startup represents a collaboration/hiring opportunity where the candidate would be a good technical fit.

CANDIDATE PROFILE:
{resume}

Product Hunt Post:
- Name: {name}
- Tagline: {tagline}
- Description: {description}
- Topics: {topics}
- Votes: {votesCount}

EVALUATION CRITERIA:

This is a startup that:
- Has complexity > low (medium or high)
- Cannot be built solo in 2 days
- May need technical cofounder, freelance developer, or early hire
- Founders are validating but need technical help

Evaluate if candidate is a fit based on:
- Tech stack alignment (Next.js, React, Node.js, Java, Spring Boot, MongoDB, PostgreSQL)
- Experience level match (Junior to Mid-level)
- Domain relevance (SaaS, APIs, full-stack, AI integrations)
- Skills match (not requiring Python, Ruby, Go, Rust, ASP.NET, C#, etc.)

Return ONLY valid JSON:
{
  "collaboration_fit": boolean,
  "collaboration_type": "cofounder" | "freelance" | "early hire" | "technical partner",
  "why_you_are_a_fit": "1-2 sentences explaining why candidate is a good fit",
  "suggested_outreach": "Brief suggestion on how to reach out",
  "confidence_score": number (0-100)
}`;

