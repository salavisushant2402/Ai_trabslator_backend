import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// Detect Language
app.post("/detect-language", async (req, res) => {
  try {
    const { text } = req.body;

   const response = await client.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
            {
            role: "system",
            content: "Detect the language of the user text. Only return language name.",
            },
            { role: "user", content: text },
        ],
        });

    res.json({
      language: response.choices[0].message.content.trim(),
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Language detection failed" });
  }
});


app.post("/translate", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    const response = await client.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
            {
            role: "system",
            content: `Translate the following text into ${targetLanguage}. Only return translated text.`,
            },
            { role: "user", content: text },
        ],
    });


    res.json({
      translated: response.choices[0].message.content.trim(),
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.listen(8000, () =>
  console.log("🚀 Groq Server running on http://localhost:8000")
);
