# 🚀 Massive (구 Polygon.io) 실시간 연동 가이드

## 📋 단계별 설정

### 1️⃣ API Key 입력

`crowny-platform/index.html` 파일 열기:

```javascript
window.MASSIVE_CONFIG = {
    apiKey: 'pk_YOUR_KEY_HERE', // 👈 받은 API Key 붙여넣기
    enabled: true, // 👈 false → true로 변경
    plan: 'Starter',
    symbol: 'C:NQ'
};
```

### 2️⃣ 저장 및 배포

```bash
# GitHub 커밋
git add .
git commit -m "Add Massive real-time data"
git push

# Vercel 자동 배포 (1분 소요)
```

### 3️⃣ 확인

1. https://crowny.org 접속
2. PROP TRADING 페이지
3. 챌린지 참가
4. 브라우저 콘솔(F12) 확인:

```
✅ Massive 실시간 데이터 사용
📡 Massive 연결 중...
✅ Massive 인증 성공
📊 NQ 선물 구독 완료
🔄 Massive 실시간: 20545.25
```

---

## 🎯 **작동 원리:**

```
크라우니 웹앱
    ↓ WebSocket
wss://socket.polygon.io/futures
    ↓
Massive 서버
    ↓
CME 실시간 NQ 데이터
```

**주의:** API 주소는 여전히 `polygon.io`입니다!
(Massive는 브랜드명만 변경, 인프라 동일)

---

## ✅ **제공되는 데이터:**

- ✅ 실시간 NQ 선물 가격 (지연 없음)
- ✅ 5분봉 캔들스틱
- ✅ Volume
- ✅ OHLC (Open, High, Low, Close)
- ✅ 1분마다 자동 업데이트

---

## 💰 **비용:**

| 플랜 | 월 비용 | 기능 |
|------|---------|------|
| **Starter** | **$199** | ✅ 실시간 선물 |
| Developer | $399 | 더 많은 기능 |
| Advanced | 협의 | 기업용 |

---

## 🔧 **트러블슈팅:**

### "인증 실패"
→ API Key 확인 (pk_로 시작)

### "구독 실패"
→ 플랜에 선물 데이터 포함되어 있는지 확인

### "데이터 없음"
→ CME 거래시간 확인 (일요일 18:00 - 금요일 17:00 EST)

---

## 📞 **문의:**

- Massive 지원: support@polygon.io (아직 Polygon 이메일 사용)
- 문서: https://polygon.io/docs/futures

---

## 🎊 **완료!**

이제 **실시간 CME 데이터**로 프랍 트레이딩하세요!
