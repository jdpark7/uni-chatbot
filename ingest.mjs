// ingest.mjs
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
// ⬇️ LangChain 0.3 경로 변경
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

// ⬇️ Ollama Embeddings 패키지 분리
import { OllamaEmbeddings } from '@langchain/ollama';

// LanceDB
import { connect } from '@lancedb/lancedb';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const DATA_DIR = path.join(__dirname, 'university-data');
const DB_DIR = path.join(__dirname, 'vectorstore');
const TABLE_NAME = 'uni_docs';


const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE ?? '1000', 10);
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP ?? '150', 10);


// --- Embeddings 선택: (기본) Ollama ---
const embeddings = new OllamaEmbeddings({ model: process.env.EMBEDDING_MODEL || 'nomic-embed-text' });


// // --- Embeddings 선택: OpenAI (원하면 이 라인들로 교체)
// const embeddings = new OpenAIEmbeddings({
// model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
// apiKey: process.env.OPENAI_API_KEY,
// });


async function loadTextFiles(dir) {
const patterns = ['**/*.md', '**/*.txt']; // 필요 시 확장: pdf/docx 로더 사용
const files = patterns.flatMap((p) => glob.sync(path.join(dir, p)));
const docs = [];
for (const file of files) {
const text = await fs.readFile(file, 'utf8');
docs.push(new Document({ pageContent: text, metadata: { source: path.relative(dir, file) } }));
}
return docs;
}


async function main() {
console.log('🔎 Loading docs from:', DATA_DIR);
const rawDocs = await loadTextFiles(DATA_DIR);
if (rawDocs.length === 0) {
console.log('⚠️ No documents found in university-data/. Add .md or .txt files.');
return;
}


const splitter = new RecursiveCharacterTextSplitter({
chunkSize: CHUNK_SIZE,
chunkOverlap: CHUNK_OVERLAP,
separators: ['\n\n', '\n', ' ', '']
});


const chunks = await splitter.splitDocuments(rawDocs);
console.log(`✂️ Split into ${chunks.length} chunks (size=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP})`);


// LanceDB 연결 및 테이블 준비
const db = await connect(DB_DIR);
const tableNames = await db.tableNames();

let table = null;
let created = tableNames.includes(TABLE_NAME);
if (created) {
  table = await db.openTable(TABLE_NAME);
}

// --- 임베딩 계산 후 upsert ---
console.log('🧠 Computing embeddings & upserting...');

const batchSize = 64;
for (let i = 0; i < chunks.length; i += batchSize) {
  const batch = chunks.slice(i, i + batchSize);
  const texts = batch.map((d) => d.pageContent);

  // 임베딩 계산
  const vectors = await embeddings.embedDocuments(texts);

  // LanceDB row 포맷
const rows = batch.map((doc, idx) => ({
  id: `${doc.metadata.source}::${i + idx}`,
  text: doc.pageContent,
  source: doc.metadata.source,
  vector: vectors[idx], // LanceDB 기본 컬럼명
}));

if (!created) {
  table = await db.createTable(TABLE_NAME, rows);
  created = true;
} else {
  await table.add(rows);
}

  process.stdout.write(`\r✅ Upserted ${Math.min(i + batchSize, chunks.length)} / ${chunks.length}`);
}
console.log('\n🎉 Ingestion complete!');
}

main().catch((e) => {
console.error(e);
process.exit(1);
});
