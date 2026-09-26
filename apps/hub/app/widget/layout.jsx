import "../../components/hub/hub-tokens.css";
import "./widget.css";

// 데스크톱 빠른 입력 위젯(apps/desktop의 380×200 창)이 띄우는 페이지.
// /dashboard 밖에 두어 HubApp 셸(사이드바·탑바·팔레트)이 올라오지 않는다. 세션 게이트는 그대로다 —
// middleware.js가 다른 화면과 똑같이 막고(OPEN_PREFIXES·OPEN_EXACT에 없다), 세션이 없으면 /login으로 보낸다.
export const metadata = {
  title: "Moonlight 빠른 입력",
};

export default function WidgetLayout({ children }) {
  return children;
}
