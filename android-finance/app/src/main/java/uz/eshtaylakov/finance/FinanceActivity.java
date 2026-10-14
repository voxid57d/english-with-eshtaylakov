package uz.eshtaylakov.finance;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** All content comes from the APK. No remote pages or browser handoff. */
public class FinanceActivity extends ComponentActivity {
    static final String LOCAL_URL = "https://appassets.androidplatform.net/assets/finance/index.html";
    private static final int EXPORT = 1, IMPORT = 2, FOLDER = 3;
    WebView web;
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private String pendingExport;
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { handleBack(); }
        });
        try {
            web = new WebView(this);
            FrameLayout layout = new FrameLayout(this);
            layout.setOnApplyWindowInsetsListener((view, insets) -> {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets;
            });
            layout.addView(web); setContentView(layout);
            web.setBackgroundColor(0xfff5f3ee);
            web.getSettings().setJavaScriptEnabled(true);
            web.getSettings().setDomStorageEnabled(true);
            web.getSettings().setAllowFileAccess(false);
            web.getSettings().setAllowContentAccess(false);
            web.getSettings().setBlockNetworkLoads(true);
            web.setWebChromeClient(new WebChromeClient());
            web.addJavascriptInterface(new Bridge(), "FinanceNative");
            web.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl(); String path = url.getPath();
                    if ("https".equals(url.getScheme()) && "appassets.androidplatform.net".equals(url.getHost()) &&
                            ("/assets/finance/index.html".equals(path) || "/assets/finance/app.js".equals(path) || "/assets/finance/app.css".equals(path))) {
                        try {
                            String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
                            return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring("/assets/".length())));
                        } catch (Exception missing) { /* Never fetch missing assets from the network. */ }
                    }
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Offline only", null, new ByteArrayInputStream(new byte[0]));
                }
            });
            web.loadUrl(LOCAL_URL);
            files.execute(() -> {
                if (FinanceStorage.hasFolder(this)) {
                    try { FinanceBackupJob.schedule(this); } catch (RuntimeException error) { event("backup", "error", error.getMessage()); }
                }
                FinanceStorage.backupIfDue(this, false);
            });
        } catch (RuntimeException error) {
            TextView message = new TextView(this); message.setPadding(32, 64, 32, 32);
            message.setText("Could not start the offline interface. Update Android System WebView and reopen. Your saved files have not been removed."); setContentView(message);
        }
    }
    private void event(String kind, String key, String value) {
        try {
            JSONObject detail = new JSONObject().put("kind", kind).put(key, value);
            String script = "window.dispatchEvent(new CustomEvent('finance-native',{detail:" + detail + "}));";
            runOnUiThread(() -> { if (web != null && !isFinishing()) web.evaluateJavascript(script, null); });
        } catch (Exception ignored) { }
    }
    public class Bridge {
        @JavascriptInterface public String readState() {
            try { return FinanceStorage.read(FinanceActivity.this); } catch (Exception error) { return FinanceStorage.result(false, error.getMessage()); }
        }
        @JavascriptInterface public String saveState(String value) {
            try { FinanceStorage.write(FinanceActivity.this, value, false); return FinanceStorage.result(true, null); } catch (Exception error) { return FinanceStorage.result(false, error.getMessage()); }
        }
        @JavascriptInterface public String restoreState(String value) {
            try { FinanceStorage.write(FinanceActivity.this, value, true); files.execute(() -> FinanceStorage.backupIfDue(FinanceActivity.this, true)); return FinanceStorage.result(true, null); } catch (Exception error) { return FinanceStorage.result(false, error.getMessage()); }
        }
        @JavascriptInterface public String recoveryState() {
            try { return FinanceStorage.readRecovery(FinanceActivity.this); } catch (Exception error) { return FinanceStorage.result(false, error.getMessage()); }
        }
        @JavascriptInterface public String backupStatus() { return FinanceStorage.status(FinanceActivity.this); }
        @JavascriptInterface public void exportBackup() {
            runOnUiThread(() -> {
                try {
                    pendingExport = FinanceStorage.read(FinanceActivity.this);
                    Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                    picker.putExtra(Intent.EXTRA_TITLE, "quiet-money-" + FinanceStorage.today() + ".json"); startActivityForResult(picker, EXPORT);
                } catch (Exception error) { event("export", "error", "Could not start export: " + error.getMessage()); }
            });
        }
        @JavascriptInterface public void importBackup() {
            runOnUiThread(() -> { try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), IMPORT); }
                catch (RuntimeException error) { event("import", "error", "Could not open the file picker."); } });
        }
        @JavascriptInterface public void chooseBackupFolder() {
            runOnUiThread(() -> { try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION), FOLDER); }
                catch (RuntimeException error) { event("folder", "error", "Could not open the folder picker."); } });
        }
        @JavascriptInterface public void backupNow() { files.execute(() -> {
            boolean ok = FinanceStorage.backupIfDue(FinanceActivity.this, true); event("backup", ok ? "message" : "error", ok ? "Backup saved." : "Backup failed. Check the folder and try again.");
        }); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) { pendingExport = null; return; }
        Uri uri = data.getData(); String export = pendingExport; pendingExport = null;
        files.execute(() -> {
            try {
                if (request == EXPORT) {
                    if (export == null) throw new IllegalStateException("Export was interrupted. Please try again.");
                    try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) {
                        if (stream == null) throw new IllegalStateException("Could not open export file."); stream.write(export.getBytes(StandardCharsets.UTF_8));
                    }
                    event("export", "message", "Backup exported. Keep a copy outside this phone.");
                } else if (request == IMPORT) {
                    try (InputStream stream = getContentResolver().openInputStream(uri)) { event("import", "text", FinanceStorage.readStream(stream)); }
                } else if (request == FOLDER) {
                    int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    if ((flags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) != (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) throw new IllegalStateException("The chosen folder must allow reading and writing.");
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); FinanceStorage.setFolder(this, uri); FinanceBackupJob.schedule(this);
                    boolean ok = FinanceStorage.backupIfDue(this, true); event("folder", ok ? "message" : "error", ok ? "Daily backups enabled. First backup saved." : "Folder selected, but the first backup failed. Check permissions.");
                }
            } catch (Exception error) { event("files", "error", error.getMessage() == null ? "File operation failed." : error.getMessage()); }
        });
    }
    private void handleBack() {
        if (web != null) web.evaluateJavascript("window.FinanceBack ? window.FinanceBack() : false", closed -> { if (!"true".equals(closed)) finish(); });
        else finish();
    }
    @Override protected void onDestroy() {
        if (web != null) { web.removeJavascriptInterface("FinanceNative"); web.destroy(); web = null; } files.shutdown(); super.onDestroy();
    }
}
