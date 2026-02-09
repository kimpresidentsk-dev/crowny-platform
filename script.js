// State
let state = {
    wallet: null,
    credits: 0,
    crownyBalance: 10000,
    maticBalance: 100,
    tradeType: 'buy',
    currentChat: null,
    posts: []
};

// Navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        const navItem = document.querySelector(`[onclick="showPage('${pageId}')"]`);
        if (navItem) navItem.classList.add('active');
    }
}

// Wallet
async function connectWallet() {
    try {
        if (typeof window.ethereum !== 'undefined') {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            state.wallet = accounts[0];
            
            // Switch to Polygon
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x89' }],
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x89',
                            chainName: 'Polygon',
                            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                            rpcUrls: ['https://polygon-rpc.com'],
                            blockExplorerUrls: ['https://polygonscan.com/']
                        }]
                    });
                }
            }
            
            updateWalletUI();
            alert('Wallet connected!');
        } else {
            state.wallet = '0x' + Math.random().toString(36).substr(2, 40);
            updateWalletUI();
            alert('Demo Mode - Install MetaMask for real blockchain features');
        }
    } catch (error) {
        console.error(error);
    }
}

function updateWalletUI() {
    document.getElementById('wallet-disconnected').style.display = 'none';
    document.getElementById('wallet-connected').style.display = 'block';
    document.getElementById('wallet-address').textContent = 
        state.wallet.slice(0, 6) + '...' + state.wallet.slice(-4);
    document.getElementById('crowny-balance').textContent = state.crownyBalance;
    document.getElementById('matic-balance').textContent = state.maticBalance.toFixed(4);
}

// Credit
function buyProduct(credits, price) {
    if (!state.wallet) {
        alert('Please connect wallet first!');
        showPage('wallet');
        return;
    }
    
    state.credits += credits;
    state.crownyBalance += credits;
    
    document.getElementById('user-credits').textContent = state.credits;
    document.getElementById('crowny-balance').textContent = state.crownyBalance;
    
    alert(`Purchase successful!\n+${credits} CROWNY credits\nPrice: ₩${price.toLocaleString()}`);
}

// Trading
function setTradeType(type) {
    state.tradeType = type;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function executeTrade() {
    if (!state.wallet) {
        alert('Connect wallet first!');
        return;
    }
    
    const amount = parseFloat(document.getElementById('trade-amount').value);
    if (!amount || amount <= 0) {
        alert('Enter valid amount');
        return;
    }
    
    const price = 0.0235;
    const cost = amount * price;
    
    if (state.tradeType === 'buy') {
        if (cost > state.maticBalance) {
            alert('Insufficient MATIC!');
            return;
        }
        state.maticBalance -= cost;
        state.crownyBalance += amount;
        alert(`Bought ${amount} CROWNY for ${cost.toFixed(4)} MATIC`);
    } else {
        if (amount > state.crownyBalance) {
            alert('Insufficient CROWNY!');
            return;
        }
        state.crownyBalance -= amount;
        state.maticBalance += cost;
        alert(`Sold ${amount} CROWNY for ${cost.toFixed(4)} MATIC`);
    }
    
    document.getElementById('trade-crowny').textContent = state.crownyBalance.toFixed(2);
    document.getElementById('trade-matic').textContent = state.maticBalance.toFixed(4);
    document.getElementById('trade-amount').value = '';
}

// Trade amount input
document.addEventListener('DOMContentLoaded', () => {
    const tradeInput = document.getElementById('trade-amount');
    if (tradeInput) {
        tradeInput.addEventListener('input', function() {
            const amount = parseFloat(this.value) || 0;
            const total = amount * 0.0235;
            document.getElementById('trade-total').textContent = total.toFixed(6);
        });
    }
});

// Messenger
function openChat(userId) {
    state.currentChat = userId;
    document.getElementById('chat-username').textContent = 'User ' + userId;
    document.getElementById('chat-messages').innerHTML = '<p style="color:var(--accent);">Start chatting...</p>';
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    const messagesDiv = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.style.cssText = 'background:var(--bg); padding:0.8rem; border-radius:8px; margin-bottom:0.5rem;';
    messageEl.textContent = message;
    
    messagesDiv.appendChild(messageEl);
    input.value = '';
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Social
function createPost() {
    const textarea = document.getElementById('post-text');
    const content = textarea.value.trim();
    
    if (!content) return;
    
    const post = {
        id: Date.now(),
        user: 'You',
        content: content,
        likes: 0,
        time: 'Just now'
    };
    
    state.posts.unshift(post);
    
    const feed = document.getElementById('social-feed');
    const postEl = document.createElement('div');
    postEl.className = 'post';
    postEl.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">👤</div>
            <div class="post-info">
                <strong>${post.user}</strong>
                <span>${post.time}</span>
            </div>
        </div>
        <div class="post-content">
            <p>${post.content}</p>
        </div>
        <div class="post-actions">
            <button onclick="likePost(${post.id})">❤️ Like (${post.likes})</button>
            <button>💬 Comment</button>
            <button>🔗 Share</button>
        </div>
    `;
    
    feed.insertBefore(postEl, feed.firstChild);
    textarea.value = '';
}

function likePost(postId) {
    const post = state.posts.find(p => p.id === postId);
    if (post) {
        post.likes++;
        alert('Liked!');
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    showPage('today');
    console.log('CROWNY Platform Ready');
});
