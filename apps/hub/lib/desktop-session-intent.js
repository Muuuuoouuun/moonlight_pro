// Optional Electron bridge. Ordinary browsers keep the existing Hub login flow.
const loginFailure = '앱의 로그인 상태를 확인하지 못했습니다. 앱 연결을 확인한 뒤 다시 로그인해 주세요.';
export async function desktopAllowsSessionRestore(bridge) {
  if (!bridge) return true;
  try {
    const state = await bridge.state();
    return state?.supported === false || state?.supported === true && !state.error && !state.signedOut && !state.automaticLoginBlocked;
  } catch { return false; }
}
export async function beginDesktopLogin(bridge) {
  if (!bridge) return null;
  const result = await bridge.beginLogin();
  if (result?.supported === false) return null;
  if (result?.error || typeof result?.loginAttempt !== 'string') throw new Error(loginFailure);
  return result.loginAttempt;
}
export async function acceptDesktopLogin(bridge, attempt) {
  if (!attempt) return;
  const result = await bridge.acceptLogin(attempt);
  if (result?.supported !== true || result.error || result.signedOut || result.automaticLoginBlocked) throw new Error(loginFailure);
}
export async function persistDesktopLogout(bridge) {
  if (!bridge) return null;
  const result = await bridge.logout();
  if (result?.supported === false) return null;
  if (result?.error || !result?.signedOut || result.logoutIntent?.persistence !== 'persisted'
    || result.logoutIntent?.localSession !== 'cleared') {
    throw new Error('앱 로그아웃의 저장 또는 적용을 확인하지 못했습니다. 컴패니언 로그아웃은 미확인 상태입니다.');
  }
  return result.logoutIntent; // Companion acknowledgement and remote revocation are separate.
}
