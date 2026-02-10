// Cache Buster - Version 3.0 - CRNY Slot System + Risk Management
// Global State
let currentUser = null;
let userWallet = null;

// ========== CRNY SLOT SYSTEM ==========
const SLOT_TABLE = [
    { min: 1,  max: 4,  slots: 1 },
    { min: 5,  max: 6,  slots: 2 },
    { min: 7,  max: 9,  slots: 3 },
    { min: 10, max: 14, slots: 4 },
    { min: 15, max: 20, slots: 5 },
    { min: 21, max: 30, slots: 10 },
    { min: 31, max: 50, slots: 20 },
    { min: 51, max: 69, slots: 50 },
    { min: 70, max: Infinity, slots: 70 }
];

const RISK_CONFIG = {
    dailyLossLimit: -100,      // 일일 손실 한도 ($)
    cumulativeLossLimit: -2000, // 누적 손실 한도 ($)
    crnyBurnOnLiquidation: 1,  // 청산 시 소각 CRNY 개수
    tradeFeeRoundTrip: 2.00,   // 왕복 수수료 ($)
    mnqTickValue: 0.50,        // MNQ 1틱 가치 ($)
    mnqPointValue: 2,          // MNQ 1포인트 가치 ($)
    nqPointValue: 20           // NQ 1포인트 가치 ($)
};

// 슬롯 계산: CRNY 보유량 → 활성 슬롯 수
function calculateSlots(crnyBalance) {
    const balance = Math.floor(crnyBalance); // 정수 기준
    if (balance <= 0) return 0;
    
    for (const tier of SLOT_TABLE) {
        if (balance >= tier.min && balance <= tier.max) {
            return tier.slots;
        }
    }
    return 0;
}

// 슬롯 상태 UI 업데이트
function updateSlotStatusUI() {
    const crnyBalance = userWallet ? (userWallet.balances?.crny || 0) : 0;
    const slots = calculateSlots(crnyBalance);
    
    // 슬롯 패널 업데이트
    const crnyEl = document.getElementById('slot-crny-count');
    const slotsEl = document.getElementById('slot-active-count');
    const contractsEl = document.getElementById('slot-contract-count');
    const messageEl = document.getElementById('slot-status-message');
    const badgeEl = document.getElementById('slot-status-badge');
    const displayEl = document.getElementById('slot-contracts-display');
    
    if (crnyEl) crnyEl.textContent = Math.floor(crnyBalance);
    if (slotsEl) slotsEl.textContent = slots;
    if (contractsEl) contractsEl.textContent = slots;
    
    // hidden input 업데이트 (기존 호환)
    const tradeContracts = document.getElementById('trade-contracts');
    if (tradeContracts) tradeContracts.value = Math.max(slots, 1);
    
    // 슬롯 계약 수 표시
    if (displayEl) {
        displayEl.textContent = slots > 0 ? `${slots} 계약` : '0 계약';
        displayEl.style.color = slots > 0 ? '#0066cc' : '#cc0000';
    }
    
    // 상태 메시지/배지
    if (slots === 0) {
        if (messageEl) messageEl.textContent = '🔴 CRNY를 보유해야 거래할 수 있습니다';
        if (badgeEl) { badgeEl.textContent = '비활성'; badgeEl.style.background = '#ef5350'; }
    } else {
        if (messageEl) messageEl.textContent = `🟢 ${slots}슬롯 가동 중 / 보유 ${Math.floor(crnyBalance)} CRNY`;
        if (badgeEl) { badgeEl.textContent = '활성'; badgeEl.style.background = '#00c853'; }
    }
}

// ========== RISK MANAGEMENT ==========

// 일일 손실 리셋 체크 (자정 UTC 기준)
function checkDailyReset() {
    if (!myParticipation) return;
    
    const now = new Date();
    const todayUTC = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const lastReset = myParticipation.lastDailyReset || '';
    
    if (lastReset !== todayUTC) {
        // 새로운 날 → 일일 손실 리셋
        myParticipation.dailyPnL = 0;
        myParticipation.dailyLocked = false;
        myParticipation.lastDailyReset = todayUTC;
        
        // Firestore 업데이트
        if (myParticipation.challengeId && myParticipation.participantId) {
            db.collection('prop_challenges').doc(myParticipation.challengeId)
                .collection('participants').doc(myParticipation.participantId)
                .update({
                    dailyPnL: 0,
                    dailyLocked: false,
                    lastDailyReset: todayUTC
                }).catch(err => console.error('Daily reset error:', err));
        }
        
        console.log('🔄 일일 손실 리셋 (새로운 날)');
    }
}

// 리스크 게이지 UI 업데이트
function updateRiskGaugeUI() {
    if (!myParticipation) return;
    
    const dailyPnL = myParticipation.dailyPnL || 0;
    const initial = myParticipation.initialBalance || 100000;
    const current = myParticipation.currentBalance || 100000;
    const cumulativePnL = current - initial;
    
    // 일일 손실 게이지
    const dailyPercent = Math.min(Math.abs(Math.min(dailyPnL, 0)) / Math.abs(RISK_CONFIG.dailyLossLimit) * 100, 100);
    const dailyBar = document.getElementById('daily-loss-bar');
    const dailyText = document.getElementById('daily-loss-text');
    
    if (dailyBar) {
        dailyBar.style.width = dailyPercent + '%';
        dailyBar.style.background = dailyPercent >= 100 ? '#f44336' : dailyPercent >= 80 ? '#ff9800' : '#4caf50';
    }
    if (dailyText) {
        dailyText.textContent = `$${dailyPnL.toFixed(0)} / -$${Math.abs(RISK_CONFIG.dailyLossLimit)}`;
        dailyText.style.color = dailyPnL < 0 ? '#f44336' : '#4caf50';
    }
    
    // 누적 손실 게이지
    const cumulativePercent = Math.min(Math.abs(Math.min(cumulativePnL, 0)) / Math.abs(RISK_CONFIG.cumulativeLossLimit) * 100, 100);
    const cumulativeBar = document.getElementById('cumulative-loss-bar');
    const cumulativeText = document.getElementById('cumulative-loss-text');
    
    if (cumulativeBar) {
        cumulativeBar.style.width = cumulativePercent + '%';
        cumulativeBar.style.background = cumulativePercent >= 100 ? '#f44336' : cumulativePercent >= 80 ? '#ff9800' : '#4caf50';
    }
    if (cumulativeText) {
        cumulativeText.textContent = `$${cumulativePnL.toFixed(0)} / -$${Math.abs(RISK_CONFIG.cumulativeLossLimit).toLocaleString()}`;
        cumulativeText.style.color = cumulativePnL < 0 ? '#f44336' : '#4caf50';
    }
    
    // 일일 한도 경고
    const warningEl = document.getElementById('daily-limit-warning');
    if (warningEl) {
        warningEl.style.display = (myParticipation.dailyLocked) ? 'block' : 'none';
    }
    
    // 버튼 활성/비활성
    updateTradeButtonState();
}

// 거래 버튼 상태 관리
function updateTradeButtonState() {
    const locked = myParticipation && myParticipation.dailyLocked;
    const noSlots = calculateSlots(userWallet?.balances?.crny || 0) === 0;
    const disabled = locked || noSlots;
    
    const btnBuy = document.getElementById('btn-buy');
    const btnSell = document.getElementById('btn-sell');
    const btnChartBuy = document.getElementById('btn-chart-buy');
    const btnChartSell = document.getElementById('btn-chart-sell');
    
    [btnBuy, btnSell, btnChartBuy, btnChartSell].forEach(btn => {
        if (!btn) return;
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.4' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
    
    if (locked && btnBuy) {
        btnBuy.textContent = '⚠️ 거래 정지';
        btnSell.textContent = '⚠️ 거래 정지';
    } else if (btnBuy) {
        btnBuy.textContent = '📈 BUY';
        btnSell.textContent = '📉 SELL';
    }
}

// 일일 손실 체크 & 락 처리
async function checkDailyLossLimit(addedPnL) {
    if (!myParticipation) return false;
    
    myParticipation.dailyPnL = (myParticipation.dailyPnL || 0) + addedPnL;
    
    if (myParticipation.dailyPnL <= RISK_CONFIG.dailyLossLimit) {
        myParticipation.dailyLocked = true;
        
        // Firestore 업데이트
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({
                dailyPnL: myParticipation.dailyPnL,
                dailyLocked: true
            });
        
        updateRiskGaugeUI();
        alert(`🚨 일일 손실 한도 도달! (-$${Math.abs(RISK_CONFIG.dailyLossLimit)})\n\n오늘의 거래가 종료됩니다.\n내일 자정(UTC)에 자동 해제됩니다.`);
        return true; // locked
    }
    
    // Firestore에 dailyPnL만 업데이트
    await db.collection('prop_challenges').doc(myParticipation.challengeId)
        .collection('participants').doc(myParticipation.participantId)
        .update({ dailyPnL: myParticipation.dailyPnL });
    
    updateRiskGaugeUI();
    return false;
}

// 누적 청산 체크 & CRNY 소각
async function checkCumulativeLiquidation() {
    if (!myParticipation) return false;
    
    const initial = myParticipation.initialBalance || 100000;
    const current = myParticipation.currentBalance || 100000;
    const cumulativeLoss = current - initial;
    
    if (cumulativeLoss <= RISK_CONFIG.cumulativeLossLimit) {
        // CRNY 소각 처리
        const wallet = allWallets.find(w => w.id === currentWalletId);
        if (!wallet) return false;
        
        const currentCrny = wallet.balances?.crny || 0;
        const burnAmount = RISK_CONFIG.crnyBurnOnLiquidation;
        
        if (currentCrny < burnAmount) {
            // CRNY가 없으면 거래 완전 차단
            alert('🚨 CRNY가 부족하여 더 이상 거래할 수 없습니다.\nCRNY를 추가로 획득해주세요.');
            return true;
        }
        
        // Firestore에서 CRNY 차감
        const newCrny = currentCrny - burnAmount;
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({ 'balances.crny': newCrny });
        
        wallet.balances.crny = newCrny;
        userWallet.balances.crny = newCrny;
        
        // 청산 기록 저장
        await db.collection('liquidation_log').add({
            userId: currentUser.uid,
            walletId: currentWalletId,
            challengeId: myParticipation.challengeId,
            participantId: myParticipation.participantId,
            crnyBurned: burnAmount,
            reason: 'cumulative_loss',
            lossAmount: cumulativeLoss,
            remainingCrny: newCrny,
            timestamp: new Date()
        });
        
        // 누적 손실 리셋 (계좌 다시 시작)
        myParticipation.currentBalance = initial;
        myParticipation.dailyPnL = 0;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({
                currentBalance: initial,
                dailyPnL: 0
            });
        
        updateSlotStatusUI();
        updateRiskGaugeUI();
        updateTradingUI();
        
        alert(
            `💀 누적 손실 -$${Math.abs(RISK_CONFIG.cumulativeLossLimit).toLocaleString()} 도달!\n\n` +
            `🔥 CRNY ${burnAmount}개 소각됨\n` +
            `👑 남은 CRNY: ${newCrny}개\n` +
            `📊 새 슬롯: ${calculateSlots(newCrny)}개\n\n` +
            `계좌가 초기화되었습니다.`
        );
        
        return true;
    }
    
    return false;
}

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
    
    const nickname = prompt('닉네임을 입력하세요 (SNS에 표시됨):');
    if (!nickname) {
        alert('닉네임은 필수입니다');
        return;
    }
    
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // Create wallet
        const wallet = web3.eth.accounts.create();
        
        // Save to Firestore (legacy)
        await db.collection('users').doc(result.user.uid).set({
            email: email,
            nickname: nickname,
            walletAddress: wallet.address,
            privateKey: wallet.privateKey,
            balances: {
                crny: 0,
                fnc: 0,
                crfn: 0
            },
            createdAt: new Date()
        });
        
        // Create first wallet in subcollection
        await db.collection('users').doc(result.user.uid)
            .collection('wallets').add({
                name: '크라우니 지갑 1',
                walletAddress: wallet.address,
                privateKey: wallet.privateKey,
                isImported: false,
                totalGasSubsidy: 0,
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
        
        alert(`✅ 가입 완료!\n닉네임: ${nickname}\n지갑 생성 완료!`);
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
    
    // Massivescan link
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

// Load Real Balances from Massive
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
    
    // Load page-specific data
    if (pageId === 'social') {
        loadSocialFeed();
    }
    if (pageId === 'prop-trading') {
        loadPropTrading();
        loadTradingDashboard();
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

// ========== PROP TRADING ==========
async function loadPropTrading() {
    const container = document.getElementById('trading-challenges');
    container.innerHTML = '<p style="text-align:center; padding:2rem;">로딩 중...</p>';
    
    try {
        const challenges = await db.collection('prop_challenges')
            .where('status', '==', 'active')
            .get();
        
        container.innerHTML = '';
        
        if (challenges.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:3rem; color:var(--accent);">
                    <p style="font-size:3rem; margin-bottom:1rem;">📊</p>
                    <p>진행 중인 챌린지가 없습니다</p>
                </div>
            `;
            return;
        }
        
        for (const doc of challenges.docs) {
            const challenge = doc.data();
            const card = document.createElement('div');
            card.style.cssText = 'background:white; padding:1.5rem; border-radius:12px; margin-bottom:1rem; border:2px solid var(--border);';
            card.innerHTML = `
                <h3 style="margin-bottom:0.5rem;">${challenge.name}</h3>
                <p style="color:var(--accent); margin-bottom:1rem;">${challenge.description}</p>
                
                <div style="background:var(--bg); padding:1rem; border-radius:8px; margin-bottom:1rem;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; font-size:0.9rem;">
                        <div>
                            <strong>💰 계좌:</strong> $${(challenge.initialBalance || 100000).toLocaleString()}
                        </div>
                        <div>
                            <strong>📊 최대 계약:</strong> ${challenge.maxContracts || 7}개
                        </div>
                        <div>
                            <strong>📈 최대 포지션:</strong> ${challenge.maxPositions || 20}개
                        </div>
                        <div>
                            <strong>🚨 청산:</strong> -$${(challenge.maxDrawdown || 3000).toLocaleString()}
                        </div>
                        <div>
                            <strong>⏰ 정산:</strong> ${challenge.settlement || 'EOD'}
                        </div>
                        <div>
                            <strong>💎 상금:</strong> ${challenge.rewardToken || 'CRFN'} (매일)
                        </div>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; font-size:0.9rem;">
                    <div style="background:#e3f2fd; padding:0.8rem; border-radius:6px; text-align:center;">
                        <div style="font-size:0.8rem; color:var(--accent);">참가비</div>
                        <strong style="font-size:1.2rem; color:#0066cc;">${challenge.entryFee} CRNY</strong>
                    </div>
                    <div style="background:#f3e5f5; padding:0.8rem; border-radius:6px; text-align:center;">
                        <div style="font-size:0.8rem; color:var(--accent);">참가자</div>
                        <strong style="font-size:1.2rem; color:#9c27b0;">${challenge.participants || 0}명</strong>
                    </div>
                </div>
                
                <button onclick="joinChallenge('${doc.id}')" class="btn-primary" style="width:100%; padding:1rem; font-size:1.1rem;">
                    🚀 챌린지 참가
                </button>
            `;
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Load challenges error:', error);
        container.innerHTML = '<p style="text-align:center; color:red;">로딩 실패</p>';
    }
}

async function showCreateChallenge() {
    if (currentUser.email !== 'kim.president.sk@gmail.com') {
        alert('관리자만 챌린지를 생성할 수 있습니다');
        return;
    }
    
    const name = prompt('챌린지 이름:', '크라우니 프랍 트레이딩 챌린지');
    if (!name) return;
    
    try {
        await db.collection('prop_challenges').add({
            name: name,
            description: '100K 계좌로 NQ 선물 트레이딩',
            entryFee: 1, // CRNY
            initialBalance: 100000, // $100K
            maxContracts: 7, // NQ Mini 최대 7계약
            maxPositions: 20, // 셀프 카피 최대 20개
            maxDrawdown: 3000, // -$3000 청산
            settlement: 'EOD', // End of Day
            withdrawalFrequency: 'daily', // 매일 인출
            rewardToken: 'CRFN', // 상금 토큰
            targetProfit: 10, // 10% (예시)
            duration: 30, // 30일
            participants: 0,
            totalPool: 0,
            status: 'active',
            createdAt: new Date()
        });
        
        alert('✅ 챌린지 생성 완료!');
        loadPropTrading();
    } catch (error) {
        alert('생성 실패: ' + error.message);
    }
}

async function joinChallenge(challengeId) {
    const challenge = await db.collection('prop_challenges').doc(challengeId).get();
    const data = challenge.data();
    
    const wallet = allWallets.find(w => w.id === currentWalletId);
    
    if (wallet.balances.crny < data.entryFee) {
        alert(`CRNY 잔액이 부족합니다\n필요: ${data.entryFee} CRNY\n보유: ${wallet.balances.crny} CRNY`);
        return;
    }
    
    const confirm = window.confirm(
        `🎯 프랍 트레이딩 챌린지 참가\n\n` +
        `${data.name}\n\n` +
        `💰 가상 계좌: $${(data.initialBalance || 100000).toLocaleString()}\n` +
        `📊 최대 계약: ${data.maxContracts || 7}개 (NQ Mini)\n` +
        `📈 최대 포지션: ${data.maxPositions || 20}개\n` +
        `🚨 청산 기준: -$${(data.maxDrawdown || 3000).toLocaleString()}\n` +
        `⏰ 정산: ${data.settlement || 'EOD'}\n` +
        `💎 상금: ${data.rewardToken || 'CRFN'} (매일 인출)\n\n` +
        `참가비: ${data.entryFee} CRNY\n\n` +
        `✅ 참가비는 상금 풀로 이동합니다`
    );
    
    if (!confirm) return;
    
    try {
        // Get or create prop trading wallet
        let propWalletRef = await db.collection('system_wallets').doc('prop_trading').get();
        
        if (!propWalletRef.exists) {
            await db.collection('system_wallets').doc('prop_trading').set({
                name: '프랍 트레이딩 관리 지갑',
                type: 'prop_trading',
                balances: { crny: 0, fnc: 0, crfn: 0 },
                createdAt: new Date()
            });
            propWalletRef = await db.collection('system_wallets').doc('prop_trading').get();
        }
        
        const propWallet = propWalletRef.data();
        
        // Deduct from user
        await db.collection('users').doc(currentUser.uid)
            .collection('wallets').doc(currentWalletId)
            .update({
                'balances.crny': wallet.balances.crny - data.entryFee
            });
        
        // Add to prop trading wallet
        await db.collection('system_wallets').doc('prop_trading').update({
            'balances.crny': (propWallet.balances?.crny || 0) + data.entryFee
        });
        
        // Add participant
        await db.collection('prop_challenges').doc(challengeId)
            .collection('participants').add({
                userId: currentUser.uid,
                walletId: currentWalletId,
                joinedAt: new Date(),
                initialBalance: data.initialBalance || 100000,
                currentBalance: data.initialBalance || 100000,
                maxContracts: data.maxContracts || 7,
                maxPositions: data.maxPositions || 20,
                maxDrawdown: data.maxDrawdown || 3000,
                profitPercent: 0,
                dailyPnL: 0,
                totalPnL: 0,
                trades: [],
                status: 'active',
                lastEOD: new Date()
            });
        
        await db.collection('prop_challenges').doc(challengeId).update({
            participants: (data.participants || 0) + 1,
            totalPool: (data.totalPool || 0) + data.entryFee
        });
        
        // Transaction record
        await db.collection('transactions').add({
            from: currentUser.uid,
            to: 'system:prop_trading',
            amount: data.entryFee,
            token: 'CRNY',
            type: 'challenge_entry',
            challengeId: challengeId,
            timestamp: new Date()
        });
        
        alert(`✅ 챌린지 참가 완료!\n\n💰 ${data.entryFee} CRNY → 상금 풀\n💵 가상 계좌 $${(data.initialBalance || 100000).toLocaleString()} 지급\n📊 트레이딩 시작!`);
        loadUserWallet();
        loadPropTrading();
        loadTradingDashboard();
    } catch (error) {
        console.error('Join error:', error);
        alert('참가 실패: ' + error.message);
    }
}

// ========== REAL-TIME CRYPTO TRADING ==========
let currentPrice = 0;
let priceWs = null;
let myParticipation = null;

async function loadTradingDashboard() {
    // Check if user has active participation
    const challenges = await db.collection('prop_challenges')
        .where('status', '==', 'active')
        .get();
    
    for (const challengeDoc of challenges.docs) {
        const participants = await challengeDoc.ref.collection('participants')
            .where('userId', '==', currentUser.uid)
            .where('status', '==', 'active')
            .get();
        
        if (!participants.empty) {
            myParticipation = { 
                challengeId: challengeDoc.id,
                participantId: participants.docs[0].id,
                ...participants.docs[0].data() 
            };
            break;
        }
    }
    
    if (myParticipation) {
        document.getElementById('trading-dashboard').style.display = 'block';
        checkDailyReset();
        updateSlotStatusUI();
        updateRiskGaugeUI();
        updateTradingUI();
        initTradingViewChart();
        connectPriceWebSocket();
    } else {
        document.getElementById('trading-dashboard').style.display = 'none';
    }
}

function updateTradingUI() {
    if (!myParticipation) return;
    
    const balance = myParticipation.currentBalance || 10000;
    const initial = myParticipation.initialBalance || 10000;
    const profit = ((balance - initial) / initial * 100).toFixed(2);
    const positions = myParticipation.trades?.filter(t => t.status === 'open').length || 0;
    
    document.getElementById('trading-balance').textContent = `$${balance.toLocaleString()}`;
    document.getElementById('trading-profit').textContent = `${profit >= 0 ? '+' : ''}${profit}%`;
    document.getElementById('trading-profit').style.color = profit >= 0 ? '#0066cc' : '#cc0000';
    document.getElementById('trading-positions').textContent = positions;
}

function initTradingViewChart() {
    // Lightweight Charts 초기화
    const container = document.getElementById('tradingview-chart');
    
    if (!container) {
        console.error('❌ 차트 컨테이너 없음');
        return;
    }
    
    // 기존 차트 제거
    container.innerHTML = '';
    
    try {
        // 차트 생성
        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 400,
            layout: {
                background: { color: '#ffffff' },
                textColor: '#333',
            },
            grid: {
                vertLines: { color: '#f0f0f0' },
                horzLines: { color: '#f0f0f0' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#cccccc',
            },
            timeScale: {
                borderColor: '#cccccc',
                timeVisible: true,
                secondsVisible: false,
            },
        });
        
        // 캔들스틱 시리즈 추가
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
        
        // Volume 시리즈 추가
        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '',
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });
        
        // 실제 NQ 데이터 가져오기
        console.log('📡 NQ 데이터 로딩...');
        
        let candleData;
        
        // Massive 사용 여부 확인
        if (window.MASSIVE_CONFIG && window.MASSIVE_CONFIG.enabled) {
            candleData = await fetchMassiveHistory();
            
            if (candleData) {
                console.log('✅ Massive 실시간 데이터 사용');
                // WebSocket 연결
                connectMassiveRealtime();
            } else {
                candleData = await fetchRealNQData();
            }
        } else {
            candleData = await fetchRealNQData();
        }
        
        candleSeries.setData(candleData.candles);
        volumeSeries.setData(candleData.volume);
        
        // 현재 가격 업데이트
        if (candleData.candles.length > 0) {
            const lastCandle = candleData.candles[candleData.candles.length - 1];
            currentPrice = lastCandle.close;
            updateNQPriceDisplay();
        }
        
        // 차트 저장
        window.lwChart = chart;
        window.candleSeries = candleSeries;
        window.positionLines = [];
        
        // 반응형
        window.addEventListener('resize', () => {
            chart.applyOptions({ width: container.clientWidth });
        });
        
        console.log('📊 Lightweight Charts 준비 완료');
        
        // 포지션 라인 그리기
        setTimeout(() => drawPositionLinesLW(), 1000);
        
        // 실시간 가격 업데이트 시작 (1분마다)
        startRealPriceUpdates();
        
        return chart;
    } catch (error) {
        console.error('❌ 차트 로드 실패:', error);
        container.innerHTML = '<p style="text-align:center; padding:2rem; color:red;">차트 로드 실패</p>';
    }
}

// 실제 NQ 데이터 가져오기
async function fetchRealNQData() {
    try {
        // Yahoo Finance API - NQ 선물
        const symbol = 'NQ=F'; // NQ E-mini 선물
        const interval = '5m'; // 5분봉
        const range = '1d'; // 1일
        
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || !data.chart.result[0]) {
            throw new Error('데이터 로드 실패');
        }
        
        const result = data.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp;
        
        const candles = [];
        const volume = [];
        
        for (let i = 0; i < timestamps.length; i++) {
            if (quotes.open[i] && quotes.close[i]) {
                candles.push({
                    time: timestamps[i],
                    open: parseFloat(quotes.open[i].toFixed(2)),
                    high: parseFloat(quotes.high[i].toFixed(2)),
                    low: parseFloat(quotes.low[i].toFixed(2)),
                    close: parseFloat(quotes.close[i].toFixed(2)),
                });
                
                volume.push({
                    time: timestamps[i],
                    value: quotes.volume[i] || 0,
                    color: quotes.close[i] > quotes.open[i] ? '#26a69a' : '#ef5350',
                });
            }
        }
        
        // 현재가 업데이트
        if (candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            currentPrice = lastCandle.close;
        }
        
        console.log('✅ 실제 NQ 데이터 로드:', candles.length, '개 캔들');
        
        return { candles, volume };
    } catch (error) {
        console.error('❌ NQ 데이터 로드 실패:', error);
        // Fallback: 샘플 데이터
        return generateSampleData();
    }
}

// 샘플 데이터 생성 (백업용)
function generateSampleData() {
    console.log('⚠️ 샘플 데이터 사용 (15분 지연)');
    const candles = [];
    const volume = [];
    const basePrice = 20500;
    let time = Math.floor(Date.now() / 1000) - 300 * 60; // 300분 전부터
    
    for (let i = 0; i < 100; i++) {
        const open = basePrice + (Math.random() - 0.5) * 200;
        const close = open + (Math.random() - 0.5) * 50;
        const high = Math.max(open, close) + Math.random() * 20;
        const low = Math.min(open, close) - Math.random() * 20;
        
        candles.push({
            time: time,
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
        });
        
        volume.push({
            time: time,
            value: Math.random() * 1000 + 500,
            color: close > open ? '#26a69a' : '#ef5350',
        });
        
        time += 5 * 60; // 5분 간격
    }
    
    return { candles, volume };
}

// 실시간 가격 업데이트 (Yahoo Finance)
function startRealPriceUpdates() {
    if (window.priceUpdateInterval) {
        clearInterval(window.priceUpdateInterval);
    }
    
    // 1분마다 최신 가격 가져오기
    window.priceUpdateInterval = setInterval(async () => {
        if (!window.candleSeries) return;
        
        try {
            // 최신 1개 캔들만 가져오기
            const symbol = 'NQ=F';
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=5m`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.chart && data.chart.result && data.chart.result[0]) {
                const result = data.chart.result[0];
                const quotes = result.indicators.quote[0];
                const timestamps = result.timestamp;
                const lastIndex = timestamps.length - 1;
                
                if (quotes.close[lastIndex]) {
                    const time = timestamps[lastIndex];
                    const open = quotes.open[lastIndex];
                    const high = quotes.high[lastIndex];
                    const low = quotes.low[lastIndex];
                    const close = quotes.close[lastIndex];
                    
                    // 차트 업데이트
                    window.candleSeries.update({
                        time: time,
                        open: parseFloat(open.toFixed(2)),
                        high: parseFloat(high.toFixed(2)),
                        low: parseFloat(low.toFixed(2)),
                        close: parseFloat(close.toFixed(2)),
                    });
                    
                    // 현재가 업데이트
                    currentPrice = close;
                    updateNQPriceDisplay();
                    updateOpenPositions();
                    
                    console.log('🔄 가격 업데이트:', close.toFixed(2));
                }
            }
        } catch (error) {
            console.error('⚠️ 가격 업데이트 실패:', error);
            // Fallback: 작은 변동만 적용
            const change = (Math.random() - 0.5) * 5;
            currentPrice += change;
            updateNQPriceDisplay();
        }
    }, 60000); // 1분마다
    
    console.log('✅ 실시간 가격 업데이트 시작 (1분 간격)');
}

// 차트에 포지션 라인 그리기 (간소화 버전)
function drawPositionLinesLW() {
    console.log('📊 차트 라인 그리기 시도...');
    
    if (!window.tvChart) {
        console.log('⚠️ 차트 객체 없음');
        return;
    }
    
    if (!myParticipation || !myParticipation.trades) {
        console.log('⚠️ 포지션 없음');
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    console.log(`📈 ${openTrades.length}개 포지션 발견`);
    
    // TradingView 무료/기본 버전은 고급 API 제한
    // 대신 콘솔에 정보 출력
    openTrades.forEach((trade, index) => {
        console.log(`
포지션 ${index + 1}:
  ${trade.side} ${trade.contract} × ${trade.contracts}
  진입: ${trade.entryPrice.toFixed(2)}
  손절: ${trade.stopLoss ? trade.stopLoss.toFixed(2) : 'N/A'}
  익절: ${trade.takeProfit ? trade.takeProfit.toFixed(2) : 'N/A'}
        `);
    });
    
    // Note: TradingView Advanced Charts API는 유료 플랜 필요
    // 현재는 오픈 포지션 테이블로 SL/TP 관리
}

// 손절가 업데이트 (차트에서 드래그)
async function updateTradeStopLoss(tradeIndex, newPrice) {
    try {
        myParticipation.trades[tradeIndex].stopLoss = newPrice;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        console.log(`✅ SL 업데이트: ${newPrice.toFixed(2)}`);
        updateOpenPositions();
    } catch (error) {
        console.error('SL 업데이트 실패:', error);
    }
}

// 익절가 업데이트 (차트에서 드래그)
async function updateTradeTakeProfit(tradeIndex, newPrice) {
    try {
        myParticipation.trades[tradeIndex].takeProfit = newPrice;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        console.log(`✅ TP 업데이트: ${newPrice.toFixed(2)}`);
        updateOpenPositions();
    } catch (error) {
        console.error('TP 업데이트 실패:', error);
    }
}

function updatePriceFromChart(chart) {
    // TradingView 차트에서 현재 가격 가져오기
    chart.getSeries().then(series => {
        // 마지막 바 데이터 가져오기
        const lastBar = series.lastBar();
        if (lastBar) {
            currentPrice = lastBar.close;
            updateNQPriceDisplay();
        }
    }).catch(err => {
        console.log('차트 데이터 로드 중...');
        // Fallback: 모의 데이터
        updateNQPrice();
    });
}

function connectPriceWebSocket() {
    // NQ 선물 가격 - Yahoo Finance API 사용 (무료, 15분 지연)
    // 실시간은 유료이므로 모의 데이터 생성
    updateNQPrice();
    
    // 5초마다 가격 업데이트 (모의)
    if (window.nqPriceInterval) clearInterval(window.nqPriceInterval);
    
    window.nqPriceInterval = setInterval(updateNQPrice, 5000);
}

async function updateNQPrice() {
    try {
        // TradingView 무료 플랜: 15분 지연
        // 실시간을 위해서는 TradingView Premium 필요
        
        // Yahoo Finance API로 NQ 가격 가져오기 (무료, 15분 지연)
        const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1m&range=1d');
        const data = await response.json();
        
        if (data.chart.result && data.chart.result[0]) {
            const quote = data.chart.result[0].meta;
            currentPrice = quote.regularMarketPrice || quote.previousClose;
        } else {
            // Fallback: 모의 데이터
            if (!currentPrice) {
                currentPrice = 20500;
            } else {
                const change = (Math.random() - 0.5) * 100;
                currentPrice += change;
                currentPrice = Math.max(19000, Math.min(21000, currentPrice));
            }
        }
        
        updateNQPriceDisplay();
        
    } catch (error) {
        console.error('Price fetch error:', error);
        // Fallback to simulated price
        if (!currentPrice) currentPrice = 20500;
        updateNQPriceDisplay();
    }
}

function updateNQPriceDisplay() {
    const contract = document.getElementById('futures-contract')?.value || 'NQ';
    const multiplier = contract === 'NQ' ? 20 : 2;
    const tickSize = 0.25;
    const tickValue = multiplier * tickSize;
    
    const priceEl = document.getElementById('current-nq-price');
    const tickSizeEl = document.getElementById('tick-size');
    const pointValueEl = document.getElementById('point-value');
    const tickValueEl = document.getElementById('tick-value');
    
    if (priceEl) priceEl.textContent = currentPrice.toFixed(2);
    if (tickSizeEl) tickSizeEl.textContent = tickSize.toFixed(2);
    if (pointValueEl) pointValueEl.textContent = `$${multiplier}`;
    if (tickValueEl) tickValueEl.textContent = `$${tickValue.toFixed(2)}`;
    
    updateOpenPositions();
}

function updateContractSpecs() {
    updateNQPriceDisplay();
}

}

// (첫 번째 executeFuturesTrade 제거됨 - 아래 고급 버전이 최종)

async function closePosition(tradeIndex) {
    if (!myParticipation) return;
    
    const trade = myParticipation.trades[tradeIndex];
    if (trade.status !== 'open') return;
    
    const priceDiff = trade.side === 'BUY' 
        ? (currentPrice - trade.entryPrice) 
        : (trade.entryPrice - currentPrice);
    
    const pnl = priceDiff * trade.multiplier * trade.contracts;
    const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
    const netPnl = pnl - fee;
    
    const confirm = window.confirm(
        `포지션 청산\n\n` +
        `${trade.contract} ${trade.side} × ${trade.contracts}\n` +
        `진입: ${trade.entryPrice.toFixed(2)}\n` +
        `현재: ${currentPrice.toFixed(2)}\n` +
        `손익: $${pnl.toFixed(2)}\n` +
        `수수료: -$${fee.toFixed(2)}\n` +
        `순손익: $${netPnl.toFixed(2)}\n\n` +
        `청산하시겠습니까?`
    );
    
    if (!confirm) return;
    
    try {
        trade.status = 'closed';
        trade.exitPrice = currentPrice;
        trade.pnl = netPnl;
        trade.fee = fee;
        trade.closedAt = new Date();
        
        const newBalance = myParticipation.currentBalance + trade.margin + netPnl;
        myParticipation.currentBalance = newBalance;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: myParticipation.trades,
                currentBalance: newBalance
            });
        
        alert(`✅ 포지션 청산!\n순손익: $${netPnl.toFixed(2)} (수수료 -$${fee.toFixed(2)} 포함)`);
        
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // ===== RISK CHECK: 일일 손실 한도 =====
        await checkDailyLossLimit(netPnl);
        
        // ===== RISK CHECK: 누적 청산 =====
        await checkCumulativeLiquidation();
        
        updateRiskGaugeUI();
        
        // 차트 라인 업데이트
        setTimeout(() => drawPositionLinesLW(), 500);
    } catch (error) {
        alert('청산 실패: ' + error.message);
    }
}

function updateOpenPositions() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const container = document.getElementById('open-positions');
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--accent); padding:1rem;">오픈 포지션 없음</p>';
        return;
    }
    
    container.innerHTML = '';
    
    openTrades.forEach((trade, index) => {
        const actualIndex = myParticipation.trades.indexOf(trade);
        const priceDiff = trade.side === 'BUY' 
            ? (currentPrice - trade.entryPrice) 
            : (trade.entryPrice - currentPrice);
        
        const pnl = priceDiff * trade.multiplier * trade.contracts;
        const pnlColor = pnl >= 0 ? '#0066cc' : '#cc0000';
        
        // Check if SL/TP hit
        let slHit = false;
        let tpHit = false;
        
        if (trade.stopLoss) {
            slHit = trade.side === 'BUY' 
                ? currentPrice <= trade.stopLoss 
                : currentPrice >= trade.stopLoss;
        }
        
        if (trade.takeProfit) {
            tpHit = trade.side === 'BUY' 
                ? currentPrice >= trade.takeProfit 
                : currentPrice <= trade.takeProfit;
        }
        
        const div = document.createElement('div');
        div.style.cssText = 'padding:1rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem; border-left:4px solid ' + (trade.side === 'BUY' ? '#0066cc' : '#cc0000');
        
        let slTPHTML = '';
        if (trade.stopLoss || trade.takeProfit) {
            slTPHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.5rem; font-size:0.8rem;">
                    ${trade.stopLoss ? `<div style="color:red;">SL: ${trade.stopLoss.toFixed(2)} ${slHit ? '🔴 HIT' : ''}</div>` : '<div></div>'}
                    ${trade.takeProfit ? `<div style="color:green;">TP: ${trade.takeProfit.toFixed(2)} ${tpHit ? '🟢 HIT' : ''}</div>` : '<div></div>'}
                </div>
            `;
        }
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.3rem;">
                        <strong style="color:${trade.side === 'BUY' ? '#0066cc' : '#cc0000'}">${trade.side}</strong> 
                        <span>${trade.contract} × ${trade.contracts}</span>
                        <span style="font-size:0.75rem; color:var(--accent);">${trade.orderType}</span>
                    </div>
                    <div style="font-size:0.85rem;">
                        진입: ${trade.entryPrice.toFixed(2)} → 현재: ${currentPrice.toFixed(2)}
                    </div>
                    ${slTPHTML}
                    <div style="margin-top:0.5rem;">
                        <strong style="color:${pnlColor}; font-size:1.2rem;">
                            ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                        </strong>
                        <span style="font-size:0.8rem; color:var(--accent); margin-left:0.5rem;">
                            (${((pnl / trade.margin) * 100).toFixed(2)}%)
                        </span>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    <button onclick="modifyPosition(${actualIndex})" style="background:var(--text); color:white; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.85rem;">
                        수정
                    </button>
                    <button onclick="closePosition(${actualIndex})" style="background:var(--accent); color:white; border:none; padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.85rem;">
                        청산
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function modifyPosition(tradeIndex) {
    const trade = myParticipation.trades[tradeIndex];
    if (trade.status !== 'open') return;
    
    const newSL = prompt(`손절가 수정:\n현재: ${trade.stopLoss ? trade.stopLoss.toFixed(2) : '없음'}`, trade.stopLoss || '');
    const newTP = prompt(`익절가 수정:\n현재: ${trade.takeProfit ? trade.takeProfit.toFixed(2) : '없음'}`, trade.takeProfit || '');
    
    try {
        trade.stopLoss = newSL ? parseFloat(newSL) : null;
        trade.takeProfit = newTP ? parseFloat(newTP) : null;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ trades: myParticipation.trades });
        
        alert('✅ 포지션 수정 완료!');
        updateOpenPositions();
    } catch (error) {
        alert('수정 실패: ' + error.message);
    }
}

async function loadTradeHistory() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const container = document.getElementById('trade-history');
    container.innerHTML = '';
    
    const closedTrades = myParticipation.trades.filter(t => t.status === 'closed');
    
    if (closedTrades.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--accent); padding:1rem;">거래 내역 없음</p>';
        return;
    }
    
    closedTrades.slice().reverse().forEach((trade) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:0.8rem; background:var(--bg); border-radius:6px; margin-bottom:0.5rem;';
        
        const sideColor = trade.side === 'BUY' ? '#0066cc' : '#cc0000';
        const pnlColor = trade.pnl >= 0 ? '#0066cc' : '#cc0000';
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <div>
                    <strong style="color:${sideColor}">${trade.side}</strong> ${trade.contract} × ${trade.contracts}
                    <br>
                    <span style="font-size:0.85rem; color:var(--accent);">
                        ${trade.entryPrice.toFixed(2)} → ${trade.exitPrice.toFixed(2)}
                    </span>
                </div>
                <div style="text-align:right;">
                    <strong style="color:${pnlColor}; font-size:1.1rem;">
                        ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
                    </strong>
                    <br>
                    <span style="font-size:0.75rem; color:var(--accent);">
                        ${new Date(trade.closedAt.seconds * 1000).toLocaleString()}
                    </span>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Remove crypto pair change listener
document.addEventListener('DOMContentLoaded', () => {
    // NQ futures - no pair selection needed
});

// ========== NINJATRADER-STYLE FEATURES ==========

function toggleOrderInputs() {
    const orderType = document.getElementById('order-type').value;
    const priceInputs = document.getElementById('price-inputs');
    const limitDiv = document.getElementById('limit-price-div');
    const stopDiv = document.getElementById('stop-price-div');
    
    if (orderType === 'MARKET') {
        priceInputs.style.display = 'none';
    } else if (orderType === 'LIMIT') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'block';
        stopDiv.style.display = 'none';
        document.getElementById('limit-price').value = currentPrice.toFixed(2);
    } else if (orderType === 'STOP') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'none';
        stopDiv.style.display = 'block';
        document.getElementById('stop-price').value = currentPrice.toFixed(2);
    } else if (orderType === 'STOP_LIMIT') {
        priceInputs.style.display = 'block';
        limitDiv.style.display = 'block';
        stopDiv.style.display = 'block';
        document.getElementById('limit-price').value = currentPrice.toFixed(2);
        document.getElementById('stop-price').value = currentPrice.toFixed(2);
    }
}

function toggleSLTP() {
    const useSLTP = document.getElementById('use-sl-tp').checked;
    const inputs = document.getElementById('sl-tp-inputs');
    inputs.style.display = useSLTP ? 'block' : 'none';
}

async function closeAllPositions() {
    if (!myParticipation || !myParticipation.trades) return;
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        alert('오픈 포지션이 없습니다');
        return;
    }
    
    const confirm = window.confirm(
        `전체 포지션 청산\n\n` +
        `${openTrades.length}개 포지션\n\n` +
        `정말 전체 청산하시겠습니까?`
    );
    
    if (!confirm) return;
    
    try {
        let totalPnL = 0;
        
        for (let i = 0; i < myParticipation.trades.length; i++) {
            const trade = myParticipation.trades[i];
            if (trade.status === 'open') {
                const priceDiff = trade.side === 'BUY' 
                    ? (currentPrice - trade.entryPrice) 
                    : (trade.entryPrice - currentPrice);
                
                const pnl = priceDiff * trade.multiplier * trade.contracts;
                const fee = trade.fee || (RISK_CONFIG.tradeFeeRoundTrip * trade.contracts);
                const netPnl = pnl - fee;
                
                trade.status = 'closed';
                trade.exitPrice = currentPrice;
                trade.pnl = netPnl;
                trade.fee = fee;
                trade.closedAt = new Date();
                
                totalPnL += netPnl + trade.margin;
            }
        }
        
        myParticipation.currentBalance += totalPnL;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: myParticipation.trades,
                currentBalance: myParticipation.currentBalance
            });
        
        alert(`✅ 전체 포지션 청산 완료!\n손익: $${totalPnL.toFixed(2)}`);
        updateTradingUI();
        updateOpenPositions();
        loadTradeHistory();
        
        // ===== RISK CHECK =====
        const netPnLOnly = totalPnL - myParticipation.trades.filter(t => t.status === 'closed' && t.closedAt).reduce((sum, t) => sum + (t.margin || 0), 0);
        await checkDailyLossLimit(netPnLOnly);
        await checkCumulativeLiquidation();
        updateRiskGaugeUI();
    } catch (error) {
        alert('청산 실패: ' + error.message);
    }
}

// Modify executeFuturesTrade to support advanced order types + SLOT SYSTEM + RISK CHECK
async function executeFuturesTrade(side) {
    if (!myParticipation) {
        alert('챌린지에 먼저 참가하세요');
        return;
    }
    
    // ===== RISK CHECK: 일일 한도 =====
    if (myParticipation.dailyLocked) {
        alert('⚠️ 오늘의 거래가 종료되었습니다.\n내일 다시 도전하세요!');
        return;
    }
    
    // ===== SLOT SYSTEM: CRNY 기반 계약 수 자동 계산 =====
    const crnyBalance = userWallet?.balances?.crny || 0;
    const slots = calculateSlots(crnyBalance);
    
    if (slots === 0) {
        alert('🔴 CRNY를 보유해야 거래할 수 있습니다.\n\nWALLET에서 CRNY 잔액을 확인해주세요.');
        return;
    }
    
    const contract = document.getElementById('futures-contract').value;
    const contracts = slots; // ← 핵심 변경: 유저 입력 → 슬롯 자동
    const orderType = document.getElementById('order-type').value;
    const multiplier = contract === 'NQ' ? 20 : 2;
    const margin = contract === 'NQ' ? 15000 : 1500;
    const requiredMargin = margin * contracts;
    
    if (requiredMargin > myParticipation.currentBalance) {
        alert(`증거금이 부족합니다\n필요: $${requiredMargin.toLocaleString()}\n보유: $${myParticipation.currentBalance.toLocaleString()}`);
        return;
    }
    
    // 거래 제한 체크
    if (!checkTradingLimits(contracts)) return;
    
    let entryPrice = currentPrice;
    let orderTypeText = '시장가';
    
    // Get prices based on order type
    if (orderType === 'LIMIT') {
        entryPrice = parseFloat(document.getElementById('limit-price').value);
        orderTypeText = `지정가 ${entryPrice.toFixed(2)}`;
    } else if (orderType === 'STOP') {
        entryPrice = parseFloat(document.getElementById('stop-price').value);
        orderTypeText = `손절 ${entryPrice.toFixed(2)}`;
    } else if (orderType === 'STOP_LIMIT') {
        const stopPrice = parseFloat(document.getElementById('stop-price').value);
        entryPrice = parseFloat(document.getElementById('limit-price').value);
        orderTypeText = `손절지정가 ${stopPrice.toFixed(2)}/${entryPrice.toFixed(2)}`;
    }
    
    // Get SL/TP settings
    const useSLTP = document.getElementById('use-sl-tp').checked;
    let stopLoss = null;
    let takeProfit = null;
    
    if (useSLTP) {
        const slPoints = parseFloat(document.getElementById('stop-loss-points').value) || 0;
        const tpPoints = parseFloat(document.getElementById('take-profit-points').value) || 0;
        
        if (side === 'BUY') {
            stopLoss = entryPrice - slPoints;
            takeProfit = entryPrice + tpPoints;
        } else {
            stopLoss = entryPrice + slPoints;
            takeProfit = entryPrice - tpPoints;
        }
    }
    
    let confirmMsg = `${side} 포지션 진입\n\n` +
        `상품: ${contract}\n` +
        `👑 슬롯: ${slots}개 (CRNY ${Math.floor(crnyBalance)}개 기준)\n` +
        `계약: ${contracts}개\n` +
        `주문: ${orderTypeText}\n` +
        `증거금: $${requiredMargin.toLocaleString()}\n` +
        `포인트당: $${multiplier * contracts}`;
    
    if (useSLTP) {
        confirmMsg += `\n\n손절: ${stopLoss.toFixed(2)}\n익절: ${takeProfit.toFixed(2)}`;
    }
    
    confirmMsg += `\n\n실행하시겠습니까?`;
    
    if (!window.confirm(confirmMsg)) return;
    
    try {
        const trade = {
            contract: contract,
            side: side,
            contracts: contracts,
            orderType: orderType,
            entryPrice: entryPrice,
            currentPrice: currentPrice,
            multiplier: multiplier,
            margin: requiredMargin,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            crnyAtEntry: Math.floor(crnyBalance),
            slotsAtEntry: slots,
            fee: RISK_CONFIG.tradeFeeRoundTrip * contracts,
            timestamp: new Date(),
            status: orderType === 'MARKET' ? 'open' : 'pending',
            pnl: 0
        };
        
        const trades = myParticipation.trades || [];
        trades.push(trade);
        
        const newBalance = myParticipation.currentBalance - requiredMargin;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: trades,
                currentBalance: newBalance
            });
        
        myParticipation.trades = trades;
        myParticipation.currentBalance = newBalance;
        
        const statusText = orderType === 'MARKET' ? '체결' : '접수';
        alert(`✅ ${side} 주문 ${statusText}!\n${contract} ${contracts}계약 @ ${entryPrice.toFixed(2)}\n👑 슬롯: ${slots}개`);
        
        updateTradingUI();
        updateOpenPositions();
        updateRiskGaugeUI();
        loadTradeHistory();
        
        // 차트에 라인 그리기
        setTimeout(() => drawPositionLinesLW(), 1000);
    } catch (error) {
        alert('거래 실패: ' + error.message);
    }
}

// Quick chart trade (SLOT-based market order with default SL/TP)
async function quickChartTrade(side) {
    if (!myParticipation) {
        alert('챌린지에 먼저 참가하세요');
        return;
    }
    
    // ===== RISK CHECK =====
    if (myParticipation.dailyLocked) {
        alert('⚠️ 오늘의 거래가 종료되었습니다.\n내일 다시 도전하세요!');
        return;
    }
    
    // ===== SLOT SYSTEM =====
    const crnyBalance = userWallet?.balances?.crny || 0;
    const slots = calculateSlots(crnyBalance);
    
    if (slots === 0) {
        alert('🔴 CRNY를 보유해야 거래할 수 있습니다.');
        return;
    }
    
    const contract = document.getElementById('futures-contract').value;
    const contracts = slots; // ← 슬롯 기반
    const multiplier = contract === 'NQ' ? 20 : 2;
    const margin = (contract === 'NQ' ? 15000 : 1500) * contracts;
    
    if (margin > myParticipation.currentBalance) {
        alert(`증거금이 부족합니다`);
        return;
    }
    
    // Default SL/TP (50 points SL, 100 points TP)
    const slPoints = 50;
    const tpPoints = 100;
    
    const stopLoss = side === 'BUY' 
        ? currentPrice - slPoints 
        : currentPrice + slPoints;
    
    const takeProfit = side === 'BUY'
        ? currentPrice + tpPoints
        : currentPrice - tpPoints;
    
    try {
        const trade = {
            contract: contract,
            side: side,
            contracts: contracts,
            orderType: 'MARKET',
            entryPrice: currentPrice,
            currentPrice: currentPrice,
            multiplier: multiplier,
            margin: margin,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            crnyAtEntry: Math.floor(crnyBalance),
            slotsAtEntry: slots,
            fee: RISK_CONFIG.tradeFeeRoundTrip * contracts,
            timestamp: new Date(),
            status: 'open',
            pnl: 0
        };
        
        const trades = myParticipation.trades || [];
        trades.push(trade);
        
        const newBalance = myParticipation.currentBalance - margin;
        
        await db.collection('prop_challenges').doc(myParticipation.challengeId)
            .collection('participants').doc(myParticipation.participantId)
            .update({ 
                trades: trades,
                currentBalance: newBalance
            });
        
        myParticipation.trades = trades;
        myParticipation.currentBalance = newBalance;
        
        console.log(`✅ 차트 ${side} 주문 체결! ${slots}슬롯, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}`);
        
        updateTradingUI();
        updateOpenPositions();
        updateRiskGaugeUI();
        
        // 차트에 라인 그리기
        setTimeout(() => drawPositionLinesLW(), 500);
    } catch (error) {
        alert('거래 실패: ' + error.message);
    }
}

// Lightweight Charts용 포지션 라인 그리기
function drawPositionLinesLW() {
    if (!window.candleSeries || !myParticipation || !myParticipation.trades) {
        console.log('⚠️ 차트 또는 포지션 없음');
        return;
    }
    
    const openTrades = myParticipation.trades.filter(t => t.status === 'open');
    
    // 기존 라인 제거
    if (window.positionLines) {
        window.positionLines.forEach(line => {
            try {
                window.candleSeries.removePriceLine(line);
            } catch (e) {}
        });
    }
    window.positionLines = [];
    
    openTrades.forEach((trade) => {
        // 진입가 라인
        const entryLine = window.candleSeries.createPriceLine({
            price: trade.entryPrice,
            color: trade.side === 'BUY' ? '#0066cc' : '#cc0000',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `${trade.side} ${trade.contracts}`,
        });
        window.positionLines.push(entryLine);
        
        // 손절 라인
        if (trade.stopLoss) {
            const slLine = window.candleSeries.createPriceLine({
                price: trade.stopLoss,
                color: '#ff0000',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: 'SL',
            });
            window.positionLines.push(slLine);
        }
        
        // 익절 라인
        if (trade.takeProfit) {
            const tpLine = window.candleSeries.createPriceLine({
                price: trade.takeProfit,
                color: '#00cc00',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: 'TP',
            });
            window.positionLines.push(tpLine);
        }
    });
    
    console.log(`📊 ${openTrades.length}개 포지션 라인 표시`);
}

// 거래 제한 확인
function checkTradingLimits(contracts) {
    if (!myParticipation) return false;
    
    const maxContracts = myParticipation.maxContracts || 7;
    const maxPositions = myParticipation.maxPositions || 20;
    const maxDrawdown = myParticipation.maxDrawdown || 3000;
    
    // 계약 수 확인
    if (contracts > maxContracts) {
        alert(`❌ 최대 ${maxContracts}계약까지 가능합니다`);
        return false;
    }
    
    // 포지션 수 확인
    const openPositions = myParticipation.trades?.filter(t => t.status === 'open').length || 0;
    if (openPositions >= maxPositions) {
        alert(`❌ 최대 ${maxPositions}개 포지션까지 가능합니다\n현재: ${openPositions}개`);
        return false;
    }
    
    // Drawdown 확인
    const initialBalance = myParticipation.initialBalance || 100000;
    const currentBalance = myParticipation.currentBalance || 100000;
    const drawdown = initialBalance - currentBalance;
    
    if (drawdown >= maxDrawdown) {
        alert(`🚨 청산 기준 도달!\n최대 손실: -$${maxDrawdown}\n현재 손실: -$${drawdown.toFixed(2)}`);
        return false;
    }
    
    return true;
}

// EOD 정산
async function processEOD() {
    if (!myParticipation) return;
    
    const totalPnL = myParticipation.currentBalance - myParticipation.initialBalance;
    
    if (totalPnL > 0) {
        // 수익 발생 - CRFN으로 지급 가능
        console.log(`💰 EOD 수익: $${totalPnL.toFixed(2)}`);
        
        // TODO: CRFN 토큰 지급 로직
    }
    
    // lastEOD 업데이트
    await db.collection('prop_challenges').doc(myParticipation.challengeId)
        .collection('participants').doc(myParticipation.participantId)
        .update({
            lastEOD: new Date(),
            dailyPnL: totalPnL
        });
}

// ========== POLYGON.IO 실시간 CME 데이터 ==========

let polygonWS = null;

// Massive WebSocket 연결
function connectMassiveRealtime() {
    if (!window.MASSIVE_CONFIG || !window.MASSIVE_CONFIG.enabled) {
        console.log('⚠️ Massive 비활성화 - Yahoo Finance 사용');
        return;
    }
    
    const apiKey = window.MASSIVE_CONFIG.apiKey;
    
    if (apiKey === 'YOUR_POLYGON_API_KEY') {
        console.error('❌ Massive API Key를 설정하세요!');
        return;
    }
    
    polygonWS = new WebSocket('wss://socket.polygon.io/futures');
    
    polygonWS.onopen = () => {
        console.log('📡 Massive 연결 중...');
        
        // 인증
        polygonWS.send(JSON.stringify({
            action: 'auth',
            params: apiKey
        }));
    };
    
    polygonWS.onmessage = (event) => {
        const messages = JSON.parse(event.data);
        
        messages.forEach(msg => {
            if (msg.ev === 'status' && msg.status === 'auth_success') {
                console.log('✅ Massive 인증 성공');
                
                // NQ 선물 구독
                polygonWS.send(JSON.stringify({
                    action: 'subscribe',
                    params: 'AM.C:NQ*' // NQ 전체 (1분, 5분 등)
                }));
                
                console.log('📊 NQ 선물 구독 완료');
            }
            
            if (msg.ev === 'AM') {
                // Aggregate Minute (1분봉)
                handleMassiveAggregate(msg);
            }
        });
    };
    
    polygonWS.onerror = (error) => {
        console.error('❌ Massive 연결 오류:', error);
    };
    
    polygonWS.onclose = () => {
        console.log('🔌 Massive 연결 종료');
        // 재연결
        setTimeout(() => connectMassiveRealtime(), 5000);
    };
}

// Massive 데이터 처리
function handleMassiveAggregate(data) {
    if (!window.candleSeries) return;
    
    const candle = {
        time: Math.floor(data.s / 1000), // 밀리초 → 초
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c
    };
    
    // 차트 업데이트
    window.candleSeries.update(candle);
    
    // 현재가 업데이트
    currentPrice = data.c;
    updateNQPriceDisplay();
    updateOpenPositions();
    
    console.log(`🔄 Massive 실시간: ${data.c.toFixed(2)}`);
}

// Massive REST API로 히스토리 데이터
async function fetchMassiveHistory() {
    if (!window.MASSIVE_CONFIG || !window.MASSIVE_CONFIG.enabled) {
        return null;
    }
    
    const apiKey = window.MASSIVE_CONFIG.apiKey;
    
    try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const url = `https://api.polygon.io/v2/aggs/ticker/C:NQ/range/5/minute/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results) {
            const candles = data.results.map(r => ({
                time: Math.floor(r.t / 1000),
                open: r.o,
                high: r.h,
                low: r.l,
                close: r.c
            }));
            
            const volume = data.results.map(r => ({
                time: Math.floor(r.t / 1000),
                value: r.v,
                color: r.c > r.o ? '#26a69a' : '#ef5350'
            }));
            
            console.log('✅ Massive 히스토리 데이터:', candles.length, '개');
            
            return { candles, volume };
        }
    } catch (error) {
        console.error('❌ Massive 히스토리 로드 실패:', error);
    }
    
    return null;
}
