package uz.eshtaylakov.finance;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.json.JSONObject;
import android.content.Context;
import android.content.pm.PackageManager;

@RunWith(RobolectricTestRunner.class) @Config(sdk = 28)
public class FinanceStartupTest {
    @Test public void opensBundledInterfaceWithoutInternetPermissionOrBrowser() {
        try (var activity = Robolectric.buildActivity(FinanceActivity.class).setup()) {
            assertFalse(activity.get().isFinishing()); assertNotNull(activity.get().web);
            assertEquals(FinanceActivity.LOCAL_URL, shadowOf(activity.get().web).getLastLoadedUrl());
            assertNull(shadowOf(activity.get()).getNextStartedActivity());
            assertEquals(PackageManager.PERMISSION_DENIED, activity.get().checkSelfPermission("android.permission.INTERNET"));
        }
    }
    @Test public void restoreKeepsRecoveryAndBadWriteLeavesDataIntact() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        JSONObject first = new JSONObject(FinanceStorage.read(context)); first.put("exportedAt", "2026-10-13T00:00:00Z");
        FinanceStorage.write(context, first.toString(), false);
        JSONObject second = new JSONObject(first.toString()); second.put("exportedAt", "2026-10-14T00:00:00Z");
        FinanceStorage.write(context, second.toString(), true);
        assertEquals(first.toString(), FinanceStorage.readRecovery(context));
        try { FinanceStorage.write(context, "{}", true); fail("Invalid backup accepted"); } catch (Exception expected) { }
        assertEquals(second.toString(), FinanceStorage.read(context)); assertEquals(first.toString(), FinanceStorage.readRecovery(context));
    }
}
