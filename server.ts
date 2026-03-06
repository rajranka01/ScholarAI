import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
// @ts-ignore
import pdf from "pdf-parse";
import mammoth from "mammoth";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import fs from "fs";

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });
const db = new Database("research.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT,
    content TEXT,
    embedding TEXT,
    FOREIGN KEY(doc_id) REFERENCES documents(id)
  );
`);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

app.use(express.json());

// API Routes
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let text = "";
    if (req.file.mimetype === "application/pdf") {
      const data = await pdf(req.file.buffer);
      text = data.text;
    } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const data = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = data.value;
    } else {
      text = req.file.buffer.toString();
    }

    const docId = Math.random().toString(36).substring(7);
    db.prepare("INSERT INTO documents (id, name, content) VALUES (?, ?, ?)").run(docId, req.file.originalname, text);

    res.json({ id: docId, name: req.file.originalname });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/documents", (req, res) => {
  const docs = db.prepare("SELECT id, name, created_at FROM documents").all();
  res.json(docs);
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  try {
    const docs = db.prepare("SELECT name, content FROM documents").all() as any[];
    
    const keywords = message.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
    const relevantDocs = docs.filter(doc => {
      const content = doc.content.toLowerCase();
      return keywords.some(kw => content.includes(kw));
    });

    const contextDocs = relevantDocs.length > 0 ? relevantDocs : docs.slice(-3);
    const context = contextDocs
      .map(d => `--- DOCUMENT: ${d.name} ---\n${d.content}`)
      .join("\n\n")
      .substring(0, 15000);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: "user", parts: [{ text: `Context from research papers:\n${context}\n\nQuestion: ${message}` }] }
      ],
      config: {
        systemInstruction: "You are ScholarAI, a professional research assistant. Answer the user's question based on the provided research context. Use academic tone, provide APA-style citations where applicable, and if the answer isn't in the context, clearly state that while offering general knowledge if helpful."
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/graph", async (req, res) => {
  const docs = db.prepare("SELECT name, content FROM documents").all() as any[];
  const nodes: any[] = [];
  const links: any[] = [];

  docs.forEach((doc) => {
    nodes.push({ id: doc.name, group: 1 });
    const concepts = ["Methodology", "Results", "Literature Review", "Conclusion"];
    concepts.forEach(c => {
      if (!nodes.find(n => n.id === c)) nodes.push({ id: c, group: 2 });
      links.push({ source: doc.name, target: c });
    });
  });

  res.json({ nodes, links });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
