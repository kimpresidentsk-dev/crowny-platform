// State
let state = {
    wallet: null,
    web3: null,
    credits: 0,
    balances: {
        crny: 0,
        fnc: 0,
        crfn: 0,
        matic: 0
    },
    tradeType: 'buy',
    currentChat: null,
    posts: []
};

// ERC-20 ABI (minimal for balance check)
const ERC20_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    }
];

// Mobile Menu
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

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
    
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

// Wallet Connection
async function connectMetaMask() {
    try {
        if (typeof window.ethereum === 'undefined') {
            alert('MetaMask를 설치해주세요: https://metamask.io');
            return;
        }
        
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        state.wallet = accounts[0];
        state.web3 = new Web3(window.ethereum);
        
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
                        chainName: 'Polygon Mainnet',
                        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                        rpcUrls: ['https://polygon-rpc.com'],
                        blockExplorerUrls: ['https://polygonscan.com/']
                    }]
                });
            }
        }
        
        await loadBalances();
        updateWalletUI();
        
        alert('✅ MetaMask 연결 성공!\nPolygon 네트워크에 연결되었습니다.');
        
    } catch (error) {
        console.error(error);
        alert('연결 실패. 다시 시도해주세요.');
    }
}

async function loadBalances() {
    if (!state.web3 || !state.wallet) return;
    
    try {
        const config = window.THIRDWEB_CONFIG;
        
        // MATIC Balance
        const maticWei = await state.web3.eth.getBalance(state.wallet);
        state.balances.matic = parseFloat(state.web3.utils.fromWei(maticWei, 'ether'));
        
        // CRNY Balance
        const crnyContract = new state.web3.eth.Contract(ERC20_ABI, config.contracts.CRNY);
        const crnyBalance = await crnyContract.methods.balanceOf(state.wallet).call();
        const crnyDecimals = await crnyContract.methods.decimals().call();
        state.balances.crny = parseFloat(crnyBalance) / Math.pow(10, crnyDecimals);
        
        // FNC Balance
        const fncContract = new state.web3.eth.Contract(ERC20_ABI, config.contracts.FNC);
        const fncBalance = await fncContract.methods.balanceOf(state.wallet).call();
        const fncDecimals = await fncContract.methods.decimals().call();
        state.balances.fnc = parseFloat(fncBalance) / Math.pow(10, fncDecimals);
        
        // CRFN Balance
        const crfnContract = new state.web3.eth.Contract(ERC20_ABI, config.contracts.CRFN);
        const crfnBalance = await crfnContract.methods.balanceOf(state.wallet).call();
        const crfnDecimals = await crfnContract.methods.decimals().call();
        state.balances.crfn = parseFloat(crfnBalance) / Math.pow(10, crfnDecimals);
        
        updateBalanceUI();
        
    } catch (error) {
        console.error('Balance load error:', error);
    }
}

function updateBalanceUI() {
    document.getElementById('crny-balance').textContent = state.balances.crny.toFixed(2);
    document.getElementById('fnc-balance').textContent = state.balances.fnc.toFixed(2);
    document.getElementById('crfn-balance').textContent = state.balances.crfn.toFixed(2);
    document.getElementById('matic-balance').textContent = state.balances.matic.toFixed(4);
    
    // Update trading balances if on trading page
    const tradeCrowny = document.getElementById('trade-crowny');
    const tradeMatic = document.getElementById('trade-matic');
    if (tradeCrowny) tradeCrowny.textContent = state.balances.crny.toFixed(2);
    if (tradeMatic) tradeMatic.textContent = state.balances.matic.toFixed(4);
}

async function connectCoinbase() {
    alert('Coinbase Wallet 연동 준비 중입니다.\n현재는 MetaMask를 사용해주세요.');
}

async function connectWalletConnect() {
    alert('WalletConnect 연동 준비 중입니다.\n현재는 MetaMask를 사용해주세요.');
}

function disconnectWallet() {
    state.wallet = null;
    state.web3 = null;
    state.balances = { crny: 0, fnc: 0, crfn: 0, matic: 0 };
    
    document.getElementById('wallet-connected').style.display = 'none';
    document.getElementById('wallet-disconnected').style.display = 'block';
    
    alert('지갑 연결이 해제되었습니다.');
}

function showSendForm() {
    alert('전송 기능 준비 중입니다.');
}

function showSwapForm() {
    alert('스왑 기능 준비 중입니다.\nCRNY ↔ FNC ↔ CRFN 교환 가능');
}

function showReceiveForm() {
    if (!state.wallet) return;
    alert('받기 주소:\n\n' + state.wallet + '\n\n위 주소로 토큰을 전송받을 수 있습니다.');
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

// Credit
function buyProduct(credits, price) {
    if (!state.wallet) {
        alert('먼저 지갑을 연결해주세요!');
        showPage('wallet');
        return;
    }
    
    state.credits += credits;
    state.balances.crny += credits;
    
    document.getElementById('user-credits').textContent = state.credits;
    updateBalanceUI();
    
    alert(`구매 성공!\n+${credits} CRNY 크레딧 적립\n가격: ₩${price.toLocaleString()}`);
}

// Trading
function setTradeType(type) {
    state.tradeType = type;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function executeTrade() {
    if (!state.wallet) {
        alert('지갑을 먼저 연결해주세요!');
        return;
    }
    
    const amount = parseFloat(document.getElementById('trade-amount').value);
    if (!amount || amount <= 0) {
        alert('올바른 수량을 입력하세요');
        return;
    }
    
    const price = 0.0235;
    const cost = amount * price;
    
    if (state.tradeType === 'buy') {
        if (cost > state.balances.matic) {
            alert('MATIC 잔액이 부족합니다!');
            return;
        }
        state.balances.matic -= cost;
        state.balances.crny += amount;
        alert(`${amount} CRNY 구매 완료!`);
    } else {
        if (amount > state.balances.crny) {
            alert('CRNY 잔액이 부족합니다!');
            return;
        }
        state.balances.crny -= amount;
        state.balances.matic += cost;
        alert(`${amount} CRNY 판매 완료!`);
    }
    
    updateBalanceUI();
    document.getElementById('trade-amount').value = '';
}
