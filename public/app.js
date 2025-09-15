// public/app.js
const elQ = document.getElementById('q');
const elBtn = document.getElementById('ask');
const elChat = document.getElementById('chat');


function addMsg(text, who = 'you') {
const div = document.createElement('div');
div.className = 'msg ' + who;
div.textContent = text;
elChat.appendChild(div);
}


elBtn.addEventListener('click', async () => {
const message = elQ.value.trim();
if (!message) return;
addMsg(message, 'you');
elQ.value = '';


const resp = await fetch('/chat', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ message }),
});
const data = await resp.json();
addMsg(data.answer || data.error || '오류', 'bot');
});
