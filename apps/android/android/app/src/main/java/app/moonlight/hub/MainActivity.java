package app.moonlight.hub;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MoonlightShare";
    private boolean restoring;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 프로세스 복원 때 시스템이 원래 SEND 인텐트를 다시 넘기므로 같은 공유를 두 번 열지 않는다.
        restoring = savedInstanceState != null;
        super.onCreate(savedInstanceState);
        // 뒤로 가기: WebView 기록을 거슬러 가고, 더 갈 곳이 없을 때만 시스템 기본(앱 닫기)으로 넘긴다.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    // BridgeActivity.load() 가 콜드 스타트 인텐트도 여기로 넘긴다.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (restoring) {
            restoring = false;
            return;
        }
        if (bridge == null || intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String hubUrl = bridge.getServerUrl();
        if (hubUrl == null) return;
        String title = trim(intent.getStringExtra(Intent.EXTRA_SUBJECT));
        String text = trim(intent.getStringExtra(Intent.EXTRA_TEXT));
        String url = null;
        // 허브는 title·text·url 을 줄바꿈으로 이어 붙이므로, 링크만 공유된 경우 url 로만 넘겨 두 번 적히지 않게 한다.
        if (text != null && text.matches("(?i)https?://\\S+")) {
            url = text;
            text = null;
        }
        Uri.Builder target = Uri.parse(hubUrl).buildUpon().path("/dashboard").clearQuery();
        if (title != null) target.appendQueryParameter("title", title);
        if (text != null) target.appendQueryParameter("text", text);
        if (url != null) target.appendQueryParameter("url", url);
        if (title == null && text == null && url == null) return;
        String destination = target.build().toString();
        // 공유 본문은 디버그 빌드에서만 로그에 남긴다.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        Log.i(TAG, "share -> " + (debuggable ? destination : target.build().getPath()));
        bridge.getWebView().loadUrl(destination);
    }

    private static String trim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
