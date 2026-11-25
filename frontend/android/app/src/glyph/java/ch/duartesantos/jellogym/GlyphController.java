package ch.duartesantos.jellogym;

import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import com.nothing.ketchum.Glyph;
import com.nothing.ketchum.GlyphException;
import com.nothing.ketchum.GlyphManager;
import java.util.Arrays;

/**
 * Real Nothing Glyph strips (sideload and Play builds only). The Phone (3a) Pro has 36 channels,
 * not a bitmap: this lights them in order for the workout's set progress, and clears them when the
 * session ends. The SDK says foreground only, so the app runs GlyphService while a workout is on.
 */
public final class GlyphController {
    private static final String TAG = "JelloGymGlyph";
    private static final int CHANNELS = 36;
    private static final int BRIGHTNESS = 1800;
    private static GlyphManager manager;
    private static boolean open, connected;
    private static float lastPct = -1;

    private GlyphController() {}

    public static boolean supported(Context context) { return Build.MODEL != null && Build.MODEL.startsWith("A059"); }

    public static synchronized void start(Context context) {
        if (!supported(context) || manager != null) return;
        try {
            manager = GlyphManager.getInstance(context.getApplicationContext());
            manager.init(new GlyphManager.Callback() {
                @Override
                public void onServiceConnected(ComponentName name) {
                    try {
                        if (!manager.register(Build.MODEL)) manager.register(Glyph.DEVICE_24111);
                        if (lastPct >= 0) draw(lastPct);
                        manager.openSession();
                        open = true;
                        connected = true;
                        if (lastPct >= 0) draw(lastPct);
                    } catch (GlyphException | RuntimeException e) {
                        Log.w(TAG, "Glyph session: " + e.getMessage());
                    }
                }

                @Override
                public void onServiceDisconnected(ComponentName name) {
                    open = false;
                    connected = false;
                }
            });
        } catch (RuntimeException e) {
            Log.w(TAG, "Glyph init: " + e.getMessage());
            manager = null;
        }
    }

    /** 0..1 of the workout's sets; called every couple of seconds by GlyphService. */
    public static synchronized void progress(Context context, float pct) {
        lastPct = Math.max(0, Math.min(1, pct));
        if (manager == null) start(context);
        if (connected && open) draw(lastPct);
    }

    public static synchronized void stop(Context context) {
        lastPct = -1;
        if (manager == null) return;
        try { draw(0); } catch (RuntimeException e) { /* phone went away */ }
        try { if (open) manager.closeSession(); } catch (GlyphException | RuntimeException e) { /* gone */ }
        try { manager.unInit(); } catch (RuntimeException e) { /* gone */ }
        manager = null;
        open = false;
        connected = false;
    }

    private static void draw(float pct) {
        if (manager == null) return;
        int[] colors = new int[CHANNELS];
        int lit = Math.round(pct * CHANNELS);
        Arrays.fill(colors, 0, Math.min(CHANNELS, lit), BRIGHTNESS);
        try { manager.setFrameColors(colors); }
        catch (GlyphException | RuntimeException e) { Log.w(TAG, "Glyph frame: " + e.getMessage()); }
    }
}
