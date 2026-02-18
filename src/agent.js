const { ChatOpenAI } = require("@langchain/openai");
const { StructuredOutputParser } = require("langchain/output_parsers");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const fs = require("node:fs");
const path = require("node:path");

const defaultFaqCatalog = [
  {
    keywords: ["vacation", "pto", "paid time off", "leave"],
    answer:
      "Our PTO policy allows eligible employees to request time off via the HR portal. Submit the request at least 10 business days in advance for manager approval."
  },
  {
    keywords: ["benefits", "health insurance", "medical", "dental", "vision"],
    answer:
      "Benefits enrollment is available within 30 days of your start date. You can review plan options in the HR portal under Benefits."
  },
  {
    keywords: ["payroll", "paycheck", "salary", "direct deposit"],
    answer:
      "Payroll runs bi-weekly on Fridays. Direct deposit updates can be submitted in the HR portal under Payroll Settings."
  },
  {
    keywords: ["onboarding", "new hire", "orientation"],
    answer:
      "New hire onboarding includes document completion, policy review, and system access setup. Expect your onboarding packet via email within 24 hours."
  }
];

const defaultFaqPath = path.join(__dirname, "..", "data", "hr_faq.nl.json");

const normalizeKeywords = (question = "") => {
  return question
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 3)
    .slice(0, 8);
};

const loadFaqCatalog = () => {
  const faqPath = process.env.FAQ_PATH || defaultFaqPath;
  if (!fs.existsSync(faqPath)) {
    return defaultFaqCatalog;
  }

  try {
    const raw = fs.readFileSync(faqPath, "utf-8");
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) {
      return defaultFaqCatalog;
    }

    return items.map((item) => {
      const answer = item.answer || item.body || "";
      const question = item.question || item.title || "";
      const keywords = item.keywords && item.keywords.length
        ? item.keywords.map((keyword) => keyword.toLowerCase())
        : normalizeKeywords(question);
      return {
        keywords,
        answer,
        question,
        sourceUrl: item.sourceUrl
      };
    }).filter((item) => item.answer);
  } catch (error) {
    return defaultFaqCatalog;
  }
};

const faqCatalog = loadFaqCatalog();

const schema = z.object({
  action: z.enum(["answer_faq", "create_salesforce_task", "no_action"]),
  reply: z.string().optional().default(""),
  task: z
    .object({
      subject: z.string().optional(),
      description: z.string().optional(),
      dueDate: z.string().optional(),
      priority: z.enum(["High", "Normal", "Low"]).optional(),
      whoId: z.string().optional()
    })
    .nullable()
    .optional()
    .transform(val => val ?? {})
});

const parser = StructuredOutputParser.fromZodSchema(schema);

const faqText = faqCatalog
  .map((item, index) => {
    const question = item.question ? `Q: ${item.question}` : `Keywords: ${item.keywords.join(", ")}`;
    return `${index + 1}. ${question}\nA: ${item.answer}`;
  })
  .join("\n");

const SYSTEM_PROMPT = (faq, formatInstructions) =>
`Je bent een vriendelijke HR-assistent voor WhatsApp-gesprekken van Staffable.
Je communiceert altijd formeel (u/uw) in het Nederlands, tenzij de vraag in het Engels is gesteld — dan antwoord je in het Engels.

Je hebt toegang tot de gespreksgeschiedenis van deze medewerker. Gebruik die context om doorverwijzingen ("dat", "het", "eerder") te begrijpen en persoonlijke vervolgvragen te beantwoorden.

═══════════════════════════════════════
STAP 1 — BEPAAL OF DE VRAAG HR-GERELATEERD IS
═══════════════════════════════════════
HR-gerelateerde onderwerpen zijn (niet limitatief):
• Salaris, loon, betaaldatum, loonstrook, jaaropgaaf, vakantiegeld
• Verlof, vakantiedagen, ziekmelding, hersteldmelding
• Contract, arbeidsovereenkomst, onboarding, uitschrijven
• Loonheffing, loonheffingskorting, reiskosten, IBAN, adreswijziging
• Werktijden, uren doorgeven, opdrachtgever, inschrijving
• Algemene werkgeversvragen, arbeidsrecht, ziekteverlof, zwangerschapsverlof,
  pensioen, verzuim, cao, proeftijd, ontslag, functiewijziging, promotie,
  gedragscode, privacy op het werk, diversiteit, opleidingen, vergoedingen

Als de vraag NIET over HR gaat (bijv. kooktips, sport, technologie, finance, nieuws):
→ Stel action in op "no_action"
→ Geef een vriendelijke melding dat dit kanaal alleen voor HR-vragen is

═══════════════════════════════════════
STAP 2 — BEANTWOORD DE VRAAG
═══════════════════════════════════════
Prioriteit:
1. Als het antwoord letterlijk in de FAQ-lijst hieronder staat → gebruik dat antwoord exact
2. Als de vraag HR-gerelateerd is maar NIET in de FAQ staat → beantwoord op basis van
   jouw algemene HR-kennis en Nederlandse arbeidsrecht. Geef een helder, praktisch antwoord.
3. Als de vraag vraagt om een actie (adres wijzigen, IBAN wijzigen, uitschrijven,
   iemand onboarden, taak aanmaken, afspraak inplannen) → gebruik "create_salesforce_task"

FAQ-lijst (altijd als eerste bron raadplegen):
${faq}

═══════════════════════════════════════
STAP 3 — ACTIES
═══════════════════════════════════════
• "answer_faq"             → vraag beantwoord (uit FAQ of algemene HR-kennis)
• "create_salesforce_task" → actie/taak vereist bij HR
• "no_action"              → vraag niet HR-gerelateerd; vriendelijk afwijzen

Bij "create_salesforce_task" vul je ook het task-object in (subject, description, priority, dueDate als opgegeven).

${formatInstructions}`;

const fallbackKeywordIntent = (message) => {
  const normalized = message.toLowerCase();
  const faqMatch = faqCatalog.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword))
  );

  if (faqMatch) {
    return {
      action: "answer_faq",
      reply: faqMatch.answer,
      task: {}
    };
  }

  const taskKeywords = [
    "follow up", "follow-up", "schedule", "call", "meeting", "task",
    "wijzig", "aanpassen", "uitschrijven", "onboarding", "iban", "adres",
    "aanmaken", "verzoek"
  ];
  if (taskKeywords.some((keyword) => normalized.includes(keyword))) {
    return {
      action: "create_salesforce_task",
      reply: "Ik zet een taak klaar bij HR om dit op te pakken.",
      task: {
        subject: "HR follow-up verzoek",
        description: message,
        priority: "Normal"
      }
    };
  }

  // Simple off-topic detection for fallback mode
  const nonHrKeywords = [
    "recept", "koken", "sport", "voetbal", "nieuws", "weer", "politiek",
    "vakantie boeken", "reizen", "restaurant", "film", "muziek", "crypto",
    "bitcoin", "coding", "programmeren"
  ];
  if (nonHrKeywords.some((keyword) => normalized.includes(keyword))) {
    return {
      action: "no_action",
      reply: "Dit kanaal is uitsluitend bedoeld voor HR-gerelateerde vragen. Heeft u een vraag over uw salaris, verlof, contract of een ander HR-onderwerp?",
      task: {}
    };
  }

  return {
    action: "answer_faq",
    reply: "Ik heb uw vraag ontvangen. Een HR-medewerker neemt zo nodig contact met u op.",
    task: {}
  };
};

/**
 * Run the HR agent.
 * @param {string} message - the current user message
 * @param {object} metadata - extra context (from phone number, etc.)
 * @param {{ role: 'user'|'assistant', content: string }[]} [history=[]]
 *   Previous messages for this phone number, oldest first.
 *   Pass the result of db.getHistory(phone) here.
 */
async function runAgent(message, metadata = {}, history = []) {
  if (!message || !message.trim()) {
    return {
      action: "no_action",
      reply: "Stel gerust uw HR-vraag, ik help u graag.",
      task: {}
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return fallbackKeywordIntent(message);
  }

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2
  });

  // Build the messages array:
  //   [SystemMessage, ...history as Human/AI turns, HumanMessage (current)]
  const messages = [
    new SystemMessage(SYSTEM_PROMPT(faqText, parser.getFormatInstructions()))
  ];

  // Inject previous turns so the LLM has full context
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push(new HumanMessage(turn.content));
    } else {
      messages.push(new AIMessage(turn.content));
    }
  }

  // Add the current message
  messages.push(new HumanMessage(message));

  const response = await llm.invoke(messages);
  let result;

  try {
    result = await parser.parse(response.content);
  } catch (_parseErr) {
    // LLM replied in plain text instead of JSON (common when history is present).
    // Re-ask with an explicit JSON-only instruction.
    const retryMessages = [
      ...messages,
      new AIMessage(response.content),
      new HumanMessage(
        `Geef nu uw antwoord opnieuw, maar uitsluitend als geldig JSON-object dat voldoet aan dit schema:\n${parser.getFormatInstructions()}\n\nGeef alleen het JSON-object terug, geen extra uitleg.`
      )
    ];
    const retryResponse = await llm.invoke(retryMessages);
    result = await parser.parse(retryResponse.content);
  }

  // Ensure task is always an object, never null
  return {
    ...result,
    task: result.task || {}
  };
}

module.exports = {
  runAgent,
  fallbackKeywordIntent,
  faqCatalog
};
