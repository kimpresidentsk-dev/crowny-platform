// Global State
let currentUser = null;
let userWallet = null;

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-modal').style.display = 'none';
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-info').style.display = 'block';
        
        await loadUserWallet();
        await loadUserData();
    } else {
        document.getElementById('auth-modal').style.display = 'flex';
        document.getElementById('user-info').style.display = 'none';
    }
});

// Signup
async function signup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    if (!email || !password) {
        alert('이메일과 비밀번호를 입력하세요');
        return;
    }
    
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // Create wallet
        const wallet = web3.eth.accounts.create();
        
        // Save to Firestore
        await db.collection('users').doc(result.user.uid).set({
            email: email,
            walletAddress: wallet.address,
            privateKey: wallet.privateKey, // 실제로는 암호화 필요!
            balances: {
                crny: 0,
                fnc: 0,
                crfn: 0
            },
            createdAt: new Date()
        });
        
        alert('✅ 가입 완료! 지갑이 생성되었습니다.');
    } catch (error) {
        console.error(error);
        alert('가입 실패: ' + error.message);
    }
}

// Login
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert('로그인 실패: ' + error.message);
    }
}

// Logout
function logout() {
    auth.signOut();
    location.reload();
}

// Load User Wallet
async function loadUserWallet() {
    if (!currentUser) return;
    
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
        userWallet = doc.data();
        document.getElementById('wallet-address').textContent = 
            userWallet.walletAddress.slice(0, 6) + '...' + userWallet.walletAddress.slice(-4);
        
        updateBalances();
    }
}

// Update Balances
function updateBalances() {
    if (!userWallet) return;
    
    document.getElementById('crny-balance').textContent = userWallet.balances.crny.toFixed(2);
    document.getElementById('fnc-balance').textContent = userWallet.balances.fnc.toFixed(2);
    document.getElementById('crfn-balance').textContent = userWallet.balances.crfn.toFixed(2);
}

// Load User Data (Messages, Posts)
async function loadUserData() {
    loadMessages();
    loadSocialFeed();
}

// ========== MESSENGER ==========
let currentChat = null;

async function loadMessages() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    // Get all chats for current user
    const chats = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    if (chats.empty) {
        chatList.innerHTML = '<p style="padding:1rem;">채팅 없음</p>';
        return;
    }
    
    chats.forEach(doc => {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid);
        
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => openChat(doc.id, otherId);
        chatItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="chat-preview">
                <strong>${chat.otherEmail || 'User'}</strong>
                <p>${chat.lastMessage || '메시지 없음'}</p>
            </div>
        `;
        chatList.appendChild(chatItem);
    });
}

async function openChat(chatId, otherId) {
    currentChat = chatId;
    
    const otherUser = await db.collection('users').doc(otherId).get();
    document.getElementById('chat-username').textContent = otherUser.data().email;
    
    // Load messages
    const messages = await db.collection('chats').doc(chatId)
        .collection('messages').orderBy('timestamp').get();
    
    const messagesDiv = document.getElementById('chat-messages');
    messagesDiv.innerHTML = '';
    
    messages.forEach(doc => {
        const msg = doc.data();
        const isMine = msg.senderId === currentUser.uid;
        
        const msgEl = document.createElement('div');
        msgEl.style.cssText = `
            background: ${isMine ? 'var(--text)' : 'var(--bg)'};
            color: ${isMine ? 'white' : 'var(--text)'};
            padding: 0.8rem;
            border-radius: 8px;
            margin-bottom: 0.5rem;
            max-width: 70%;
            margin-left: ${isMine ? 'auto' : '0'};
        `;
        msgEl.textContent = msg.text;
        messagesDiv.appendChild(msgEl);
    });
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
    if (!currentChat) {
        alert('채팅을 선택하세요');
        return;
    }
    
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    await db.collection('chats').doc(currentChat)
        .collection('messages').add({
            senderId: currentUser.uid,
            text: text,
            timestamp: new Date()
        });
    
    await db.collection('chats').doc(currentChat).update({
        lastMessage: text,
        lastMessageTime: new Date()
    });
    
    input.value = '';
    openChat(currentChat, null);
}

// ========== SOCIAL FEED ==========
async function loadSocialFeed() {
    const feed = document.getElementById('social-feed');
    feed.innerHTML = '';
    
    const posts = await db.collection('posts')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();
    
    if (posts.empty) {
        feed.innerHTML = '<p style="text-align:center;">게시물 없음</p>';
        return;
    }
    
    for (const doc of posts.docs) {
        const post = doc.data();
        
        // Get user info
        const userDoc = await db.collection('users').doc(post.userId).get();
        const userEmail = userDoc.data().email;
        
        const postEl = document.createElement('div');
        postEl.className = 'post';
        postEl.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">👤</div>
                <div class="post-info">
                    <strong>${userEmail}</strong>
                    <span>${new Date(post.timestamp.toDate()).toLocaleString()}</span>
                </div>
            </div>
            <div class="post-content">
                <p>${post.text}</p>
            </div>
            <div class="post-actions">
                <button onclick="likePost('${doc.id}')">❤️ ${post.likes || 0}</button>
            </div>
        `;
        feed.appendChild(postEl);
    }
}

async function createPost() {
    const textarea = document.getElementById('post-text');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    await db.collection('posts').add({
        userId: currentUser.uid,
        text: text,
        likes: 0,
        timestamp: new Date()
    });
    
    textarea.value = '';
    loadSocialFeed();
    alert('게시 완료!');
}

async function likePost(postId) {
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    
    await postRef.update({
        likes: (post.data().likes || 0) + 1
    });
    
    loadSocialFeed();
}

// ========== SEND TOKENS ==========
function showSendModal() {
    const recipient = prompt('받는 사람 이메일:');
    if (!recipient) return;
    
    const amount = prompt('전송할 CRNY 수량:');
    if (!amount) return;
    
    sendTokens(recipient, parseFloat(amount));
}

async function sendTokens(recipientEmail, amount) {
    if (!userWallet) return;
    
    if (amount > userWallet.balances.crny) {
        alert('잔액이 부족합니다!');
        return;
    }
    
    // Find recipient
    const users = await db.collection('users').where('email', '==', recipientEmail).get();
    
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const recipientDoc = users.docs[0];
    const recipient = recipientDoc.data();
    
    // Update balances
    await db.collection('users').doc(currentUser.uid).update({
        'balances.crny': userWallet.balances.crny - amount
    });
    
    await db.collection('users').doc(recipientDoc.id).update({
        'balances.crny': recipient.balances.crny + amount
    });
    
    // Create transaction record
    await db.collection('transactions').add({
        from: currentUser.uid,
        to: recipientDoc.id,
        amount: amount,
        token: 'CRNY',
        timestamp: new Date()
    });
    
    alert(`✅ ${amount} CRNY 전송 완료!`);
    loadUserWallet();
}

// ========== UI HELPERS ==========
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(pageId).classList.add('active');
    const navItem = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (navItem) navItem.classList.add('active');
    
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
}

function showLogin() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

// Init Web3
const web3 = new Web3('https://polygon-rpc.com');
