package app.moonlight.hub;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.WebViewListener;
import java.util.Map;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MoonlightShare";
    private static final String PERF_TAG = "MoonlightPerf";
    // 스플래시는 첫 프레임에서 바로 걷히고(추가 대기 없음) 이 시간 동안 흐려진다.
    private static final long SPLASH_FADE_MS = 200L;

    private boolean restoring;
    private boolean firstPaintLogged;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // core-splashscreen: 시스템 스플래시(어두운 면 + 런처 아이콘)를 첫 프레임까지 두고, 걷힐 때 흐리게 사라진다.
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setOnExitAnimationListener(provider -> {
            View view = provider.getView();
            view.animate().alpha(0f).setDuration(SPLASH_FADE_MS).withEndAction(provider::remove).start();
        });
        // 프로세스 복원 때 시스템이 원래 인텐트(SEND·VIEW)를 다시 넘기므로 같은 공유·링크를 두 번 열지 않는다.
        restoring = savedInstanceState != null;
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            configureWebView(bridge);
        }
        // 뒤로 가기: WebView 기록을 거슬러 가고, 더 갈 곳이 없거나 대체 화면이면 시스템 기본(앱 닫기)으로 넘긴다.
        // 대체 화면에서 뒤로 가면 실패한 주소를 다시 열어 같은 화면으로 돌아오는 고리가 생기므로 여기서 끊는다.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView != null && webView.canGoBack() && !isOfflinePage(webView.getUrl())) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    private void configureWebView(Bridge bridge) {
        WebView webView = bridge.getWebView();
        // HTTP 캐시 헤더를 그대로 따른다(허브의 _next/static 은 immutable 이라 재방문이 빠르다).
        webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        // 허브를 못 열었을 때 대체 화면에 실패한 경로와 이유를 넘긴다(Capacitor 기본은 errorPath 만 연다).
        bridge.setWebViewClient(new HubWebViewClient(bridge));
        // 콜드 스타트 체감 지표: 프로세스 시작부터 허브 첫 화면이 그려질 때까지(경로·내용은 남기지 않는다).
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                if (firstPaintLogged || !isHubUrl(bridge, url == null ? null : Uri.parse(url))) return;
                firstPaintLogged = true;
                long elapsed = SystemClock.uptimeMillis() - Process.getStartUptimeMillis();
                Log.i(PERF_TAG, "first hub paint " + elapsed + "ms");
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
        if (bridge == null || intent == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            openShare(intent);
        } else if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            openLink(intent.getData());
        }
    }

    // App Links·런처 바로가기: 허브 host 의 https 주소만 그 경로 그대로 WebView 에서 연다. 다른 주소는 무시한다.
    private void openLink(Uri uri) {
        if (!isHubUrl(bridge, uri)) return;
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        Log.i(TAG, "view -> " + (debuggable ? uri.toString() : uri.getPath()));
        bridge.getWebView().loadUrl(uri.toString());
    }

    private void openShare(Intent intent) {
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

    private boolean isOfflinePage(String url) {
        String errorUrl = bridge == null ? null : bridge.getErrorUrl();
        return url != null && errorUrl != null && url.startsWith(errorUrl);
    }

    static boolean isHubUrl(Bridge bridge, Uri uri) {
        if (bridge == null || uri == null) return false;
        String serverUrl = bridge.getServerUrl();
        if (serverUrl == null) return false;
        Uri hub = Uri.parse(serverUrl);
        return "https".equalsIgnoreCase(uri.getScheme())
            && hub.getHost() != null
            && hub.getHost().equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && uri.getUserInfo() == null;
    }

    private static String trim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Capacitor 의 BridgeWebViewClient 는 메인 프레임 오류에서 errorPath(www/index.html)만 연다.
     * 허브 주소가 실패하면 같은 대체 화면을 열고, 그 화면이 다 읽힌 뒤 실패한 경로(from)·이유(reason)·
     * 허브 주소(hub)를 window.moonlightShowFailure(...) 로 건네 "다시 시도"가 원래 가려던 곳으로 돌아가게 한다.
     *
     * URL(쿼리·#fragment)로 넘기지 않는 이유: Capacitor 로컬 서버는 요청 URL 전체가 errorPath 와 같을 때만
     * 번들 자산을 내주고(WebViewLocalServer.isErrorUrl), WebView 는 fragment 까지 요청 URL 에 담아 보낸다 —
     * 무엇이든 붙이면 요청이 네트워크로 새어 실패한다(2026-09-26 에뮬레이터 실측). 같은 이유로 www/hub-config.js 도
     * 대체 화면에서는 읽히지 않아 허브 주소도 여기서 건넨다.
     * 리스너 알림은 부모에게 맡기고(메인 프레임이 아닌 요청으로 감싸 부모의 errorPath 이동만 막는다),
     * 이동은 여기서 한 번만 한다.
     */
    private static final class HubWebViewClient extends BridgeWebViewClient {

        private final Bridge bridge;
        private String pendingFailureScript;

        HubWebViewClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!handlesMainFrameFailure(request)) {
                super.onReceivedError(view, request, error);
                return;
            }
            super.onReceivedError(view, new NotMainFrameRequest(request), error);
            showFailure(view, request.getUrl(), "net:" + error.getErrorCode());
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (!handlesMainFrameFailure(request)) {
                super.onReceivedHttpError(view, request, errorResponse);
                return;
            }
            super.onReceivedHttpError(view, new NotMainFrameRequest(request), errorResponse);
            showFailure(view, request.getUrl(), "http:" + errorResponse.getStatusCode());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            String errorUrl = bridge.getErrorUrl();
            if (pendingFailureScript != null && url != null && errorUrl != null && url.startsWith(errorUrl)) {
                view.evaluateJavascript(pendingFailureScript, null);
                pendingFailureScript = null;
            }
        }

        private boolean handlesMainFrameFailure(WebResourceRequest request) {
            return request.isForMainFrame() && bridge.getErrorUrl() != null && isHubUrl(bridge, request.getUrl());
        }

        private void showFailure(WebView view, Uri failed, String reason) {
            String path = failed.getEncodedPath();
            if (path == null || path.isEmpty()) path = "/";
            String query = failed.getEncodedQuery();
            String from = query == null ? path : path + "?" + query;
            pendingFailureScript =
                "window.moonlightShowFailure && window.moonlightShowFailure({from:" +
                JSONObject.quote(from) +
                ",reason:" +
                JSONObject.quote(reason) +
                ",hub:" +
                JSONObject.quote(bridge.getServerUrl()) +
                "});";
            view.loadUrl(bridge.getErrorUrl());
        }
    }

    /** 부모 클라이언트가 errorPath 로 이동하지 않도록 isForMainFrame 만 false 로 바꾼 위임 요청. */
    private static final class NotMainFrameRequest implements WebResourceRequest {

        private final WebResourceRequest delegate;

        NotMainFrameRequest(WebResourceRequest delegate) {
            this.delegate = delegate;
        }

        @Override
        public Uri getUrl() {
            return delegate.getUrl();
        }

        @Override
        public boolean isForMainFrame() {
            return false;
        }

        @Override
        public boolean isRedirect() {
            return delegate.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return delegate.hasGesture();
        }

        @Override
        public String getMethod() {
            return delegate.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return delegate.getRequestHeaders();
        }
    }
}
