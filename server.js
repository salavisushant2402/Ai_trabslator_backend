import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { franc } from "franc";
import langs from "langs";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SUPPORTED_LANGUAGES = {
  "Chinese (Simplified)": {
    nativeName: "简体中文",
    script: "Simplified Chinese (简体字)",
    notes: "Use 普通话 standard. Never mix Traditional characters.",
  },
  "Chinese (Traditional)": {
    nativeName: "繁體中文",
    script: "Traditional Chinese (繁體字)",
    notes: "Use Taiwan/HK standard. Never mix Simplified characters.",
  },
  Czech: {
    nativeName: "Čeština",
    script: "Latin + diacritics (á,č,ě,š,ž)",
    notes: "Preserve grammatical cases. Formal 'vy' unless clearly informal.",
  },
  English: {
    nativeName: "English",
    script: "Latin",
    notes: "Natural modern English. Match British/American spelling from source.",
  },
  French: {
    nativeName: "Français",
    script: "Latin + accents (é,è,ê,à,ç)",
    notes: "'vous' formal / 'tu' informal. Always include accents.",
  },
  German: {
    nativeName: "Deutsch",
    script: "Latin + umlauts (ä,ö,ü,ß)",
    notes: "Capitalize all nouns. Correct gender articles (der/die/das).",
  },
  Italian: {
    nativeName: "Italiano",
    script: "Latin + accents (à,è,ì,ò,ù)",
    notes: "Match formal (Lei) or informal (tu) from source.",
  },
  Japanese: {
    nativeName: "日本語",
    script: "Hiragana + Katakana + Kanji",
    notes: "Polite です/ます for formal; plain form for casual. Loanwords in Katakana.",
  },
  Korean: {
    nativeName: "한국어",
    script: "Hangul (한글)",
    notes: "합쇼체 for professional; 해요체 general. Loanwords phonetically in Hangul.",
  },
  Polish: {
    nativeName: "Polski",
    script: "Latin + diacritics (ą,ć,ę,ł,ń,ó,ś,ź,ż)",
    notes: "Preserve grammatical gender and cases. Never drop diacritics.",
  },
  "Portuguese (Brazilian)": {
    nativeName: "Português (Brasil)",
    script: "Latin + accents (á,â,ã,é,ê,í,ó,ô,õ,ú,ç)",
    notes: "Brazilian vocab/spelling only. 'você' over 'tu'.",
  },
  Russian: {
    nativeName: "Русский",
    script: "Cyrillic (Кириллица)",
    notes: "Always Cyrillic, never romanized. Preserve grammatical cases and verbal aspect.",
  },
  Spanish: {
    nativeName: "Español",
    script: "Latin + accents (á,é,í,ó,ú,ñ,¿,¡)",
    notes: "Neutral Latin American Spanish. Include ¿ ¡. 'usted' for formal.",
  },
  Ukrainian: {
    nativeName: "Українська",
    script: "Ukrainian Cyrillic (і,ї,є,ґ)",
    notes: "Ukrainian Cyrillic only — never substitute Russian letters (і not и, ї not й).",
  },
  Hindi: {
    nativeName: "हिन्दी",
    script: "Devanagari (देवनागरी)",
    notes: "Always Devanagari, never romanized. Correct gender agreement. 'आप' formal / 'तुम/तू' casual.",
  },
  Marathi: {
    nativeName: "मराठी",
    script: "Devanagari (देवनागरी)",
    notes: "Always Devanagari, never romanized. Correct verb tense — 'आहे'(present) vs 'येईन'(future). 'आपण' formal / 'तू/तुम्ही' casual. Never substitute Hindi words.",
  },
};

const getSupportedLanguageList = () => Object.keys(SUPPORTED_LANGUAGES).join(", ");

// GET /languages
app.get("/languages", (req, res) => {
  const languages = Object.entries(SUPPORTED_LANGUAGES).map(([key, val]) => ({
    code: key,
    nativeName: val.nativeName,
  }));
  res.json({ languages });
});


// POST /detect-language
app.post("/detect-language", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Detect language using franc
    const iso3Code = franc(text, { minLength: 3 });

    if (iso3Code === "und") {
      return res.json({
        language: "Unknown",
        supported: false,
        nativeName: null,
      });
    }

    // Convert ISO 639-3 to full language name
    const languageData = langs.where("3", iso3Code);

    if (!languageData) {
      return res.json({
        language: "Unknown",
        supported: false,
        nativeName: null,
      });
    }

    const detectedLanguage = languageData.name;

    const isSupported = Object.prototype.hasOwnProperty.call(
      SUPPORTED_LANGUAGES,
      detectedLanguage
    );

    res.json({
      language: detectedLanguage,
      supported: isSupported,
      nativeName: isSupported
        ? SUPPORTED_LANGUAGES[detectedLanguage].nativeName
        : null,
    });
  } catch (error) {
    console.error("Language detection error:", error);
    res.status(500).json({ error: "Language detection failed" });
  }
});


// POST /translate - Teamcenter & Technical Software Optimized
app.post("/translate", async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;
    
    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      return res.status(400).json({
        error: `Unsupported target language: "${targetLanguage}".`,
        supported: getSupportedLanguageList(),
      });
    }
    
    const { nativeName, script, notes } = SUPPORTED_LANGUAGES[targetLanguage];

    // NEW Teamcenter-optimized prompt
    const systemPrompt = `You are a professional, high-accuracy software localization and technical documentation translator.
      PRIMARY GOAL
      - Translate the source text to the target language with at least 90% semantic accuracy.
      - Preserve the exact meaning, intent, and logical conditions of the original text.
      - Prefer correctness of meaning over literal, word-by-word translation.
      - Your primary domain is enterprise software (e.g., PLM systems such as Siemens Teamcenter) and other technical applications.

      TARGET LANGUAGE PROFILE
      - Target language: ${targetLanguage} (${nativeName})
      - Script: ${script}
      - Language-specific rules and conventions: ${notes}

      TYPE OF CONTENT YOU TRANSLATE
      - UI text: button labels, menu items, tooltips, dialog titles, form field labels.
      - System and error messages: validations, warnings, logs, status updates.
      - Technical documentation: configuration guides, admin/user manuals, release notes.
      - Workflow / data model terminology for PLM and similar systems: items, revisions, workflows, change objects, BOMs, CAD data, permissions, roles, lifecycle states.

      STRICT OUTPUT RULES
      - Output ONLY the translated text. 
      - Do NOT add any labels like "Translation:", no quotes, no explanation, no alternatives.
      - Do NOT add commentary, back-translation, notes, or examples unless explicitly requested.
      - If the input is already fully in the target language, return it unchanged.
      - Preserve all structure and formatting:
        - Paragraphs and line breaks
        - Bullet and numbered lists
        - Markdown / HTML structure (headings, lists, links, emphasis)
        - Code blocks and inline code

      TERMINOLOGY AND NAMES (CRITICAL)
      - NEVER translate or change:
        - Product and platform names: Teamcenter, Active Workspace, NX, Solid Edge, CATIA, AutoCAD, Windows, Linux.
        - Company and brand names.
        - Protocol / technology names: HTTP, HTTPS, REST, SOAP, JSON, XML, SQL, PLMXML, OAuth.
        - Programming languages, frameworks, and APIs: JavaScript, TypeScript, Java, C#, C++, React, Node.js, .NET, GraphQL, API, SDK.
      - For domain-specific PLM / enterprise terms:
        - Keep standard English terms as-is if they are typically kept in English in that language's UI
        - Examples: Item, Item Revision, Change Notice, Change Request, Workflow, Release Status, Lifecycle, BOM, Dataset, Workspace, Project.
      - Never invent new terminology that changes the domain meaning.

      VARIABLES, PLACEHOLDERS, AND SPECIAL TOKENS
      - NEVER translate, remove, or change:
        - Placeholders and variables: {0}, {1}, {name}, {itemId}, {{value}} %s, %d, %1, %2.
        - Format specifiers and tokens used by the application.
        - IDs, keys, and internal codes (e.g., TC_ITEM, STATUS_RELEASED, ERROR_404).
      - Keep their position in the sentence logically correct in the target language.

      CODE, MARKUP, AND SPECIAL SEGMENTS
      - Do NOT translate:
        - Code inside \`inline code\` or fenced code blocks.
        - HTML tags and attributes (e.g., <div>, <span class="...">, href="...").
        - XML/JSON keys and structural tokens (e.g., "objectType", "propertyName", { }, [ ]).

      MEANING, LOGIC, AND CONDITIONS
      - Preserve all logical conditions exactly:
        - Negations: "not", "never", "no", "must not", "cannot".
        - Conditionals: "if", "else", "unless", "only if", "at least", "at most".
        - Comparisons: greater than, less than, equal to, before/after, first/last.
      - Do NOT invert or weaken/strengthen conditions.
      - Keep numerical values, units, percentages, version numbers, and limits exactly as in the source.

      TONE AND REGISTER
      - Default tone: clear, concise, professional business / technical tone.
      - For UI texts: Use concise, action-oriented phrasing for buttons and commands.
      - Use neutral, polite tone for messages and instructions.

      QUALITY CHECK BEFORE OUTPUT
      Before you respond, silently verify:
      - Every meaningful part of the source text is present in the translation.
      - All placeholders, variables, codes, and tokens are present and unchanged.
      - All numbers, limits, dates, versions, object names, and status names are correct.
      - No logical negation or condition was accidentally changed.
      - The result reads like it was written by a native professional user of ${targetLanguage} (${nativeName}), in correct ${script}, following enterprise software UI conventions.`;

    const userPrompt = `Translate this technical software text into ${targetLanguage} (${nativeName}).\n\n${text}`;

    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.0, // Changed to 0.0 for consistency
      max_tokens: 4096, // Increased for longer technical texts
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    res.json({
      translated: response.choices[0].message.content.trim(),
      sourceLanguage: sourceLanguage || "auto-detected",
      targetLanguage,
      targetNativeName: nativeName,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.post("/similarity_index", async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const sourceLang = sourceLanguage || "English";
    const results = {};

    let totalLLM1Score = 0;
    let totalLLM2Score = 0;
    let llm1Wins = 0;
    let llm2Wins = 0;
    let evaluatedCount = 0;

    for (const language of Object.keys(SUPPORTED_LANGUAGES)) {
      try {
        const { nativeName } = SUPPORTED_LANGUAGES[language];
        const llm1Response = await client.chat.completions.create({
          model: "llama-3.1-8b-instant",
          temperature: 0.0,
          messages: [
            {
              role: "system",
              content: `Translate into ${language} (${nativeName}). Return ONLY translation.`,
            },
            { role: "user", content: text },
          ],
        });

        const llm1Translation = llm1Response.choices[0].message.content.trim();
        const llm2Response = await gemini.models.generateContent({
          model: "gemini-2.0-flash",
          generationConfig: { temperature: 0.0 },
          contents: `Translate into ${language}. Return ONLY translation.\n\nText:\n${text}`,
        });

        const llm2Translation = llm2Response.text.trim();
        const swap = Math.random() > 0.5;

        const translationA = swap ? llm1Translation : llm2Translation;
        const translationB = swap ? llm2Translation : llm1Translation;

        const evaluationResponse =
          await gemini.models.generateContent({
            model: "gemini-2.0-flash",
            generationConfig: { temperature: 0.0 },
            contents: `
              You are a neutral professional translation evaluator.

              Original Text:
              ${text}

              Translation A:
              ${translationA}

              Translation B:
              ${translationB}

              Evaluate both translations based on:
              - Meaning preservation
              - Fluency
              - Accuracy
              - Naturalness

              Return ONLY valid JSON:
              {
                "scoreA": number (0-100),
                "scoreB": number (0-100),
                "semanticSimilarity": number (0-100),
                "winner": "A or B",
                "reasoning": "brief explanation"
              }`
          });

        let evaluationText = evaluationResponse.text.trim();

        if (evaluationText.startsWith("```")) {
          evaluationText = evaluationText
            .replace(/```json|```/g, "")
            .trim();
        }

        const evaluation = JSON.parse(evaluationText);
        const llm1Score = swap
          ? evaluation.scoreA
          : evaluation.scoreB;

        const llm2Score = swap
          ? evaluation.scoreB
          : evaluation.scoreA;

        totalLLM1Score += llm1Score;
        totalLLM2Score += llm2Score;

        if (
          (swap && evaluation.winner === "A") ||
          (!swap && evaluation.winner === "B")
        ) {
          llm1Wins++;
        } else {
          llm2Wins++;
        }

        evaluatedCount++;

        results[language] = {
          LLM1_translation: llm1Translation,
          LLM2_translation: llm2Translation,
          LLM1_score: llm1Score,
          LLM2_score: llm2Score,
          semanticSimilarity: evaluation.semanticSimilarity,
          winner:
            llm1Score > llm2Score
              ? "LLM1"
              : llm2Score > llm1Score
              ? "LLM2"
              : "Tie",
          reasoning: evaluation.reasoning,
        };
      } catch (err) {
        results[language] = { error: true };
      }
    }

    const averageLLM1 =
      evaluatedCount > 0 ? totalLLM1Score / evaluatedCount : 0;

    const averageLLM2 =
      evaluatedCount > 0 ? totalLLM2Score / evaluatedCount : 0;

    const llm1WinRate =
      evaluatedCount > 0
        ? (llm1Wins / evaluatedCount) * 100
        : 0;

    const llm2WinRate =
      evaluatedCount > 0
        ? (llm2Wins / evaluatedCount) * 100
        : 0;

    const finalWinner =
      averageLLM1 > averageLLM2
        ? "LLM1 (llama-3.1-8b-instant)"
        : averageLLM2 > averageLLM1
        ? "LLM2 (gemini-2.0-flash)"
        : "Tie";

    res.json({
      sourceLanguage: sourceLang,
      targetLanguage,

      modelPerformance: {
        LLM1_averageScore: Number(averageLLM1.toFixed(2)),
        LLM2_averageScore: Number(averageLLM2.toFixed(2)),
        LLM1_winRate: Number(llm1WinRate.toFixed(2)),
        LLM2_winRate: Number(llm2WinRate.toFixed(2)),
        winner: finalWinner,
      },
      totalLanguagesEvaluated: evaluatedCount,
      allLanguageResults: results,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Fair translation evaluation failed",
    });
  }
});

app.listen(8000, () =>
  console.log("🚀 Groq Server running on http://localhost:8000")
);
