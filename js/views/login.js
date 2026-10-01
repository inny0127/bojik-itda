// 보직 계정 로그인: 계정은 사람이 아니라 보직(자리)에 발급됩니다.
import { api, esc, toast, dday } from '../util.js?v=53868ba833';

export async function render(root, app) {
  root.innerHTML = `
  <div class="login">
    <div class="login-box">
      <div class="login-brand"><span class="brand-name">보직잇다</span></div>
      <section class="login-card">
        <h1>보직 계정 로그인</h1>
        <p class="muted">소속 부대와 보직을 선택하세요.</p>
        <form id="loginForm" class="col" style="gap:14px">
          <div class="field"><label for="unitSel">소속 부대</label><select class="select" id="unitSel"></select></div>
          <div class="field"><label for="seatSel">보직</label><select class="select" id="seatSel" name="account"></select></div>
          <div class="seat-now" id="seatNow"></div>
          <div class="field"><label for="pw">비밀번호</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required${window.BOJIK_STATIC ? ' value="demo1234"' : ''}></div>
          <button class="btn primary block" type="submit">로그인</button>
        </form>
      </section>
      <p class="login-foot muted">부대·인원·규정은 모두 시연용 가상 데이터입니다.${window.BOJIK_STATIC ? ' 입력한 내용은 이 브라우저에만 저장됩니다. <a href="#" id="resetDemo">데이터 초기화</a>' : ''}</p>
    </div>
  </div>`;

  const seats = await api('/api/seats');
  const units = [...new Map(seats.map((s) => [s.unit_id, s.unit_name])).entries()];
  const unitSel = root.querySelector('#unitSel');
  const seatSel = root.querySelector('#seatSel');
  const holderTxt = (s) => {
    if (!s.current) return '보직자 없음';
    const discharge = s.current.tenure_end && s.kind === 'seat' && /[이일상]병|병장/.test(s.current.rank) ? ` (전역 ${dday(s.current.tenure_end)})` : '';
    return `${s.current.rank} ${s.current.name}${discharge}`;
  };
  unitSel.innerHTML = units.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('');
  const showNow = () => {
    const s = seats.find((x) => x.login_id === seatSel.value);
    root.querySelector('#seatNow').innerHTML = s
      ? `<span>계정 <b>${esc(s.login_id)}</b></span><span>현 보직자 ${esc(holderTxt(s))}</span>${s.incoming ? `<span>인수 예정 ${esc(s.incoming.rank)} ${esc(s.incoming.name)}</span>` : ''}`
      : '';
  };
  const fillSeats = () => {
    seatSel.innerHTML = seats.filter((s) => s.unit_id === unitSel.value).map((s) => `<option value="${s.login_id}">${esc(s.name)}</option>`).join('');
    showNow();
  };
  if (seats.length === 1) { unitSel.disabled = true; seatSel.disabled = true; }
  unitSel.onchange = fillSeats;
  seatSel.onchange = showNow;
  fillSeats();

  const doLogin = async (account, password) => {
    try {
      await api('/api/login', { body: { account, password } });
      await app.refreshMe().catch(() => {});
      location.hash = app.me?.user.role === 'admin' ? '#/admin' : '#/dashboard';
    } catch (e) { toast(e.message, 'err'); }
  };
  root.querySelector('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    doLogin(seatSel.value, f.get('password'));
  };
  root.querySelector('#resetDemo')?.addEventListener('click', (e) => { e.preventDefault(); window.BOJIK_STATIC.reset(); });
}
