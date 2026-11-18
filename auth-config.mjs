// PIN 자체는 저장소에 없다. SALT 와 «토큰의 해시»만 둔다 (2026-11-19 사용자 지시로 사이트 전체 PIN).
// PIN 바꾸기: 새 SALT 를 만들고 TOKEN_HASH = sha256(sha256(SALT+":"+PIN)) 으로 바꾼다.
export const SALT='70964b2ab0d318aefd0dadfb';
export const TOKEN_HASH='5a37e28d7396544884744da1e7ecfc701b10d701025127c37246037ff55b4b5a';
