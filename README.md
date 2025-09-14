### 0) 사전 준비: Node.js 20+ 설치, Git 설치 권장
### 1) 프로젝트 생성
mkdir uni-chatbot && cd uni-chatbot


### 2) 소스 받기
### - 아래 폴더/파일 구조를 그대로 생성하세요 

uni-chatbot/

├─ .env # 환경 변수(모델명 등)

├─ ingest.mjs # 폴더 문서 → 임베딩 → 벡터DB 색인 스크립트

├─ server.mjs # Express API 서버 + RAG 파이프라인

├─ vectorstore/ # LanceDB 벡터 테이블 데이터

├─ university-data/ # ★ 대학 관련 문서들(원천 데이터)

└─ public/

    ├─ index.html # 테스트용 미니 웹 UI

    └─ app.js # 프론트엔드 로직

### 3) 의존성 설치
npm i express cors dotenv body-parser glob lancedb langchain @langchain/community ollama


### 4) (선택) Ollama 모델 준비 (완전 로컬 사용 시)
### - LLM: 예) llama3.1:8b 또는 qwen2.5:7b
### - 임베딩: nomic-embed-text
ollama pull llama3.1:8b
ollama pull nomic-embed-text


### 5) 대학 자료 넣기
mkdir university-data
### 여기에 .md, .pdf, .txt, .docx(선택) 등 자료를 복사


### 6) 임베딩 색인(ingest)
node ingest.mjs


### 7) 서버 실행
node server.mjs
### → http://localhost:8787 (API), http://localhost:8787/app (테스트 UI)



