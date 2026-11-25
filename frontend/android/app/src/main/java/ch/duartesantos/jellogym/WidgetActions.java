package ch.duartesantos.jellogym;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Collection;
import org.json.JSONArray;

/** The queued widget taps, kept in this app's own SharedPreferences until the page drains them. */
final class WidgetActions {
    static final String PREFS = "jellogym_widget_actions";
    static final String QUEUE = "queue";

    private WidgetActions() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void enqueue(Context context, org.json.JSONObject action) {
        JSONArray q = WidgetActionQueue.add(WidgetActionQueue.parse(prefs(context).getString(QUEUE, null)), action);
        if (q != null) prefs(context).edit().putString(QUEUE, q.toString()).apply();
    }

    static JSONArray pending(Context context) {
        return WidgetActionQueue.parse(prefs(context).getString(QUEUE, null));
    }

    static JSONArray drain(Context context) {
        return WidgetActionQueue.events(pending(context));
    }

    static void ack(Context context, Collection<String> ids) {
        JSONArray q = WidgetActionQueue.ack(WidgetActionQueue.parse(prefs(context).getString(QUEUE, null)), ids);
        prefs(context).edit().putString(QUEUE, q.toString()).apply();
    }
}
