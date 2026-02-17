import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://ai-ui-demo-taupe.vercel.app"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

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

function getUniversalPrompt(targetLanguage, text) {
  const { nativeName, script, notes } = SUPPORTED_LANGUAGES[targetLanguage];

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
    - Preserve all structure and formatting.

    TERMINOLOGY AND NAMES (CRITICAL)
    - NEVER translate product names, protocols, APIs, IDs, variables.
    - Keep domain English terms when standard.

    VARIABLES, PLACEHOLDERS, TOKENS
    - NEVER modify {0}, {name}, %s, IDs, TC_ITEM, etc.

    CODE AND MARKUP
    - Do NOT translate inline code, HTML tags, JSON keys.

    MEANING AND LOGIC
    - Preserve negations and conditions exactly.

    TONE
    - Professional enterprise software tone.

    QUALITY CHECK
    - Ensure nothing is omitted or logically changed.`;

  const userPrompt = `Translate this technical software text into ${targetLanguage} (${nativeName}).\n\n${text}`;

  return { systemPrompt, userPrompt };
}

app.post("/detect-language", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    const supportedList = Object.keys(SUPPORTED_LANGUAGES);

    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.0,
      max_tokens: 100,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
            You are a professional language detection engine.

            STRICT RULES:
            - Detect the exact language of the user text.
            - Only choose from this list:
            ${supportedList.join(", ")}

            - If none match confidently, return "Unknown".
            - Return ONLY valid JSON.
            - No explanation.

            Format:
            {
              "language": "English"
            }
          `,
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    const detected = parsed.language;

    const isSupported =
      Object.prototype.hasOwnProperty.call(
        SUPPORTED_LANGUAGES,
        detected
      );

    res.json({
      language: detected,
      supported: isSupported,
      nativeName: isSupported
        ? SUPPORTED_LANGUAGES[detected].nativeName
        : null,
    });
  } catch (error) {
    console.error("LLM Language detection error:", error);
    res.status(500).json({ error: "Language detection failed" });
  }
});

app.post("/translate", async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;

    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      return res.status(400).json({
        error: `Unsupported target language: "${targetLanguage}".`,
        supported: getSupportedLanguageList(),
      });
    }

    const { systemPrompt, userPrompt } = getUniversalPrompt(targetLanguage, text);

    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      seed: 42,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    res.json({
      translated: response.choices[0].message.content.trim(),
      sourceLanguage: sourceLanguage || "auto-detected",
      targetLanguage,
      targetNativeName: SUPPORTED_LANGUAGES[targetLanguage].nativeName,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.post("/similarity_index", async (req, res) => {
  try {
    const { text } = req.body;
    const results = {};

    for (const language of Object.keys(SUPPORTED_LANGUAGES)) {

      const { systemPrompt, userPrompt } = getUniversalPrompt(language, text);

      const llm1Response = await client.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        seed: 42,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const llm1Translation = llm1Response.choices[0].message.content.trim();

      const llm2Response = await gemini.models.generateContent({
        model: "gemini-2.0-flash",
        generationConfig: { temperature: 0.0 },
        contents: systemPrompt + "\n\n" + text,
      });

      const llm2Translation = llm2Response.text.trim();

      results[language] = {
        LLM1_translation: llm1Translation,
        LLM2_translation: llm2Translation,
      };
    }

    res.json({ results });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fair translation evaluation failed" });
  }
});


app.post("/translate_to_check", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({
        error: "text and targetLanguage are required",
      });
    }

    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      return res.status(400).json({
        error: `Unsupported target language: "${targetLanguage}".`,
      });
    }

    const { systemPrompt, userPrompt } = getUniversalPrompt(
      targetLanguage,
      text
    );

    const detectionResponse =
      await gemini.models.generateContent({
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: 0.0,
          responseMimeType: "application/json",
        },
        contents: `
        Detect the exact language of this text.
        Return ONLY JSON:
        { "language": "English" }

        Text:
        ${text}`,
    });

    const detectedLang = JSON.parse(
      detectionResponse.text.replace(/```json|```/g, "").trim()
    ).language;

    const llm1Response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      seed: 42,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const llm1Translation = llm1Response.choices[0].message.content.trim();

    const llm2Response =
      await gemini.models.generateContent({
        model: "gemini-2.0-flash",
        generationConfig: { temperature: 0.0 },
        contents: systemPrompt + "\n\n" + text,
      });

    const llm2Translation = llm2Response.text.trim();

    const evaluationResponse =
      await gemini.models.generateContent({
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: 0.0,
          responseMimeType: "application/json",
        },
        contents: `
          You are a strict professional translation evaluator.

          Original Text:
          ${text}

          Detected Source Language:
          ${detectedLang}

          Target Language:
          ${targetLanguage}

          Translation A (LLM1):
          ${llm1Translation}

          Translation B (LLM2):
          ${llm2Translation}

          Tasks:
          1. Back-translate both translations into ${detectedLang}.
          2. Compare both back-translations with the original text.
          3. Evaluate meaning preservation, fluency, and technical accuracy.
          4. Decide which model is better.

          Return ONLY JSON:
          {
            "backTranslationA": "...",
            "backTranslationB": "...",
            "scoreLLM1": number (0-100),
            "scoreLLM2": number (0-100),
            "winner": "LLM1 or LLM2",
            "reasoning": "brief explanation"
          }
        `,
      });

    const evaluation = JSON.parse(
      evaluationResponse.text.replace(/```json|```/g, "").trim()
    );

    res.json({
      detectedSourceLanguage: detectedLang,
      targetLanguage,

      LLM1: {
        forwardTranslation: llm1Translation,
      },

      LLM2: {
        forwardTranslation: llm2Translation,
      },

      evaluation: {
        ...evaluation,
        winnerModel:
          evaluation.winner === "LLM1"
            ? "Llama (llama-3.1-8b-instant)"
            : evaluation.winner === "LLM2"
            ? "Gemini (gemini-2.0-flash)"
            : "Tie",
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Optimized translation comparison failed",
    });
  }
});



app.listen(8000, () =>
  console.log("🚀 Groq Server running on http://localhost:8000")
);
