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

// ========== MULTI-WALLET SYSTEM ==========
let currentWalletId = null;
let allWallets = [];

// Load User Wallet
async function loadUserWallet() {
    if (!currentUser) return;
    
    // Load all wallets
    const walletsSnapshot = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').get();
    
    allWallets = [];
    walletsSnapshot.forEach(doc => {
        allWallets.push({ id: doc.id, ...doc.data() });
    });
    
    // If no wallets, create first one
    if (allWallets.length === 0) {
        await createFirstWallet();
        return;
    }
    
    // Load wallet selector
    const selector = document.getElementById('wallet-selector');
    selector.innerHTML = '';
    
    allWallets.forEach((wallet, index) => {
        const option = document.createElement('option');
        option.value = wallet.id;
        const type = wallet.isImported ? '📥' : '🏠';
        const name = wallet.name || `지갑 ${index + 1}`;
        const addr = wallet.walletAddress.slice(0, 6) + '...' + wallet.walletAddress.slice(-4);
        option.textContent = `${type} ${name} (${addr})`;
        selector.appendChild(option);
    });
    
    // Load first wallet or previously selected
    currentWalletId = allWallets[0].id;
    displayCurrentWallet();
}

async function createFirstWallet() {
    const web3 = new Web3();
    const newAccount = web3.eth.accounts.create();
    
    const walletRef = await db.collection('users').doc(currentUser.uid)
        .collection('wallets').add({
            name: '크라우니 지갑 1',
            walletAddress: newAccount.address,
            privateKey: newAccount.privateKey,
            isImported: false,
            totalGasSubsidy: 0,
            createdAt: new Date()
        });
    
    currentWalletId = walletRef.id;
    await loadUserWallet();
}

async function switchWallet() {
    const selector = document.getElementById('wallet-selector');
    currentWalletId = selector.value;
    await displayCurrentWallet();
}

async function displayCurrentWallet() {
    const wallet = allWallets.find(w => w.id === currentWalletId);
    if (!wallet) return;
    
    userWallet = wallet;
    
    const addr = wallet.walletAddress;
    document.getElementById('wallet-address').textContent = 
        addr.slice(0, 6) + '...' + addr.slice(-4);
    document.getElementById('wallet-address-full').textContent = addr;
    
    // Polygonscan link
    document.getElementById('polygonscan-link').href = 
        `https://polygonscan.com/address/${addr}`;
    
    // Wallet type
    const walletType = wallet.isImported ? '📥 외부 지갑' : '🏠 크라우니 지갑';
    document.getElementById('wallet-type').textContent = walletType;
    
    // Gas subsidy info (only for Crowny wallets)
    if (!wallet.isImported) {
        document.getElementById('gas-subsidy-info').style.display = 'block';
        const totalGas = wallet.totalGasSubsidy || 0;
        document.getElementById('total-gas-subsidy').textContent = totalGas.toFixed(4);
    } else {
        document.getElementById('gas-subsidy-info').style.display = 'none';
    }
    
    // Load balances
    if (!wallet.balances) {
        userWallet.balances = { crny: 0, fnc: 0, crfn: 0 };
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({ balances: { crny: 0, fnc: 0, crfn: 0 } });
    }
    
    await loadRealBalances();
    updateBalances();
}

function showAddWalletModal() {
    const choice = prompt('지갑 추가:\n1. 새 크라우니 지갑 생성\n2. 외부 지갑 가져오기\n\n번호를 입력하세요:');
    
    if (choice === '1') {
        createNewWallet();
    } else if (choice === '2') {
        showImportWallet();
    }
}

function showImportWallet() {
    const name = prompt('지갑 이름:') || '외부 지갑';
    const privateKey = prompt('개인키를 입력하세요:\n(0x로 시작하는 64자리)');
    if (!privateKey) return;
    
    try {
        const web3 = new Web3();
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        
        const confirm = window.confirm(
            `이 지갑을 추가하시겠습니까?\n\n` +
            `이름: ${name}\n` +
            `주소: ${account.address}\n\n` +
            `⚠️ 외부 지갑은 가스비가 자동 차감됩니다.`
        );
        
        if (confirm) {
            importExternalWallet(name, privateKey, account.address);
        }
    } catch (error) {
        alert('잘못된 개인키입니다');
    }
}

async function importExternalWallet(name, privateKey, address) {
    try {
        const walletRef = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').add({
                name: name,
                walletAddress: address,
                privateKey: privateKey,
                isImported: true,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                importedAt: new Date()
            });
        
        alert('✅ 외부 지갑 추가 완료!');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Import error:', error);
        alert('지갑 추가 실패: ' + error.message);
    }
}

async function createNewWallet() {
    try {
        const name = prompt('지갑 이름:') || `크라우니 지갑 ${allWallets.length + 1}`;
        
        const web3 = new Web3();
        const newAccount = web3.eth.accounts.create();
        
        const walletRef = await db.collection('users').doc(currentUser.uid)
            .collection('wallets').add({
                name: name,
                walletAddress: newAccount.address,
                privateKey: newAccount.privateKey,
                isImported: false,
                totalGasSubsidy: 0,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
        
        alert('✅ 새 지갑 생성 완료!');
        currentWalletId = walletRef.id;
        await loadUserWallet();
    } catch (error) {
        console.error('Create wallet error:', error);
        alert('지갑 생성 실패: ' + error.message);
    }
}

async function deleteCurrentWallet() {
    if (allWallets.length === 1) {
        alert('마지막 지갑은 삭제할 수 없습니다.');
        return;
    }
    
    const wallet = allWallets.find(w => w.id === currentWalletId);
    const confirm = window.confirm(
        `지갑을 삭제하시겠습니까?\n\n` +
        `${wallet.name}\n` +
        `${wallet.walletAddress}\n\n` +
        `⚠️ 이 작업은 되돌릴 수 없습니다!`
    );
    
    if (!confirm) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).delete();
        
        alert('✅ 지갑 삭제 완료!');
        await loadUserWallet();
    } catch (error) {
        console.error('Delete error:', error);
        alert('지갑 삭제 실패: ' + error.message);
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
        
        // Contract addresses
        const CRNY = '0xe56173b6a57680286253566B9C80Fcc175c88bE1';
        const FNC = '0x68E3aA1049F583C2f1701fefc4443e398ebF32ee';
        const CRFN = '0x396DAd0C7625a4881cA0cd444Cd80A9bbce4A054';
        
        console.log('Loading balances for:', address);
        
        // CRNY
        const crnyContract = new web3.eth.Contract(ERC20_ABI, CRNY);
        const crnyBalance = await crnyContract.methods.balanceOf(address).call();
        userWallet.balances.crny = parseFloat(crnyBalance) / 1e18;
        console.log('CRNY:', userWallet.balances.crny);
        
        // FNC
        const fncContract = new web3.eth.Contract(ERC20_ABI, FNC);
        const fncBalance = await fncContract.methods.balanceOf(address).call();
        userWallet.balances.fnc = parseFloat(fncBalance) / 1e18;
        console.log('FNC:', userWallet.balances.fnc);
        
        // CRFN
        const crfnContract = new web3.eth.Contract(ERC20_ABI, CRFN);
        const crfnBalance = await crfnContract.methods.balanceOf(address).call();
        userWallet.balances.crfn = parseFloat(crfnBalance) / 1e18;
        console.log('CRFN:', userWallet.balances.crfn);
        
        // Update Firestore wallet subcollection
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId).update({
                'balances.crny': userWallet.balances.crny,
                'balances.fnc': userWallet.balances.fnc,
                'balances.crfn': userWallet.balances.crfn
            });
        
        console.log('✅ Real balances loaded:', userWallet.balances);
    } catch (error) {
        console.error('❌ Balance load error:', error);
        alert('잔액 조회 실패: ' + error.message);
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
    contactList.innerHTML = '<p style="padding:1rem; text-align:center;">📋 로딩 중...</p>';
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    contactList.innerHTML = '';
    
    if (contacts.empty) {
        contactList.innerHTML = `
            <div style="text-align:center; padding:3rem; color:var(--accent);">
                <p style="font-size:3rem; margin-bottom:1rem;">👥</p>
                <p style="font-size:1.1rem; margin-bottom:0.5rem;">연락처가 없습니다</p>
                <p style="font-size:0.85rem; margin-bottom:1.5rem;">첫 연락처를 추가해보세요!</p>
                <button onclick="showAddContact()" class="btn-primary">➕ 연락처 추가</button>
            </div>
        `;
        return;
    }
    
    for (const doc of contacts.docs) {
        const contact = doc.data();
        
        // Get wallet address
        const users = await db.collection('users').where('email', '==', contact.email).get();
        let walletAddr = '';
        if (!users.empty) {
            const userData = users.docs[0].data();
            if (userData.walletAddress) {
                const addr = userData.walletAddress;
                walletAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
            }
        }
        
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.innerHTML = `
            <div class="chat-avatar">👤</div>
            <div class="contact-info">
                <strong style="font-size:0.95rem;">${contact.name}</strong>
                <p style="font-size:0.75rem; margin:0.2rem 0;">${contact.email}</p>
                ${walletAddr ? `<p style="font-size:0.7rem; color:var(--accent); margin:0;">💳 ${walletAddr}</p>` : ''}
            </div>
            <button onclick='startChatWithContact("${contact.email}")' class="btn-chat">채팅</button>
        `;
        contactList.appendChild(contactItem);
    }
}

async function startChatWithContact(email) {
    try {
        await startNewChat(email);
        
        // Switch to chats tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('chats-view').style.display = 'block';
        document.getElementById('contacts-view').style.display = 'none';
        
        // Show messenger page
        showPage('messenger');
    } catch (error) {
        console.error('Chat start error:', error);
        alert('채팅 시작 실패');
    }
}

function showNewChatModal() {
    const email = prompt('채팅할 사용자 이메일:');
    if (!email) return;
    startNewChat(email);
}

async function startNewChat(otherEmail) {
    try {
        console.log('Starting chat with:', otherEmail);
        
        if (otherEmail === currentUser.email) {
            alert('자기 자신과는 채팅할 수 없습니다');
            return;
        }
        
        const users = await db.collection('users').where('email', '==', otherEmail).get();
        console.log('Found users:', users.size);
        
        if (users.empty) {
            alert('사용자를 찾을 수 없습니다');
            return;
        }
        
        const otherUser = users.docs[0];
        const otherId = otherUser.id;
        console.log('Other user ID:', otherId);
        
        // Check if chat exists
        const existingChat = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .get();
        
        console.log('Existing chats:', existingChat.size);
        
        let chatId = null;
        
        for (const doc of existingChat.docs) {
            const chat = doc.data();
            if (chat.participants.includes(otherId)) {
                chatId = doc.id;
                console.log('Found existing chat:', chatId);
                break;
            }
        }
        
        // Create new chat if not exists
        if (!chatId) {
            console.log('Creating new chat...');
            const newChat = await db.collection('chats').add({
                participants: [currentUser.uid, otherId],
                otherEmail: otherEmail,
                myEmail: currentUser.email,
                lastMessage: '',
                lastMessageTime: new Date(),
                createdAt: new Date()
            });
            chatId = newChat.id;
            console.log('Created chat:', chatId);
        }
        
        await loadMessages();
        await openChat(chatId, otherId);
        console.log('Chat opened successfully');
    } catch (error) {
        console.error('Start chat error:', error);
        alert('채팅 시작 실패: ' + error.message);
    }
}

async function loadMessages() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    const chats = await db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    if (chats.empty) {
        chatList.innerHTML = '<p style="padding:1rem; color:var(--accent);">채팅을 시작하세요</p>';
        return;
    }
    
    // Sort manually
    const chatDocs = chats.docs.sort((a, b) => {
        const aTime = a.data().lastMessageTime?.toMillis() || 0;
        const bTime = b.data().lastMessageTime?.toMillis() || 0;
        return bTime - aTime;
    });
    
    for (const doc of chatDocs) {
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
    const otherEmail = otherUser.data().email;
    document.getElementById('chat-username').textContent = otherEmail;
    
    // Show chat window
    document.querySelector('.chat-window').style.display = 'flex';
    
    // Real-time listener
    db.collection('chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .onSnapshot(snapshot => {
            const messagesDiv = document.getElementById('chat-messages');
            messagesDiv.innerHTML = '';
            
            if (snapshot.empty) {
                messagesDiv.innerHTML = '<p style="text-align:center; color:var(--accent); padding:2rem;">메시지를 보내보세요!</p>';
            }
            
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
    
    console.log('Chat opened:', chatId, 'with', otherEmail);
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
        alert(`잔액이 부족하거나 잘못된 수량입니다\n잔액: ${userWallet.balances.crny} CRNY`);
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
    feed.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--accent);">📸 게시물 로딩 중...</p>';
    
    try {
        const posts = await db.collection('posts')
            .limit(50)
            .get();
        
        // Sort manually
        const sortedPosts = posts.docs.sort((a, b) => {
            const aTime = a.data().timestamp?.toMillis() || 0;
            const bTime = b.data().timestamp?.toMillis() || 0;
            return bTime - aTime;
        });
        
        feed.innerHTML = '';
        
        if (sortedPosts.length === 0) {
            feed.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;">📝</p>
                    <p style="font-size:1.2rem; margin-bottom:0.5rem;">아직 게시물이 없습니다</p>
                    <p style="font-size:0.9rem;">첫 게시물을 작성해보세요!</p>
                </div>
            `;
            return;
        }
        
        for (const doc of sortedPosts) {
            const post = doc.data();
            
            // Get user info
            const userDoc = await db.collection('users').doc(post.userId).get();
            const userData = userDoc.exists ? userDoc.data() : { email: '알 수 없음' };
            const userName = userData.nickname || userData.displayName || userData.email;
            
            const timeAgo = getTimeAgo(post.timestamp.toDate());
            
            // Likes display
            const likedByMe = post.likedBy && post.likedBy.includes(currentUser.uid);
            const likeCount = post.likes || 0;
            const likeButton = likedByMe ? '❤️' : '🤍';
            
            const postEl = document.createElement('div');
            postEl.className = 'post';
            postEl.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar">👤</div>
                    <div class="post-info">
                        <strong>${userName}</strong>
                        <span>${timeAgo}</span>
                    </div>
                </div>
                <div class="post-content">
                    <p>${post.text}</p>
                    ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:8px; margin-top:0.5rem;">` : ''}
                </div>
                <div class="post-actions">
                    <button onclick="toggleLike('${doc.id}', ${likedByMe})">${likeButton} ${likeCount}</button>
                    <button onclick="showLikedUsers('${doc.id}')">👥 좋아요</button>
                    <button onclick="toggleComments('${doc.id}')">💬 댓글 ${(post.commentCount || 0)}</button>
                </div>
                <div id="comments-${doc.id}" style="display:none; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border);">
                    <div id="comment-list-${doc.id}"></div>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        <input type="text" id="comment-input-${doc.id}" placeholder="댓글 입력..." style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:6px;">
                        <button onclick="addComment('${doc.id}')" class="btn-primary" style="padding:0.5rem 1rem;">작성</button>
                    </div>
                </div>
            `;
            feed.appendChild(postEl);
        }
    } catch (error) {
        console.error('Feed load error:', error);
        feed.innerHTML = `
            <div style="text-align:center; padding:3rem;">
                <p style="font-size:2rem; margin-bottom:1rem;">⚠️</p>
                <p style="color:red; margin-bottom:0.5rem;">로딩 실패</p>
                <p style="font-size:0.85rem; color:var(--accent);">${error.message}</p>
                <button onclick="loadSocialFeed()" class="btn-primary" style="margin-top:1rem;">다시 시도</button>
            </div>
        `;
    }
}

async function toggleLike(postId, isLiked) {
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const data = post.data();
    
    let likedBy = data.likedBy || [];
    let likes = data.likes || 0;
    
    if (isLiked) {
        likedBy = likedBy.filter(uid => uid !== currentUser.uid);
        likes = Math.max(0, likes - 1);
    } else {
        likedBy.push(currentUser.uid);
        likes += 1;
    }
    
    await postRef.update({ likedBy, likes });
    loadSocialFeed();
}

async function showLikedUsers(postId) {
    const post = await db.collection('posts').doc(postId).get();
    const data = post.data();
    const likedBy = data.likedBy || [];
    
    if (likedBy.length === 0) {
        alert('아직 좋아요가 없습니다');
        return;
    }
    
    let message = '좋아요 한 사람:\n\n';
    for (const uid of likedBy) {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const userName = userData.nickname || userData.displayName || userData.email;
        message += `👤 ${userName}\n`;
    }
    
    alert(message);
}

async function toggleComments(postId) {
    const commentsDiv = document.getElementById(`comments-${postId}`);
    
    if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        await loadComments(postId);
    } else {
        commentsDiv.style.display = 'none';
    }
}

async function loadComments(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    commentList.innerHTML = '<p style="text-align:center; color:var(--accent);">로딩 중...</p>';
    
    const comments = await db.collection('posts').doc(postId)
        .collection('comments')
        .orderBy('timestamp', 'asc')
        .get();
    
    commentList.innerHTML = '';
    
    if (comments.empty) {
        commentList.innerHTML = '<p style="text-align:center; color:var(--accent); font-size:0.85rem;">첫 댓글을 남겨보세요!</p>';
        return;
    }
    
    for (const doc of comments.docs) {
        const comment = doc.data();
        const userDoc = await db.collection('users').doc(comment.userId).get();
        const userData = userDoc.data();
        const userName = userData.nickname || userData.displayName || userData.email;
        
        const commentEl = document.createElement('div');
        commentEl.style.cssText = 'padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem;';
        commentEl.innerHTML = `
            <strong style="font-size:0.85rem;">${userName}</strong>
            <p style="margin:0.3rem 0 0 0; font-size:0.9rem;">${comment.text}</p>
            <span style="font-size:0.75rem; color:var(--accent);">${getTimeAgo(comment.timestamp.toDate())}</span>
        `;
        commentList.appendChild(commentEl);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    
    if (!text) return;
    
    await db.collection('posts').doc(postId).collection('comments').add({
        userId: currentUser.uid,
        text: text,
        timestamp: new Date()
    });
    
    // Update comment count
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    await postRef.update({
        commentCount: (post.data().commentCount || 0) + 1
    });
    
    input.value = '';
    await loadComments(postId);
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
    const fileInput = document.getElementById('post-image');
    const text = textarea.value.trim();
    
    if (!text && !fileInput.files[0]) {
        alert('내용 또는 이미지를 입력하세요');
        return;
    }
    
    try {
        let imageUrl = null;
        
        // Upload image if exists
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            imageUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        
        await db.collection('posts').add({
            userId: currentUser.uid,
            text: text,
            imageUrl: imageUrl,
            likes: 0,
            likedBy: [],
            commentCount: 0,
            timestamp: new Date()
        });
        
        textarea.value = '';
        fileInput.value = '';
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
let selectedToken = null;

function selectToken(tokenType) {
    selectedToken = tokenType;
    
    // Remove all selected classes
    document.querySelectorAll('.token-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class
    document.getElementById(`token-card-${tokenType}`).classList.add('selected');
    
    console.log('Selected token:', tokenType.toUpperCase());
}

async function showSendModal() {
    if (!selectedToken) {
        alert('전송할 토큰을 먼저 선택하세요');
        return;
    }
    
    const tokenType = selectedToken.toUpperCase();
    const balance = userWallet.balances[selectedToken];
    
    const contacts = await db.collection('users').doc(currentUser.uid)
        .collection('contacts').get();
    
    if (contacts.empty) {
        const email = prompt('받는 사람 이메일:');
        if (!email) return;
        
        const amount = prompt(`${email}에게 전송할 ${tokenType} 수량:\n(잔액: ${balance})`);
        if (!amount) return;
        
        await sendTokensByEmail(email, parseFloat(amount), tokenType);
    } else {
        // Get wallet addresses for contacts
        let contactList = `${tokenType} 전송 - 받는 사람 선택:\n\n`;
        const contactsArray = [];
        
        for (const doc of contacts.docs) {
            const contact = doc.data();
            
            // Get user's wallet address
            const users = await db.collection('users').where('email', '==', contact.email).get();
            let walletAddr = '';
            if (!users.empty) {
                const userData = users.docs[0].data();
                if (userData.walletAddress) {
                    const addr = userData.walletAddress;
                    walletAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                }
            }
            
            contactsArray.push({...contact, walletAddr});
            contactList += `${contactsArray.length}. ${contact.name}\n`;
            contactList += `   ${contact.email}\n`;
            if (walletAddr) {
                contactList += `   지갑: ${walletAddr}\n`;
            }
            contactList += `\n`;
        }
        
        contactList += `0. 직접 입력\n\n번호:`;
        
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
        
        const amount = prompt(`${recipientEmail}에게 전송할 ${tokenType} 수량:\n(잔액: ${balance})`);
        if (!amount) return;
        
        await sendTokensByEmail(recipientEmail, parseFloat(amount), tokenType);
    }
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
    
    try {
        // Check if Crowny wallet (gas subsidy) or external wallet
        if (userWallet.isImported) {
            alert('⚠️ 외부 지갑은 가스비가 차감됩니다.\n지갑에 MATIC이 충분한지 확인하세요.');
            // TODO: Implement actual blockchain transfer with user's gas
            alert('외부 지갑 전송은 곧 지원됩니다.');
            return;
        }
        
        // Crowny wallet - Admin gas subsidy
        const gasEstimate = 0.001; // Estimated MATIC for transfer
        
        alert(`⏳ 전송 요청 중...\n가스비 ${gasEstimate} MATIC은 관리자가 대납합니다.`);
        
        // Request admin-sponsored transfer
        await db.collection('transfer_requests').add({
            from: currentUser.uid,
            fromEmail: currentUser.email,
            fromAddress: userWallet.walletAddress,
            to: recipientDoc.id,
            toEmail: recipientEmail,
            toAddress: recipient.walletAddress,
            amount: amount,
            token: tokenType,
            estimatedGas: gasEstimate,
            status: 'pending',
            requestedAt: new Date()
        });
        
        alert(`✅ 전송 요청 완료!\n\n관리자가 처리 후:\n- ${amount} ${tokenType} 전송\n- 가스비 ${gasEstimate} MATIC 대납 기록`);
        
        console.log('Transfer requested:', {
            from: currentUser.email,
            to: recipientEmail,
            amount: amount,
            token: tokenType,
            gas: gasEstimate
        });
        
    } catch (error) {
        console.error('❌ Transfer request error:', error);
        alert('전송 요청 실패: ' + error.message);
    }
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

// ========== ADMIN FUNCTIONS ==========
async function loadTransferRequests() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') return;
    
    const requests = await db.collection('transfer_requests')
        .where('status', '==', 'pending')
        .orderBy('requestedAt', 'desc')
        .get();
    
    console.log('Transfer requests:', requests.size);
    
    requests.forEach(doc => {
        const req = doc.data();
        console.log(`Request: ${req.fromEmail} → ${req.toEmail}: ${req.amount} ${req.token}`);
    });
}

async function adminMintTokens() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') {
        alert('관리자만 사용 가능합니다');
        return;
    }
    
    const email = document.getElementById('admin-recipient')?.value;
    const token = document.getElementById('admin-token')?.value || 'CRNY';
    const amount = parseFloat(document.getElementById('admin-amount')?.value || 0);
    
    if (!email || amount <= 0) {
        alert('이메일과 수량을 입력하세요');
        return;
    }
    
    const users = await db.collection('users').where('email', '==', email).get();
    
    if (users.empty) {
        alert('사용자를 찾을 수 없습니다');
        return;
    }
    
    const userDoc = users.docs[0];
    const userData = userDoc.data();
    const tokenKey = token.toLowerCase();
    
    await db.collection('users').doc(userDoc.id).update({
        [`balances.${tokenKey}`]: userData.balances[tokenKey] + amount
    });
    
    await db.collection('transactions').add({
        from: 'admin',
        to: userDoc.id,
        amount: amount,
        token: token,
        type: 'mint',
        timestamp: new Date()
    });
    
    alert(`✅ ${amount} ${token} 발급 완료!`);
    
    if (document.getElementById('admin-recipient')) {
        document.getElementById('admin-recipient').value = '';
        document.getElementById('admin-amount').value = '';
    }
}
