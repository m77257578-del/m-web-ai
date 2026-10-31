import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Exclusively locked to the lowest, fastest, and free Gemini model
const MODEL_NAME = 'gemini-3.1-flash-lite';

app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      systemInstruction, 
      imageBase64, 
      mimeType,
      mode = 'chat'
    } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'مفتاح Gemini API غير متوفر. يرجى إضافته من لوحة الأسرار (Settings > Secrets) في إعدادات التطبيق.' 
      });
    }

    const defaultSystem = 'أنت المعلم والمرشد الدراسي الذكي المصمم من شركة M Web لمساعدة الطلاب المصريين في جميع الصفوف والمراحل الدراسية طبقاً لمناهج وزارة التربية والتعليم المصرية. تشرح بأسلوب مبسط وشيق، وتحل المسائل والأسئلة والواجبات والصور بدقة متناهية.';
    const system = systemInstruction || defaultSystem;

    // 1. Interactive Quiz Mode (Returns structured JSON using gemini-3.1-flash-lite)
    if (mode === 'quiz') {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    questionText: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    correctAnswerIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING }
                  },
                  required: ['id', 'questionText', 'options', 'correctAnswerIndex', 'explanation']
                }
              }
            },
            required: ['title', 'questions']
          }
        }
      });

      return res.json({ json: response.text });
    }

    // 2. Multimodal Photo / Image Understanding Mode using gemini-3.1-flash-lite
    if (imageBase64) {
      const imagePart = {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64,
        },
      };
      const textPart = { 
        text: prompt || 'انظر إلى هذه الصورة من المنهج التعليمي واشرح محتواها أو حل المسألة/السؤال الموضح فيها بالتفصيل مع توضيح خطوات الحل والقوانين.' 
      };

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: [imagePart, textPart] },
        config: { systemInstruction: system },
      });

      return res.json({ text: response.text });
    }

    // 3. Standard Text Generation / Chat using gemini-3.1-flash-lite
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction: system },
    });

    return res.json({ text: response.text });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    res.status(500).json({ error: err.message || 'حدث خطأ أثناء معالجة الطلب.' });
  }
});

// Check API key status endpoint
app.get('/api/gemini/status', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({ configured: hasKey, model: MODEL_NAME });
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} locked to ${MODEL_NAME}`);
  });
}

startServer();
