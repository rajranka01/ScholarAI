export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Document {
  id: string;
  name: string;
  created_at: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Note {
  id: string;
  doc_id: string;
  content: string;
  created_at: string;
}

export interface GraphData {
  nodes: { id: string; group: number }[];
  links: { source: string; target: string }[];
}
