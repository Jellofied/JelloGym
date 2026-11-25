package ch.duartesantos.jellogym;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The Home Screen widget's taps waiting for the page (WidgetActionReceiver.java and
 * WidgetBridgePlugin.java), as pure functions over the queue JSON so they are tested on the JVM
 * (WidgetActionQueueTest.java). The page's twin is lib/widget-actions.js.
 *
 * A queued action is { "id": ..., "action": "water", "d": "YYYY-MM-DD", "ml": n }. The id is both
 * its place in the queue and, on the page, the id of the entry it logs, so a replay after a crash
 * writes the same entry again rather than a second one. A queue no page drained for a long time is
 * capped, oldest first.
 */
public final class WidgetActionQueue {
    public static final int MAX = 100;

    private WidgetActionQueue() {}

    /** The queue as stored, or empty for nothing or a broken file. */
    public static JSONArray parse(String text) {
        if (text == null || text.isEmpty()) return new JSONArray();
        try { return new JSONArray(text); } catch (JSONException e) { return new JSONArray(); }
    }

    /** A well-formed action from a widget, or null. Both taps and typed amounts come through here. */
    public static JSONObject parseAction(String text) {
        try {
            JSONObject a = new JSONObject(text);
            String id = a.optString("id", "");
            String action = a.optString("action", "");
            if (id.isEmpty()) return null;
            if (!a.optString("d", "").matches("\\d{4}-\\d{2}-\\d{2}")) return null;
            if ("water".equals(action)) {
                int ml = a.optInt("ml", 0);
                return ml > 0 && ml <= 2000 ? a : null;
            }
            if ("food".equals(action)) {
                int kcal = a.optInt("kcal", 0);
                return kcal > 0 && kcal <= 5000 ? a : null;
            }
            if ("habit".equals(action)) return a.optString("h", "").isEmpty() ? null : a;
            if ("day-note".equals(action)) {
                String tag = a.optString("tag", "");
                return java.util.Arrays.asList("note", "idea", "todo", "reminder").contains(tag) ? a : null;
            }
            return null;
        } catch (JSONException | NullPointerException e) {
            return null;
        }
    }

    /** The queue with one action added, or null when it is not an action. Already there: unchanged. */
    public static JSONArray add(JSONArray queue, JSONObject action) {
        if (action == null) return null;
        String id = action.optString("id", "");
        if (id.isEmpty()) return null;
        List<JSONObject> rows = rows(queue);
        for (JSONObject row : rows) if (id.equals(row.optString("id"))) return queue;
        rows.add(action);
        int from = Math.max(0, rows.size() - MAX);
        return new JSONArray(rows.subList(from, rows.size()));
    }

    /** The actions, in the order they were tapped, for the page's drain. */
    public static JSONArray events(JSONArray queue) {
        JSONArray out = new JSONArray();
        for (JSONObject row : rows(queue)) out.put(row);
        return out;
    }

    /** The queue without the actions the page is done with. */
    public static JSONArray ack(JSONArray queue, Collection<String> ids) {
        JSONArray out = new JSONArray();
        for (JSONObject row : rows(queue)) if (!ids.contains(row.optString("id"))) out.put(row);
        return out;
    }

    /**
     * The snapshot with taps still waiting for the page applied. A widget draws at tap time and
     * cannot wait for the page to drain the queue; the stored snapshot stays the app's own copy.
     */
    public static JSONObject overlay(JSONArray queue, JSONObject snap) {
        if (snap == null) return null;
        JSONObject live;
        try { live = new JSONObject(snap.toString()); } catch (JSONException e) { return snap; }
        String day = live.optString("today", "");
        try {
            for (JSONObject a : rows(queue)) {
                String action = a.optString("action", "");
                String d = a.optString("d", "");
                if ("water".equals(action)) {
                    JSONObject w = live.optJSONObject("water");
                    if (w == null || !d.equals(w.optString("d", ""))) continue;
                    int ml = w.optInt("ml", 0) + a.optInt("ml", 0);
                    int goal = w.optInt("goal", 0);
                    w.put("ml", ml);
                    w.put("pct", goal > 0 ? Math.min(1.0, (double) ml / goal) : 0.0);
                    w.put("mlText", mlText(ml));
                    w.put("line", goal > 0 && ml >= goal ? "Goal reached" : Math.max(0, goal - ml) + " ml to go");
                } else if ("food".equals(action)) {
                    JSONObject f = live.optJSONObject("food");
                    if (f == null || !d.equals(f.optString("d", ""))) continue;
                    int kcal = f.optInt("kcal", 0) + a.optInt("kcal", 0);
                    int protein = f.optInt("protein", 0) + a.optInt("protein", 0);
                    int goal = f.optInt("goal", 0), pGoal = f.optInt("proteinGoal", 0);
                    f.put("kcal", kcal);
                    f.put("protein", protein);
                    f.put("pct", goal > 0 ? Math.min(1.0, (double) kcal / goal) : 0.0);
                    f.put("kcalText", kcal + " kcal");
                    f.put("line", goal > 0 && kcal >= goal ? "Calorie goal reached" : Math.max(0, goal - kcal) + " kcal to go");
                    f.put("proteinLine", protein + " / " + pGoal + " g protein");
                } else if ("habit".equals(action)) {
                    String h = a.optString("h", "");
                    if (h.isEmpty() || !d.equals(day)) continue;
                    JSONArray habits = live.optJSONArray("habits");
                    if (habits == null) continue;
                    for (int i = 0; i < habits.length(); i++) {
                        JSONObject row = habits.optJSONObject(i);
                        if (row == null || !h.equals(row.optString("id", ""))) continue;
                        Matcher m = Pattern.compile("^(\\d+) / (\\d+)( min)?$").matcher(row.optString("line", ""));
                        if (m.matches()) {
                            int target = Integer.parseInt(m.group(2));
                            int cur = Math.min(target, Integer.parseInt(m.group(1)) + 1);
                            row.put("line", cur + " / " + target + (m.group(3) == null ? "" : " min"));
                            row.put("done", cur >= target);
                        } else row.put("done", true);
                        break;
                    }
                } else if ("day-note".equals(action) && d.equals(day)) {
                    JSONObject n = live.optJSONObject("note");
                    if (n == null) { n = new JSONObject(); live.put("note", n); }
                    String tag = a.optString("tag", "");
                    String text = a.has("text") ? a.optString("text", "") : n.optString("text", "");
                    String label = noteLabel(tag);
                    n.put("tag", tag);
                    n.put("line", label.isEmpty() ? text : text.isEmpty() ? label : label + " · " + text);
                }
            }
        } catch (JSONException e) {
            return live; // a partly overlaid copy is better than no draw
        }
        return live;
    }

    private static String mlText(int ml) {
        if (ml < 1000) return ml + " ml";
        return new DecimalFormat("0.00", DecimalFormatSymbols.getInstance(Locale.ROOT)).format(ml / 1000.0)
                .replaceAll("0+$", "").replaceAll("\\.$", "") + " L";
    }

    private static String noteLabel(String tag) {
        if ("note".equals(tag)) return "Note";
        if ("idea".equals(tag)) return "Idea";
        if ("todo".equals(tag)) return "To do";
        if ("reminder".equals(tag)) return "Reminder";
        return "";
    }

    private static List<JSONObject> rows(JSONArray queue) {
        List<JSONObject> out = new ArrayList<>();
        if (queue == null) return out;
        for (int i = 0; i < queue.length(); i++) {
            JSONObject row = queue.optJSONObject(i);
            if (row != null) out.add(row);
        }
        return out;
    }
}
