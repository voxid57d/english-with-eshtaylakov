package uz.eshtaylakov.finance;
import android.app.job.*;
import android.content.*;
import java.util.concurrent.*;

public class FinanceBackupJob extends JobService {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    static void schedule(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null || scheduler.schedule(new JobInfo.Builder(1701, new ComponentName(context, FinanceBackupJob.class)).setPersisted(true).setPeriodic(24 * 60 * 60 * 1000L).build()) != JobScheduler.RESULT_SUCCESS)
            throw new IllegalStateException("Android could not schedule daily backups. Backups will still be checked when the app opens.");
    }
    @Override public boolean onStartJob(JobParameters params) { executor.execute(() -> { FinanceStorage.backupIfDue(this, false); jobFinished(params, false); }); return true; }
    @Override public boolean onStopJob(JobParameters params) { return true; }
    @Override public void onDestroy() { executor.shutdown(); super.onDestroy(); }
}
