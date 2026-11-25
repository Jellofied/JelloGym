package ch.duartesantos.jellogym;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import java.util.UUID;
import org.json.JSONObject;

/**
 * The Water widget at 2x2: the day's drinks as a dot ring and dot numerals (DotPattern), with four
 * taps that queue a drink for the page (WidgetActionReceiver, lib/widget-actions.js). What it shows
 * is the app's snapshot (lib/widgets.js), read from the same SharedPreferences as the bigger widget.
 * When Water is off the whole card says so and no button logs anything.
 */
public class WaterWidgetProvider extends AppWidgetProvider {
    private static final int[] CUPS = {R.id.water_cup_0, R.id.water_cup_1, R.id.water_cup_2};
    private static final int[] QUICK = {50, 100, 150};

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(context, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, android.os.Bundle options) {
        draw(context, mgr, id);
    }

    /** Every Water widget redrawn after the app wrote a new snapshot. */
    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, WaterWidgetProvider.class));
        for (int id : ids) draw(context, mgr, id);
    }

    private static void draw(Context context, AppWidgetManager mgr, int id) {
        try { mgr.updateAppWidget(id, build(context, id)); }
        catch (Exception e) { /* the launcher no longer has this widget */ }
    }

    static RemoteViews build(Context context, int id) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_water);
        JSONObject snap = JelloGymWidgetProvider.liveSnapshot(context);
        JSONObject water = snap == null ? null : snap.optJSONObject("water");
        if (water == null) {
            v.setTextViewText(R.id.water_off, snap == null
                    ? context.getString(R.string.widget_life_unsynced)
                    : context.getString(R.string.widget_water_off));
            v.setViewVisibility(R.id.water_art, View.GONE);
            v.setViewVisibility(R.id.water_caption, View.GONE);
            v.setViewVisibility(R.id.water_cups, View.GONE);
            v.setViewVisibility(R.id.water_off, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://home", id * 10));
            return v;
        }

        int accent = JelloGymWidgetProvider.accentOf(snap);
        int dim = (accent & 0x00FFFFFF) | 0x33000000;
        v.setImageViewBitmap(R.id.water_ring_base, DotBitmap.draw(context, DotPattern.ring(), dim, 5.5f));
        v.setImageViewBitmap(R.id.water_ring_arc, DotBitmap.draw(context, DotPattern.arc((float) water.optDouble("pct", 0)), accent, 5.5f));
        v.setImageViewBitmap(R.id.water_digits, DotBitmap.draw(context, DotPattern.digits(String.valueOf(water.optInt("ml", 0))), accent, 5.5f));

        String caption = water.optString("line", "");
        if (caption.isEmpty()) caption = water.optString("mlText", "");
        v.setTextViewText(R.id.water_caption, caption);

        for (int i = 0; i < CUPS.length; i++) {
            int ml = QUICK[i];
            v.setTextViewText(CUPS[i], String.valueOf(ml));
            v.setOnClickPendingIntent(CUPS[i], log(context, ml, id * 10 + i + 1));
        }
        v.setOnClickPendingIntent(R.id.water_other, input(context, QUICK[0], id * 10 + 4));
        v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://water", id * 10 + 5));
        return v;
    }

    /** A quick-add tap: the action is queued at tap time, with today's date from the phone. */
    private static PendingIntent log(Context context, int ml, int requestCode) {
        JSONObject action = new JSONObject();
        try {
            action.put("id", System.currentTimeMillis() + "-" + UUID.randomUUID());
            action.put("action", "water");
            action.put("d", JelloGymWidgetProvider.today());
            action.put("ml", ml);
        } catch (Exception e) {
            return JelloGymWidgetProvider.open(context, "jellogym://water", requestCode);
        }
        Intent i = new Intent(context, WidgetActionReceiver.class).putExtra(WidgetActionReceiver.EXTRA_ACTION, action.toString());
        return PendingIntent.getBroadcast(context, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent input(Context context, int ml, int requestCode) {
        Intent i = new Intent(context, WidgetInputActivity.class).putExtra(WidgetInputActivity.EXTRA_ML, ml);
        return PendingIntent.getActivity(context, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
