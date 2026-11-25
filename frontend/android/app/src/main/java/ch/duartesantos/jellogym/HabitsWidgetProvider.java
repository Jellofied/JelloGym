package ch.duartesantos.jellogym;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** The Habits widget at 4x3: today's due habits, each with a real one-tap checkbox. */
public class HabitsWidgetProvider extends AppWidgetProvider {
    private static final int[] NAMES = {R.id.habit_name_0, R.id.habit_name_1, R.id.habit_name_2, R.id.habit_name_3};
    private static final int[] LINES = {R.id.habit_line_0, R.id.habit_line_1, R.id.habit_line_2, R.id.habit_line_3};
    private static final int[] CHECKS = {R.id.habit_check_0, R.id.habit_check_1, R.id.habit_check_2, R.id.habit_check_3};
    private static final int[] ROWS = {R.id.habit_row_0, R.id.habit_row_1, R.id.habit_row_2, R.id.habit_row_3};

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(context, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, android.os.Bundle options) {
        draw(context, mgr, id);
    }

    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, HabitsWidgetProvider.class))) draw(context, mgr, id);
    }

    private static void draw(Context context, AppWidgetManager mgr, int id) {
        try { mgr.updateAppWidget(id, build(context, id)); }
        catch (Exception e) { /* the launcher no longer has this widget */ }
    }

    static RemoteViews build(Context context, int id) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_habits);
        JSONObject snap = JelloGymWidgetProvider.liveSnapshot(context);
        JSONArray habits = snap == null ? null : snap.optJSONArray("habits");
        if (habits == null || habits.length() == 0) {
            v.setTextViewText(R.id.habits_off, snap == null
                    ? context.getString(R.string.widget_life_unsynced)
                    : context.getString(R.string.widget_habits_off));
            v.setViewVisibility(R.id.habits_rows, View.GONE);
            v.setViewVisibility(R.id.habits_off, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://home", id * 10));
            return v;
        }
        String d = snap.optString("today", JelloGymWidgetProvider.today());
        int accent = JelloGymWidgetProvider.accentOf(snap);
        for (int i = 0; i < ROWS.length; i++) {
            JSONObject h = i < habits.length() ? habits.optJSONObject(i) : null;
            if (h == null || h.optString("id", "").isEmpty()) {
                v.setViewVisibility(ROWS[i], View.GONE);
                continue;
            }
            v.setViewVisibility(ROWS[i], View.VISIBLE);
            v.setTextViewText(NAMES[i], h.optString("name", "Habit"));
            v.setTextViewText(LINES[i], h.optString("line", ""));
            boolean done = h.optBoolean("done", false);
            String name = h.optString("name", "Habit");
            v.setImageViewResource(CHECKS[i], done ? R.drawable.ic_widget_checkbox_checked : R.drawable.ic_widget_checkbox);
            v.setInt(CHECKS[i], "setColorFilter", accent);
            v.setContentDescription(CHECKS[i], name + (done ? ", checked" : ", not checked"));
            v.setOnClickPendingIntent(CHECKS[i], LifeWidgetActions.habit(context, d, h.optString("id"), id * 10 + i + 1));
        }
        v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://habits", id * 10 + 9));
        return v;
    }
}
