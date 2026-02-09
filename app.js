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
        const addr = userWallet.walletAddress;
        document.getElementById('wallet-address').textContent = 
            addr.slice(0, 6) + '...' + addr.slice(-4);
        document.getElementById('wallet-address-full').textContent = addr;
        
        await loadRealBalances();
        updateBalances();
    }
}

// Load Real Balances from Polygon
async function loadRealBalances() {
    if (!userWallet) return;
    
    try {
        const web3 = new Web3('https://polygon-rpc.com');
        const address = userWallet.walletAddress;
        
        const ERC20_ABI = [{
            "constant": true,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        }];
        
        const contracts = window.THIRDWEB_CONFIG.contracts;
        
        // CRNY
        const crnyContract = new web3.eth.Contract(ERC20_ABI, contracts.CRNY);
        const crnyBalance = await crnyContract.methods.balanceOf(address).call();
        userWallet.balances.crny = parseFloat(crnyBalance) / 1e18;
        
        // FNC
        const fncContract = new web3.eth.Contract(ERC20_ABI, contracts.FNC);
        const fncBalance = await fncContract.methods.balanceOf(address).call();
        userWallet.balances.fnc = parseFloat(fncBalance) / 1e18;
        
        // CRFN
        const crfnContract = new web3.eth.Contract(ERC20_ABI, contracts.CRFN);
        const crfnBalance = await crfnContract.methods.balanceOf(address).call();
        userWallet.balances.crfn = parseFloat(crfnBalance) / 1e18;
        
        // Update Firestore
        await db.collection('users').doc(currentUser.uid).update({
            'balances.crny': userWallet.balances.crny,
            'balances.fnc': userWallet.balances.fnc,
            'balances.crfn': userWallet.balances.crfn
        });
        
        console.log('Real balances loaded:', userWallet.balances);
    } catch (error) {
        console.error('Balance load error:', error);
    }
}

// Copy Address
function copyAddress() {
    if (!userWallet) return;
    
    const address = userWallet.walletAddress;
    
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(() => {
            alert('✅ 주소가 복사되었습니다!');
        }).catch(err => {
            // Fallback
            fallbackCopy(address);
        });
    } else {
        // Fallback
        fallbackCopy(address);
    }
}

function fallbackCopy(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-999999px';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        alert('✅ 주소가 복사되었습니다!');
    } catch (err) {
        alert('복사 실패. 수동으로 복사해주세요:\n' + text);
    }
    
    document.body.removeChild(temp);
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
let currentChatOtherId = null;

function showChats() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'block';
    document.getElementById('contacts-view').style.display = 'none';
}

function showContacts() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('chats-view').style.display = 'none';
    document.getElementById('contacts-view').style.display = 'block';
    loadContacts();
}

async function showAddContactModal() {
    const email = prompt('추가할 연락처 이메일:');
    if (!email) return;
    
    const name = prompt('표시 이름 (선택):') || email;
    
    // Check if user exists
    const users = await db.collection('users').where('email', '==', email).get();
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const userId = users.docs[0].id;
    
    // Add to contacts
    await db.collection('users').doc(currentUser.uid)
        .collection('contacts').doc(userId).set({
            email: email,
            name: name,
            addedAt: new Date()
        });
    
    alert('✅ 연락처에 추가되었습니다');
    loadContacts();
}

async function loadContacts() {
    const contactList = document.getElementById('contact-list');
    contactList.innerHTML = '';
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    if (contacts.empty) {
        contactList.innerHTML = '<p style="padding:1rem; color:var(--accent);">연락처 없음</p>';
        return;
    }
    
    contacts.forEach(doc => {
        const contact = doc.data();
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="contact-info">
                <strong>${contact.name}</strong>
                <p>${contact.email}</p>
            </div>
            <button onclick='startChatWithContact("${contact.email}")' class="btn-chat">채팅</button>
        `;
        contactList.appendChild(contactItem);
    });
}

async function startChatWithContact(email) {
    await startNewChat(email);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn').classList.add('active');
    document.getElementById('chats-view').style.display = 'block';
    document.getElementById('contacts-view').style.display = 'none';
}

function showNewChatModal() {
    const email = prompt('채팅할 사용자 이메일:');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    if (otherEmail === currentUser.email) {
        alert('자기 자신과는 채팅할 수 없습니다');
        return;
    }
    
    const users = await db.collection('users').where('email', '==', otherEmail).get();
    
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const otherUser = users.docs[0];
    const otherId = otherUser.id;
    
    // Check if chat exists
    const existingChat = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    let chatId = null;
    
    for (const doc of existingChat.docs) {
        const chat = doc.data();
        if (chat.participants.includes(otherId)) {
            chatId = doc.id;
            break;
        }
    }
    
    // Create new chat if not exists
    if (!chatId) {
        const newChat = await db.collection('chats').add({
            participants: [currentUser.uid, otherId],
            otherEmail: otherEmail,
            myEmail: currentUser.email,
            lastMessage: '',
            lastMessageTime: new Date(),
            createdAt: new Date()
        });
        chatId = newChat.id;
    }
    
    await loadMessages();
    openChat(chatId, otherId);
}

async function loadMessages() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    const chats = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastMessageTime', 'desc')
        .get();
    
    if (chats.empty) {
        chatList.innerHTML = '<p style="padding:1rem; color:var(--accent);">채팅을 시작하세요</p>';
        return;
    }
    
    for (const doc of chats.docs) {
        const chat = doc.data();
        const otherId = chat.participants.find(id => id !== currentUser.uid);
        
        const otherUserDoc = await db.collection('users').doc(otherId).get();
        const otherEmail = otherUserDoc.data().email;
        
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = () => openChat(doc.id, otherId);
        chatItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="chat-preview">
                <strong>${otherEmail}</strong>
                <p>${chat.lastMessage || '메시지 없음'}</p>
            </div>
        `;
        chatList.appendChild(chatItem);
    }
}

async function openChat(chatId, otherId) {
    currentChat = chatId;
    currentChatOtherId = otherId;
    
    const otherUser = await db.collection('users').doc(otherId).get();
    document.getElementById('chat-username').textContent = otherUser.data().email;
    
    // Real-time listener
    db.collection('chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(snapshot => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMine = msg.senderId === currentUser.uid;
                
                const msgEl = document.createElement('div');
                msgEl.style.cssText = `
                    background: ${isMine ? 'var(--text)' : 'var(--bg)'};
                    color: ${isMine ? 'white' : 'var(--text)'};
                    padding: 0.8rem;
                    border-radius: 12px;
                    margin-bottom: 0.5rem;
                    max-width: 70%;
                    margin-left: ${isMine ? 'auto' : '0'};
                    word-break: break-word;
                `;
                
                let content = msg.text;
                if (msg.tokenAmount) {
                    content = `💰 ${msg.tokenAmount} ${msg.tokenType} 전송\n${msg.text || ''}`;
                }
                
                msgEl.textContent = content;
                messagesDiv.appendChild(msgEl);
            });
            
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
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
}

async function sendTokenWithMessage() {
    if (!currentChat || !currentChatOtherId) {
        alert('채팅을 선택하세요');
        return;
    }
    
    const amount = prompt('전송할 CRNY 수량:');
    if (!amount) return;
    
    const amountNum = parseFloat(amount);
    if (amountNum <= 0 || amountNum > userWallet.balances.crny) {
        alert('잔액이 부족하거나 잘못된 수량입니다');
        return;
    }
    
    const message = prompt('메시지 (선택):') || '';
    
    // Update balances
    await db.collection('users').doc(currentUser.uid).update({
        'balances.crny': userWallet.balances.crny - amountNum
    });
    
    const otherUser = await db.collection('users').doc(currentChatOtherId).get();
    await db.collection('users').doc(currentChatOtherId).update({
        'balances.crny': otherUser.data().balances.crny + amountNum
    });
    
    // Send message with token
    await db.collection('chats').doc(currentChat)
        .collection('messages').add({
            senderId: currentUser.uid,
            text: message,
            tokenAmount: amountNum,
            tokenType: 'CRNY',
            timestamp: new Date()
        });
    
    await db.collection('chats').doc(currentChat).update({
        lastMessage: `💰 ${amountNum} CRNY 전송`,
        lastMessageTime: new Date()
    });
    
    // Transaction record
    await db.collection('transactions').add({
        from: currentUser.uid,
        to: currentChatOtherId,
        amount: amountNum,
        token: 'CRNY',
        message: message,
        timestamp: new Date()
    });
    
    alert(`✅ ${amountNum} CRNY 전송 완료!`);
    loadUserWallet();
}

// ========== SOCIAL FEED ==========
async function loadSocialFeed() {
    const feed = document.getElementById('social-feed');
    feed.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩 중...</p>';
    
    try {
        const posts = await db.collection('posts')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
        
        feed.innerHTML = '';
        
        if (posts.empty) {
            feed.innerHTML = '<p style="text-align:center; color:var(--accent);">게시물이 없습니다</p>';
            return;
        }
        
        for (const doc of posts.docs) {
            const post = doc.data();
            
            // Get user info
            const userDoc = await db.collection('users').doc(post.userId).get();
            const userData = userDoc.exists ? userDoc.data() : { email: '알 수 없음' };
            
            const timeAgo = getTimeAgo(post.timestamp.toDate());
            
            const postEl = document.createElement('div');
            postEl.className = 'post';
            postEl.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar">👤</div>
                    <div class="post-info">
                        <strong>${userData.email}</strong>
                        <span>${timeAgo}</span>
                    </div>
                </div>
                <div class="post-content">
                    <p>${post.text}</p>
                </div>
                <div class="post-actions">
                    <button onclick="likePost('${doc.id}', ${post.likes || 0})">❤️ ${post.likes || 0}</button>
                    <button>💬 댓글</button>
                </div>
            `;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = '<p style="text-align:center; color:red;">로딩 실패</p>';
    }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return '방금 전';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
    return `${Math.floor(seconds / 86400)}일 전`;
}

async function createPost() {
    const textarea = document.getElementById('post-text');
    const text = textarea.value.trim();
    
    if (!text) {
        alert('내용을 입력하세요');
        return;
    }
    
    try {
        await db.collection('posts').add({
            userId: currentUser.uid,
            text: text,
            likes: 0,
            timestamp: new Date()
        });
        
        textarea.value = '';
        await loadSocialFeed();
        alert('✅ 게시 완료!');
    } catch (error) {
        console.error('Post error:', error);
        alert('게시 실패');
    }
}

async function likePost(postId, currentLikes) {
    try {
        await db.collection('posts').doc(postId).update({
            likes: currentLikes + 1
        });
        
        await loadSocialFeed();
    } catch (error) {
        console.error('Like error:', error);
    }
}

// ========== SEND TOKENS ==========
async function showSendModal() {
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    if (contacts.empty) {
        const email = prompt('받는 사람 이메일:');
        if (!email) return;
        await showTokenAmountModal(email);
    } else {
        let contactList = '연락처에서 선택:\n\n';
        const contactsArray = [];
        
        contacts.forEach((doc, index) => {
            const contact = doc.data();
            contactsArray.push(contact);
            contactList += `${index + 1}. ${contact.name} (${contact.email})\n`;
        });
        
        contactList += `\n0. 직접 입력\n\n번호를 입력하세요:`;
        
        const choice = prompt(contactList);
        if (!choice) return;
        
        const choiceNum = parseInt(choice);
        let recipientEmail;
        
        if (choiceNum === 0) {
            recipientEmail = prompt('받는 사람 이메일:');
        } else if (choiceNum > 0 && choiceNum <= contactsArray.length) {
            recipientEmail = contactsArray[choiceNum - 1].email;
        } else {
            alert('잘못된 선택입니다');
            return;
        }
        
        if (!recipientEmail) return;
        await showTokenAmountModal(recipientEmail);
    }
}

async function showTokenAmountModal(recipientEmail) {
    const tokenChoice = prompt('토큰 선택:\n1. CRNY\n2. FNC\n3. CRFN\n\n번호를 입력하세요:');
    
    let tokenType;
    let balance;
    
    switch(tokenChoice) {
        case '1':
            tokenType = 'CRNY';
            balance = userWallet.balances.crny;
            break;
        case '2':
            tokenType = 'FNC';
            balance = userWallet.balances.fnc;
            break;
        case '3':
            tokenType = 'CRFN';
            balance = userWallet.balances.crfn;
            break;
        default:
            alert('잘못된 선택입니다');
            return;
    }
    
    const amount = prompt(`${recipientEmail}에게 전송할 ${tokenType} 수량:\n(잔액: ${balance})`);
    if (!amount) return;
    
    await sendTokensByEmail(recipientEmail, parseFloat(amount), tokenType);
}

async function sendTokensByEmail(recipientEmail, amount, tokenType = 'CRNY') {
    if (!userWallet) return;
    
    const tokenKey = tokenType.toLowerCase();
    const balance = userWallet.balances[tokenKey];
    
    if (amount <= 0 || amount > balance) {
        alert(`잔액이 부족하거나 잘못된 수량입니다\n잔액: ${balance} ${tokenType}`);
        return;
    }
    
    const users = await db.collection('users').where('email', '==', recipientEmail).get();
    
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const recipientDoc = users.docs[0];
    const recipient = recipientDoc.data();
    
    await db.collection('users').doc(currentUser.uid).update({
        [`balances.${tokenKey}`]: balance - amount
    });
    
    await db.collection('users').doc(recipientDoc.id).update({
        [`balances.${tokenKey}`]: recipient.balances[tokenKey] + amount
    });
    
    await db.collection('transactions').add({
        from: currentUser.uid,
        to: recipientDoc.id,
        amount: amount,
        token: tokenType,
        timestamp: new Date()
    });
    
    alert(`✅ ${amount} ${tokenType} 전송 완료!`);
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
