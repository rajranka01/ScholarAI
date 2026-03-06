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
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });
const db = new Database("research.db");
const JWT_SECRET = process.env.JWT_SECRET || "scholar-ai-secret-key-2026";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
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

// Middleware for authentication
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Math.random().toString(36).substring(7);
    db.prepare("INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)").run(userId, email, hashedPassword, name);
    
    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, email, name } });
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/me", authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// Protected API Routes
app.post("/api/upload", authenticateToken, upload.single("file"), async (req: any, res) => {
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
    db.prepare("INSERT INTO documents (id, user_id, name, content) VALUES (?, ?, ?, ?)").run(docId, req.user.id, req.file.originalname, text);

    res.json({ id: docId, name: req.file.originalname });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/documents", authenticateToken, (req: any, res) => {
  const docs = db.prepare("SELECT id, name, created_at FROM documents WHERE user_id = ?").all(req.user.id);
  res.json(docs);
});

app.post("/api/chat", authenticateToken, async (req: any, res) => {
  const { message } = req.body;
  try {
    const docs = db.prepare("SELECT name, content FROM documents WHERE user_id = ?").all(req.user.id) as any[];
    
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

app.get("/api/graph", authenticateToken, async (req: any, res) => {
  const docs = db.prepare("SELECT name, content FROM documents WHERE user_id = ?").all(req.user.id) as any[];
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
