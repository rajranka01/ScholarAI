import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
import { GoogleGenAI } from "@google/genai";
import path from "path";
import fs from "fs";

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
    user_id TEXT,
    content TEXT,
    embedding BLOB,
    FOREIGN KEY(doc_id) REFERENCES documents(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    doc_id TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(doc_id) REFERENCES documents(id)
  );
`);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

app.use(express.json());

// Helper: Cosine Similarity
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Middleware for Auth
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
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
    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
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
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/me", authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// API Routes
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

    // Chunking and Embedding
    const chunkSize = 1000;
    const overlap = 200;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
      chunks.push(text.substring(i, i + chunkSize));
    }

    // Process chunks in batches to avoid rate limits
    for (const chunk of chunks.slice(0, 50)) { // Limit to first 50 chunks for demo stability
      try {
        const embeddingResponse: any = await ai.models.embedContent({
          model: "text-embedding-004",
          content: { parts: [{ text: chunk }] }
        } as any);
        const embedding = embeddingResponse.embedding.values;
        const chunkId = Math.random().toString(36).substring(7);
        const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
        db.prepare("INSERT INTO chunks (id, doc_id, user_id, content, embedding) VALUES (?, ?, ?, ?, ?)").run(chunkId, docId, req.user.id, chunk, embeddingBuffer);
      } catch (e) {
        console.error("Embedding failed for chunk", e);
      }
    }

    res.json({ id: docId, name: req.file.originalname });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/documents", authenticateToken, (req: any, res) => {
  const docs = db.prepare("SELECT id, name, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(docs);
});

app.delete("/api/documents/:id", authenticateToken, (req: any, res) => {
  db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  db.prepare("DELETE FROM chunks WHERE doc_id = ? AND user_id = ?").run(req.params.id, req.user.id);
  db.prepare("DELETE FROM notes WHERE doc_id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.post("/api/chat", authenticateToken, async (req: any, res) => {
  const { message, docId } = req.body;
  try {
    // 1. Generate embedding for the query
    const queryEmbeddingResponse: any = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text: message }] }
    } as any);
    const queryEmbedding = queryEmbeddingResponse.embedding.values;

    // 2. Fetch chunks (filtered by docId if provided)
    let query = "SELECT content, embedding FROM chunks WHERE user_id = ?";
    let params = [req.user.id];
    if (docId) {
      query += " AND doc_id = ?";
      params.push(docId);
    }
    const allChunks = db.prepare(query).all(...params) as any[];

    // 3. Simple Vector Search (Cosine Similarity)
    const scoredChunks = allChunks.map(chunk => {
      const chunkVec = Array.from(new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.byteLength / 4));
      return {
        content: chunk.content,
        score: cosineSimilarity(queryEmbedding, chunkVec)
      };
    });

    const topChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const context = topChunks.map(c => c.content).join("\n\n");

    // 4. Generate Response
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: "user", parts: [{ text: `Context from research papers:\n${context}\n\nQuestion: ${message}` }] }
      ],
      config: {
        systemInstruction: "You are ScholarAI, a professional research assistant. Answer the user's question based on the provided research context. Use academic tone, provide APA-style citations where applicable. If the answer isn't in the context, use your general knowledge but clearly distinguish it from the provided research data. Always prioritize the research context."
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/notes", authenticateToken, (req: any, res) => {
  const notes = db.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(notes);
});

app.post("/api/notes", authenticateToken, (req: any, res) => {
  const { docId, content } = req.body;
  const noteId = Math.random().toString(36).substring(7);
  db.prepare("INSERT INTO notes (id, user_id, doc_id, content) VALUES (?, ?, ?, ?)").run(noteId, req.user.id, docId, content);
  res.json({ id: noteId });
});

app.get("/api/graph", authenticateToken, async (req: any, res) => {
  const docs = db.prepare("SELECT name, content FROM documents WHERE user_id = ?").all(req.user.id) as any[];
  const nodes: any[] = [];
  const links: any[] = [];

  docs.forEach((doc) => {
    nodes.push({ id: doc.name, group: 1 });
    
    // Slightly more dynamic concept extraction (top keywords)
    const words = doc.content.toLowerCase().split(/\W+/).filter((w: string) => w.length > 6);
    const counts: Record<string, number> = {};
    words.forEach((w: string) => counts[w] = (counts[w] || 0) + 1);
    const topConcepts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);

    topConcepts.forEach(c => {
      const conceptId = c.charAt(0).toUpperCase() + c.slice(1);
      if (!nodes.find(n => n.id === conceptId)) nodes.push({ id: conceptId, group: 2 });
      links.push({ source: doc.name, target: conceptId });
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
