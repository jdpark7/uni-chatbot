### 0) Preparation: Install Node.js 20+ and Git (recommended)
### 1) Create project
mkdir uni-chatbot && cd uni-chatbot

### 2) Get source code

### Create the folder/file structure exactly as below:

uni-chatbot/  
├─ .env              # Environment variables (e.g., model name)  
├─ ingest.mjs        # Script: documents → embeddings → vector DB index  
├─ server.mjs        # Express API server + RAG pipeline  
├─ vectorstore/      # LanceDB vector table data  
├─ university-data/  # ★ University-related documents (source data)  
└─ public/  
`     ├─ index.html     # Mini web UI for testing  
`     └─ app.js         # Frontend logic  

### 3)Install dependencies
npm i express cors dotenv body-parser glob lancedb langchain @langchain/community ollama


### 4) (Optional) Prepare Ollama models (for fully local usage)
### - LLM: ex) llama3.1:8b or qwen2.5:7b
### - embedding: nomic-embed-text
ollama pull llama3.1:8b
ollama pull nomic-embed-text


### 5) Add university data
mkdir university-data
### Copy materials such as .md, .pdf, .txt, .docx (optional) into this folder.


### 6) Run embedding & indexing (ingest)
node ingest.mjs


### 7) Start the server
node server.mjs
### → http://localhost:8787 (API), http://localhost:8787/app (Test UI)



