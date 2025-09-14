# 0) 사전 준비: Node.js 20+ 설치, Git 설치 권장
# 1) 프로젝트 생성
mkdir uni-chatbot && cd uni-chatbot


# 2) 소스 받기
# - 아래 폴더/파일 구조를 그대로 생성하세요 (이 문서 하단에 모든 코드 있음)


# 3) 의존성 설치
npm i express cors dotenv body-parser glob lancedb langchain @langchain/community ollama


# 4) (선택) Ollama 모델 준비 (완전 로컬 사용 시)
# - LLM: 예) llama3.1:8b 또는 qwen2.5:7b
# - 임베딩: nomic-embed-text
ollama pull llama3.1:8b
ollama pull nomic-embed-text


# 5) 대학 자료 넣기
mkdir university-data
# 여기에 .md, .pdf, .txt, .docx(선택) 등 자료를 복사


# 6) 임베딩 색인(ingest)
node ingest.mjs


# 7) 서버 실행
node server.mjs
# → http://localhost:8787 (API), http://localhost:8787/app (테스트 UI)
