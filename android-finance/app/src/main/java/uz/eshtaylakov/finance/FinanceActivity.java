package uz.eshtaylakov.finance;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

/** Keeps a visible recovery screen if the browser cannot complete the launch. */
public class FinanceActivity extends Activity {
    static final Uri FINANCE_URL = Uri.parse("https://eshtaylakov.uz/x97-private-portal");
    private static final String CHROME = "com.android.chrome";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TwaLauncher launcher;
    private TextView status;
    private ProgressBar progress;
    private boolean browserOpened;
    private final Runnable timeout = () -> showError(
            "Chrome did not finish opening. Tap Open in browser to continue.");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showLaunchScreen();
        // Allow Android to draw the recovery screen before binding to the browser.
        handler.post(this::openFinance);
    }

    private void showLaunchScreen() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        int padding = (int) (32 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding, padding, padding);
        layout.setBackgroundColor(Color.rgb(16, 19, 24));
        TextView title = new TextView(this);
        title.setText("Private Finance");
        title.setTextSize(26);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        layout.addView(title);
        progress = new ProgressBar(this);
        layout.addView(progress);
        status = new TextView(this);
        status.setText("Opening your finance space…");
        status.setTextColor(Color.LTGRAY);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, padding / 2, 0, padding / 2);
        layout.addView(status);
        Button openBrowser = new Button(this);
        openBrowser.setText("Open in browser");
        openBrowser.setOnClickListener(view -> openBrowser());
        layout.addView(openBrowser);
        setContentView(layout);
    }

    protected TwaLauncher createLauncher() {
        return isChromeEnabled() ? new TwaLauncher(this, CHROME) : new TwaLauncher(this);
    }

    protected void openFinance() {
        if (isFinishing() || browserOpened) return;
        try {
            launcher = createLauncher();
            handler.postDelayed(timeout, 12000);
            launcher.launch(new TrustedWebActivityIntentBuilder(FINANCE_URL),
                    new CustomTabsCallback(), null, this::onBrowserOpened,
                    (context, builder, provider, completed) -> openBrowser());
        } catch (RuntimeException error) {
            Log.e("PrivateFinance", "Could not launch finance", error);
            openBrowser();
        }
    }

    private boolean isChromeEnabled() {
        try {
            ApplicationInfo info = getPackageManager().getApplicationInfo(CHROME, 0);
            return info.enabled;
        } catch (PackageManager.NameNotFoundException missing) {
            return false;
        }
    }

    protected void openBrowser() {
        if (browserOpened || isFinishing()) return;
        handler.removeCallbacks(timeout);
        try {
            // Resolve a root URL that our finance-only intent filter cannot intercept.
            // Then explicitly target that browser to prevent reopening this app in a loop.
            String browserPackage = isChromeEnabled() ? CHROME : null;
            if (browserPackage == null) {
                Intent probe = new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://eshtaylakov.uz/"));
                probe.addCategory(Intent.CATEGORY_BROWSABLE);
                for (ResolveInfo browser : getPackageManager().queryIntentActivities(probe, 0)) {
                    if (!getPackageName().equals(browser.activityInfo.packageName)) {
                        browserPackage = browser.activityInfo.packageName;
                        break;
                    }
                }
            }
            if (browserPackage == null) {
                showError("Please install or enable Chrome, then reopen Private Finance.");
                return;
            }
            CustomTabsIntent tab = new CustomTabsIntent.Builder().build();
            tab.intent.setPackage(browserPackage);
            tab.launchUrl(this, FINANCE_URL);
            onBrowserOpened();
        } catch (RuntimeException error) {
            Log.e("PrivateFinance", "Browser fallback failed", error);
            showError("Could not open Chrome. Open Chrome once, then try Open in browser.");
        }
    }

    private void onBrowserOpened() {
        browserOpened = true;
        handler.removeCallbacks(timeout);
        finish();
    }

    private void showError(String message) {
        if (isFinishing() || browserOpened) return;
        progress.setVisibility(android.view.View.GONE);
        status.setText(message);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (launcher != null) launcher.destroy();
        super.onDestroy();
    }
}
