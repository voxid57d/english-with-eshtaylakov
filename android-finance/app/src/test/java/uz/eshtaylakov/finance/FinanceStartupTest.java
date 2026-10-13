package uz.eshtaylakov.finance;

import android.content.Intent;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.robolectric.Shadows.shadowOf;
import android.app.Application;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import org.robolectric.RuntimeEnvironment;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class FinanceStartupTest {
    @Test
    public void launcherCanStartWithoutAnInstalledBrowser() {
        Intent launch = new Intent(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try (var controller = Robolectric.buildActivity(FinanceActivity.class, launch)) {
            controller.setup();
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertFalse(controller.get().isFinishing());
        }
    }

    public static class FailingLauncherActivity extends FinanceActivity {
        @Override
        protected TwaLauncher createLauncher() {
            throw new IllegalStateException("Simulated startup failure");
        }
    }

    @Test
    public void startupFailureFallsBackToChromeAtTheFinanceUrl() {
        Application app = RuntimeEnvironment.getApplication();
        ApplicationInfo chrome = new ApplicationInfo();
        chrome.packageName = "com.android.chrome";
        chrome.enabled = true;
        PackageInfo chromePackage = new PackageInfo();
        chromePackage.packageName = chrome.packageName;
        chromePackage.applicationInfo = chrome;
        shadowOf(app.getPackageManager()).installPackage(chromePackage);
        Intent launch = new Intent(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // An incoming URL must never redirect the finance app to another section or domain.
        launch.setData(android.net.Uri.parse("https://example.org/"));
        try (var controller = Robolectric.buildActivity(FailingLauncherActivity.class, launch)) {
            controller.setup();
            shadowOf(android.os.Looper.getMainLooper()).idle();
            Intent browser = shadowOf(controller.get()).getNextStartedActivity();
            assertEquals("com.android.chrome", browser.getPackage());
            assertEquals(FinanceActivity.FINANCE_URL, browser.getData());
        }
    }
}
