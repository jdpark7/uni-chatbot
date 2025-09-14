// server.mjs
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { glob } from 'glob';

import { connect } from '@lancedb/lancedb';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { OllamaEmbeddings, Ollama } from '@langchain/ollama';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8787', 10);
const DB_DIR = path.join(__dirname, 'vectorstore');
const DATA_DIR = path.join(__dirname, 'university-data');
const TABLE_NAME = process.env.TABLE_NAME || 'uni_docs';
const TOP_K = parseInt(process.env.TOP_K ?? '6', 10);

// ⚠️ ingest.mjs에서 임베딩 컬럼명을 반드시 "vector"로 저장하세요 (vector: number[])
const embeddings = new OllamaEmbeddings({
  model: process.env.EMBEDDING_MODEL || 'nomic-embed-text', // ingest와 동일해야 함
});

const llm = new Ollama({
  model: process.env.LLM_MODEL || 'llama3.1:8b',
  temperature: 0.2,
});

// LanceDB 연결을 재사용하도록 미리 열어둠
const tablePromise = (async () => {
  const db = await connect(DB_DIR);
  try {
    return await db.openTable(TABLE_NAME);
  } catch (e) {
    console.error('[RAG] 테이블을 열 수 없습니다. 먼저 ingest를 실행하세요.', e);
    throw e;
  }
})();

// --- 간단 번역기: 한국어/기타 언어 질문 → 짧은 영어 검색문으로
async function translateToEnglish(text) {
  const p = ChatPromptTemplate.fromMessages([
    ['system', 'You translate user search queries into concise English. Output English only.'],
    ['human', '{q}'],
  ]);
  const chain = p.pipe(llm).pipe(new StringOutputParser());
  return (await chain.invoke({ q: text })).trim();
}

// --- 동의어/관련어 확장 질의 세트
function expandQueries(originalKo, translatedEn) {
  const koVars = [
    originalKo,
    originalKo.replace(/개설\s*교과목/g, '개설 과목'),
    originalKo.replace(/개설\s*교과목/g, '강의 목록'),
    '개설 교과목', '개설 과목', '강의 목록', '수업 목록', '시간표',
    '교육과정', '커리큘럼', '전공 과목', '교양 과목', '강좌 목록'
  ];
  const enVars = [
    translatedEn,
    'course catalog', 'course list', 'offered courses', 'subject list',
    'curriculum', 'syllabus', 'module list', 'class schedule', 'timetable',
    'program curriculum'
  ];
  return Array.from(new Set([...koVars, ...enVars].map(s => s.trim()).filter(Boolean)));
}

// --- LanceDB에서 유사도 검색 (cosine)
async function retrieve(query) {
  const table = await tablePromise;
  const qvec = await embeddings.embedQuery(query);

  let res = await table
    .search(qvec)
    .distanceType('cosine')
    .select(['id', 'text', 'source', '_distance']) // 경고 방지용으로 명시 포함
    .limit(TOP_K)
    .execute();

  const rows = Array.isArray(res) ? res : (res?.toArray ? res.toArray() : []);
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    source: r.source,
    score: r._distance ?? r.distance ?? r.score ?? null, // 낮을수록 유사
  }));
}

// --- 키워드 기반 폴백: 벡터 검색이 비었을 때 파일 직접 스캔
async function keywordFallback(kws, limit = TOP_K) {
  const files = await glob('**/*.md', { cwd: DATA_DIR, absolute: true, nodir: true });
  const results = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    if (kws.some((kw) => new RegExp(kw, 'i').test(text))) {
      const idxs = kws
        .map((kw) => text.toLowerCase().indexOf(kw.toLowerCase()))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const pos = idxs[0] ?? 0;
      const snippet = text.slice(Math.max(0, pos - 300), pos + 900);
      results.push({
        id: `${file}::kw`,
        text: snippet,
        source: file.replace(DATA_DIR + '/', ''),
        score: 0.5, // 임의값(벡터보다 낮은 신뢰)
      });
      if (results.length >= limit) break;
    }
  }
  return results;
}

// --- 답변 프롬프트: 항상 한국어로 답하도록 강제
const system = `당신은 대학 안내 챗봇입니다. 제공된 컨텍스트만 사용해 정확히 답하십시오.
- 모르면 "자료에 없는 정보"라고 말하세요.
- 항상 참고한 소스 파일명을 함께 제시하세요.
- 반드시 한국어로 답하세요.`;

const prompt = ChatPromptTemplate.fromMessages([
  ['system', system],
  ['human', '질문: {question}\n\n[참고 자료]\n{context}\n\n이 자료만으로 답변을 작성하세요.'],
]);

const chain = RunnableSequence.from([
  {
    question: new RunnablePassthrough(),
    context: async (question) => {
      // 1) 질의 확장 (KO/EN)
      const qEn = await translateToEnglish(question);
      const queries = expandQueries(question, qEn);

      // 2) 확장 질의로 벡터 검색 후 병합·상위 TOP_K 선별
      const resultsList = await Promise.all(queries.map((q) => retrieve(q)));
      const allHits = resultsList.flat();

      const mergedMap = new Map();
      allHits.forEach((h) => {
        const key = h.id || `${h.source}:${(h.text || '').slice(0, 50)}`;
        const prev = mergedMap.get(key);
        if (!prev || (h.score ?? 1) < (prev.score ?? 1)) mergedMap.set(key, h);
      });
      let merged = Array.from(mergedMap.values())
        .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
        .slice(0, TOP_K);

      // 3) 폴백: 벡터 검색이 0건이면 키워드 스캔
      if (merged.length === 0) {
        const koKws = ['개설', '교과목', '강의', '과목', '시간표', '교육과정', '커리큘럼', '수업', '전공', '교양'];
        const enKws = ['course', 'courses', 'course list', 'course catalog', 'offered', 'subject', 'curriculum', 'syllabus', 'timetable', 'schedule'];
        merged = await keywordFallback([...koKws, ...enKws]);
      }

      const ctx = merged
        .map(
          (h, i) => `# 문서${i + 1} (유사도=${(1 - (h.score ?? 0)).toFixed(3)})\n[${h.source}]\n${(h.text || '').slice(0, 1200)}...\n`
        )
        .join('\n');

      return ctx || '자료 없음';
    },
  },
  prompt,
  llm,
  new StringOutputParser(),
]);

// --- Express 서버
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use('/app', express.static(path.join(__dirname, 'public')));

app.post('/chat', async (req, res) => {
  try {
    const q = (req.body?.message || '').toString();
    if (!q) return res.status(400).json({ error: 'message is required' });
    const answer = await chain.invoke(q);
    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error', detail: String(e) });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () =>
  console.log(`🚀 RAG server running: http://localhost:${PORT}  (UI: /app)`) 
);
