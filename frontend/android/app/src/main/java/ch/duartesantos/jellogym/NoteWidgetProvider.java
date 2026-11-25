package ch.duartesantos.jellogym;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** The Note widget at 4x2: today's note, four tag taps and a typed note. */
public class NoteWidgetProvider extends AppWidgetProvider {
    private static final String[] TAGS = {"note", "idea", "todo", "reminder"};
    private static final int[] CHIPS = {R.id.note_tag_0, R.id.note_tag_1, R.id.note_tag_2, R.id.note_tag_3};

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
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, NoteWidgetProvider.class))) draw(context, mgr, id);
    }

    private static void draw(Context context, AppWidgetManager mgr, int id) {
        try { mgr.updateAppWidget(id, build(context, id)); }
        catch (Exception e) { /* the launcher no longer has this widget */ }
    }

    static RemoteViews build(Context context, int id) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_note);
        JSONObject snap = JelloGymWidgetProvider.liveSnapshot(context);
        JSONObject note = snap == null ? null : snap.optJSONObject("note");
        String d = snap == null ? JelloGymWidgetProvider.today() : snap.optString("today", JelloGymWidgetProvider.today());
        v.setTextViewText(R.id.note_line, note == null ? context.getString(R.string.widget_note_empty) : note.optString("line", ""));
        for (int i = 0; i < CHIPS.length; i++) {
            v.setOnClickPendingIntent(CHIPS[i], LifeWidgetActions.note(context, d, TAGS[i], id * 10 + i + 1));
        }
        String current = note == null ? "note" : note.optString("tag", "note");
        Intent input = new Intent(context, NoteInputActivity.class)
                .putExtra(NoteInputActivity.EXTRA_D, d)
                .putExtra(NoteInputActivity.EXTRA_TAG, current);
        v.setOnClickPendingIntent(R.id.note_edit, PendingIntent.getActivity(context, id * 10 + 6, input,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setOnClickPendingIntent(R.id.widget_root, JelloGymWidgetProvider.open(context, "jellogym://home", id * 10 + 7));
        return v;
    }
}
