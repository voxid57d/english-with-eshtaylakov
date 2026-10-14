package uz.eshtaylakov.finance;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

final class FinanceStorage {
    private static final int MAX_BYTES = 50 * 1024 * 1024;
    private static final String[] TABLES = {"accounts", "categories", "transactions", "transfers", "budgets", "debts", "debtPayments"};
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("finance-backups", Context.MODE_PRIVATE); }
    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }
    private static String now() { SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date()); }
    static String readStream(InputStream stream) throws Exception {
        if (stream == null) throw new IllegalStateException("Could not open the backup file.");
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = stream.read(buffer)) != -1) { if (output.size() + count > MAX_BYTES) throw new IllegalArgumentException("Backup exceeds the 50 MB limit."); output.write(buffer, 0, count); }
        return output.toString("UTF-8");
    }
    private static AtomicFile file(Context context, String name) { return new AtomicFile(new File(context.getFilesDir(), name)); }
    static synchronized String read(Context context) throws Exception {
        AtomicFile store = file(context, "finance.json");
        if (!store.getBaseFile().exists() && !new File(store.getBaseFile() + ".bak").exists()) {
            JSONObject tables = new JSONObject(); for (String table : TABLES) tables.put(table, new JSONArray());
            return new JSONObject().put("format", "quiet-money-backup").put("version", 1).put("currencyMode", "UZS").put("exportedAt", now()).put("conversionRate", JSONObject.NULL).put("tables", tables).toString();
        }
        try (InputStream stream = store.openRead()) { return readStream(stream); }
    }
    static synchronized String readRecovery(Context context) throws Exception { try (InputStream stream = file(context, "finance-before-restore.json").openRead()) { return readStream(stream); } }
    private static void atomicWrite(AtomicFile target, String value) throws Exception {
        FileOutputStream stream = null;
        try { stream = target.startWrite(); stream.write(value.getBytes(StandardCharsets.UTF_8)); target.finishWrite(stream); }
        catch (Exception error) { if (stream != null) target.failWrite(stream); throw error; }
    }
    static synchronized void write(Context context, String value, boolean restoring) throws Exception {
        if (value.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new IllegalArgumentException("Records exceed the 50 MB limit.");
        JSONObject backup = new JSONObject(value);
        if (!"quiet-money-backup".equals(backup.optString("format")) || backup.optInt("version") != 1 || !"UZS".equals(backup.optString("currencyMode"))) throw new IllegalArgumentException("Invalid local backup format.");
        for (String table : TABLES) backup.getJSONObject("tables").getJSONArray(table);
        if (restoring) atomicWrite(file(context, "finance-before-restore.json"), read(context));
        atomicWrite(file(context, "finance.json"), value);
    }
    static String result(boolean ok, String error) { try { return new JSONObject().put("ok", ok).put("error", error == null ? JSONObject.NULL : error).toString(); } catch (Exception ignored) { return "{\"ok\":false}"; } }
    static void setFolder(Context context, Uri folder) {
        String label = "Selected folder";
        try (Cursor cursor = context.getContentResolver().query(DocumentsContract.buildDocumentUriUsingTree(folder, DocumentsContract.getTreeDocumentId(folder)), new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) label = cursor.getString(0);
        } catch (Exception ignored) { }
        prefs(context).edit().putString("folder", folder.toString()).putString("folderName", label).remove("lastDay").remove("lastBackup").remove("error").commit();
    }
    static boolean hasFolder(Context context) { return prefs(context).contains("folder"); }
    static String status(Context context) {
        try { SharedPreferences p = prefs(context); return new JSONObject().put("folder", p.contains("folder") ? p.getString("folderName", "Selected folder") : JSONObject.NULL).put("lastBackup", p.getString("lastBackup", null)).put("error", p.getString("error", null)).put("recoveryAvailable", file(context, "finance-before-restore.json").getBaseFile().exists()).toString(); }
        catch (Exception ignored) { return "{}"; }
    }
    static synchronized boolean backupIfDue(Context context, boolean force) {
        SharedPreferences p = prefs(context); String location = p.getString("folder", null);
        if (location == null) return false;
        if (!force && today().equals(p.getString("lastDay", null))) return true;
        try {
            Uri tree = Uri.parse(location); String treeId = DocumentsContract.getTreeDocumentId(tree);
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, treeId);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeId);
            String name = "quiet-money-auto-" + today() + ".json";
            Uri target = null; ArrayList<String[]> existing = new ArrayList<>();
            try (Cursor cursor = context.getContentResolver().query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (cursor == null) throw new IllegalStateException("Could not read backup folder.");
                while (cursor.moveToNext()) {
                    String filename = cursor.getString(1), document = cursor.getString(0);
                    if (name.equals(filename)) target = DocumentsContract.buildDocumentUriUsingTree(tree, document);
                    if (filename != null && filename.matches("quiet-money-auto-\\d{4}-\\d{2}-\\d{2}\\.json")) existing.add(new String[]{filename, document});
                }
            }
            boolean created = target == null;
            if (created) target = DocumentsContract.createDocument(context.getContentResolver(), parent, "application/json", name);
            if (target == null) throw new IllegalStateException("Could not create a daily backup file.");
            try (OutputStream stream = context.getContentResolver().openOutputStream(target, "wt")) {
                if (stream == null) throw new IllegalStateException("Backup folder is not writable.");
                JSONObject backup = new JSONObject(read(context)); backup.put("exportedAt", now()); stream.write(backup.toString().getBytes(StandardCharsets.UTF_8));
            }
            p.edit().putString("lastDay", today()).putString("lastBackup", now()).remove("error").commit();
            existing.sort((left, right) -> right[0].compareTo(left[0])); int keep = created ? 29 : 30;
            for (int index = keep; index < existing.size(); index++) {
                try { DocumentsContract.deleteDocument(context.getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, existing.get(index)[1])); } catch (Exception ignored) { }
            }
            return true;
        } catch (Exception error) { p.edit().putString("error", "Daily backup failed: " + error.getMessage() + ". Choose the backup folder again if permission changed.").commit(); return false; }
    }
}
