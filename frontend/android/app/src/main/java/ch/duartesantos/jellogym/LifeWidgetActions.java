package ch.duartesantos.jellogym;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import java.util.UUID;
import org.json.JSONObject;

/** Queued taps from the life-module widgets (the page applies them in lib/widget-actions.js). */
final class LifeWidgetActions {
    static final String EXTRA = WidgetActionReceiver.EXTRA_ACTION;

    private LifeWidgetActions() {}

    static JSONObject action(String kind, String d) {
        JSONObject a = new JSONObject();
        try {
            a.put("id", System.currentTimeMillis() + "-" + UUID.randomUUID());
            a.put("action", kind);
            a.put("d", d);
        } catch (Exception e) {
            return null;
        }
        return a;
    }

    static PendingIntent send(Context context, JSONObject action, int requestCode) {
        if (action == null) return JelloGymWidgetProvider.open(context, "jellogym://home", requestCode);
        Intent i = new Intent(context, WidgetActionReceiver.class).putExtra(EXTRA, action.toString());
        return PendingIntent.getBroadcast(context, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent food(Context context, String d, int kcal, int protein, String label, int requestCode) {
        JSONObject a = action("food", d);
        try {
            a.put("kcal", kcal);
            a.put("protein", protein);
            a.put("label", label);
        } catch (Exception e) { }
        return send(context, a, requestCode);
    }

    static PendingIntent habit(Context context, String d, String id, int requestCode) {
        JSONObject a = action("habit", d);
        try { a.put("h", id); } catch (Exception e) { }
        return send(context, a, requestCode);
    }

    static PendingIntent note(Context context, String d, String tag, int requestCode) {
        JSONObject a = action("day-note", d);
        try { a.put("tag", tag); } catch (Exception e) { }
        return send(context, a, requestCode);
    }
}
