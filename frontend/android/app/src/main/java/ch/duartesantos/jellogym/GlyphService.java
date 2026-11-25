package ch.duartesantos.jellogym;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

/** Keeps the Nothing Glyph strips showing set progress while a workout runs. Android only. */
public class GlyphService extends Service {
    public static final String ACTION_START = "ch.duartesantos.jellogym.GLYPH_START";
    public static final String ACTION_STOP = "ch.duartesantos.jellogym.GLYPH_STOP";
    private static final int ID = 8301;
    private static final String CHANNEL = "jellogym_glyph";
    private static final long TICK_MS = 2000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            JSONObject snap = JelloGymWidgetProvider.snapshot(GlyphService.this);
            JSONObject glyph = snap == null ? null : snap.optJSONObject("glyph");
            if (glyph == null) {
                stopSelf();
                return;
            }
            GlyphController.progress(GlyphService.this, (float) glyph.optDouble("pct", 0));
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(ID, notification());
        GlyphController.start(this);
        handler.removeCallbacks(tick);
        tick.run();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        GlyphController.stop(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /** Starts (or stops) the foreground service from the app or from the widget bridge. */
    public static void set(Context context, boolean on) {
        Intent i = new Intent(context, GlyphService.class).setAction(on ? ACTION_START : ACTION_STOP);
        try {
            if (on) ContextCompat.startForegroundService(context, i);
            else context.startService(i);
        } catch (RuntimeException e) {
            // Android 12+ can refuse background starts; the next snapshot write tries again.
        }
    }

    private Notification notification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL,
                        getString(R.string.widget_glyph_channel), NotificationManager.IMPORTANCE_LOW));
            }
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_widget_dumbbell)
                .setContentTitle(getString(R.string.widget_glyph_title))
                .setContentText(getString(R.string.widget_glyph_text))
                .setOngoing(true)
                .build();
    }
}
