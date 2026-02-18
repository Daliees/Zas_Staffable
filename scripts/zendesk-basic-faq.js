const { config } = require("dotenv");
const fs = require("node:fs/promises");
const path = require("node:path");
const OpenAI = require("openai");

config();

const subdomain = process.env.ZENDESK_SUBDOMAIN;
const email = process.env.ZENDESK_EMAIL;
const apiToken = process.env.ZENDESK_API_TOKEN;
const locale = process.env.ZENDESK_LOCALE || "en-us";

const outputDir = path.join(__dirname, "..", "data");
const sourceOutput = path.join(outputDir, "hr_faq.source.json");
const nlOutput = path.join(outputDir, "hr_faq.nl.json");
const enOutput = path.join(outputDir, "hr_faq.en.json");

const basicKeywords = [
  "hr",
  "backoffice",
  "back office",
  "payroll",
  "salary",
  "compensation",
  "benefits",
  "insurance",
  "leave",
  "vacation",
  "pto",
  "onboarding",
  "offboarding",
  "termination",
  "contract",
  "policy",
  "expense",
  "reimbursement",
  "timesheet",
  "absence",
  "sick",
  "holiday",
  "travel",
  "work from home",
  "remote",
  "equipment",
  "it access",
  "permissions"
];

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesBasicTopic(article) {
  const haystack = `${article.title} ${article.body} ${(article.label_names || []).join(" ")}`.toLowerCase();
  return basicKeywords.some((keyword) => haystack.includes(keyword));
}

function toFaqItem(article) {
  return {
    id: article.id,
    question: article.title,
    answer: stripHtml(article.body || ""),
    keywords: (article.label_names || []).map((label) => label.toLowerCase()),
    sourceUrl: article.html_url
  };
}

async function fetchZendeskArticles() {
  if (!subdomain || !email || !apiToken) {
    throw new Error("Missing Zendesk credentials: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN");
  }

  const auth = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
  let url = `https://${subdomain}.zendesk.com/api/v2/help_center/${locale}/articles.json?per_page=100`;
  const articles = [];

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zendesk error (${response.status}): ${text}`);
    }

    const payload = await response.json();
    articles.push(...(payload.articles || []));
    url = payload.next_page;
  }

  return articles;
}

async function translateItems(items) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY missing; skipping translation and writing English as Dutch.");
    return items.map((item) => ({ ...item, language: "en" }));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const translated = [];

  for (const item of items) {
    const prompt = `Translate the following HR FAQ content into Dutch. Use formal Dutch (u/uw). Keep the meaning intact.\n\nQuestion: ${item.question}\nAnswer: ${item.answer}`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a professional HR translator writing in Dutch." },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content || "";
    const [questionLine, ...answerLines] = content.split("\n");
    const question = questionLine.replace(/^Question:\s*/i, "").trim() || item.question;
    const answer = answerLines.join("\n").replace(/^Answer:\s*/i, "").trim() || item.answer;

    translated.push({
      ...item,
      question,
      answer,
      language: "nl"
    });
  }

  return translated;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  console.log("Fetching Zendesk articles...");
  const articles = await fetchZendeskArticles();

  const basicArticles = articles.filter(includesBasicTopic);
  const faqItems = basicArticles.map(toFaqItem).filter((item) => item.answer);

  await fs.writeFile(sourceOutput, JSON.stringify(faqItems, null, 2));
  await fs.writeFile(enOutput, JSON.stringify(faqItems, null, 2));

  const nlItems = await translateItems(faqItems);
  await fs.writeFile(nlOutput, JSON.stringify(nlItems, null, 2));

  console.log(`Saved ${faqItems.length} FAQ items.`);
  console.log(`Source output: ${sourceOutput}`);
  console.log(`Dutch output: ${nlOutput}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
