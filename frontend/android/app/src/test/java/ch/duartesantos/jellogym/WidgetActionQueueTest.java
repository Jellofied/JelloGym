package ch.duartesantos.jellogym;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** The widget tap queue both sides share (WidgetActionQueue.java, lib/widget-actions.js). */
public class WidgetActionQueueTest {
    private static JSONObject tap(String id, int ml) throws Exception {
        return new JSONObject("{\"id\":\"" + id + "\",\"action\":\"water\",\"d\":\"2026-11-14\",\"ml\":" + ml + "}");
    }

    @Test
    public void onlyWholeMlOnARealDayIsAnAction() throws Exception {
        assertEquals("a1", WidgetActionQueue.parseAction(tap("a1", 250).toString()).optString("id"));
        assertNull(WidgetActionQueue.parseAction(null));
        assertNull(WidgetActionQueue.parseAction("not json"));
        assertNull(WidgetActionQueue.parseAction("{\"id\":\"a\",\"action\":\"food\",\"d\":\"2026-11-14\",\"ml\":250}"));
        assertNull(WidgetActionQueue.parseAction("{\"id\":\"a\",\"action\":\"water\",\"d\":\"nope\",\"ml\":250}"));
        assertNull(WidgetActionQueue.parseAction("{\"id\":\"a\",\"action\":\"water\",\"d\":\"2026-11-14\",\"ml\":0}"));
        assertNull(WidgetActionQueue.parseAction("{\"id\":\"a\",\"action\":\"water\",\"d\":\"2026-11-14\",\"ml\":2001}"));
    }

    @Test
    public void noteTapsUseTheFourGenericTags() throws Exception {
        for (String tag : new String[]{"note", "idea", "todo", "reminder"}) {
            String json = "{\"id\":\"n1\",\"action\":\"day-note\",\"d\":\"2026-11-14\",\"tag\":\"" + tag + "\"}";
            assertEquals(tag, WidgetActionQueue.parseAction(json).optString("tag"));
        }
        assertNull(WidgetActionQueue.parseAction("{\"id\":\"n1\",\"action\":\"day-note\",\"d\":\"2026-11-14\",\"tag\":\"sick\"}"));
    }

    @Test
    public void aTapIsQueuedOnceAndDrainedInOrder() throws Exception {
        JSONArray q = WidgetActionQueue.parse(null);
        q = WidgetActionQueue.add(q, tap("a1", 250));
        q = WidgetActionQueue.add(q, tap("a2", 500));
        q = WidgetActionQueue.add(q, tap("a1", 250)); // a redelivered tap: no second entry
        assertEquals(2, WidgetActionQueue.events(q).length());
        assertEquals("a1", WidgetActionQueue.events(q).optJSONObject(0).optString("id"));
        assertEquals("a2", WidgetActionQueue.events(q).optJSONObject(1).optString("id"));
        assertEquals(1, WidgetActionQueue.ack(q, Arrays.asList("a1")).length());
        assertEquals("a2", WidgetActionQueue.events(WidgetActionQueue.ack(q, Arrays.asList("a1"))).optJSONObject(0).optString("id"));
    }

    @Test
    public void queuedTapsShowOnTheWidgetBeforeThePageDrains() throws Exception {
        String snapJson = "{\"today\":\"2026-11-14\","
                + "\"water\":{\"d\":\"2026-11-14\",\"ml\":1300,\"goal\":2000,\"pct\":0.65,\"mlText\":\"1.3 L\",\"line\":\"700 ml to go\"},"
                + "\"food\":{\"d\":\"2026-11-14\",\"kcal\":600,\"goal\":2000,\"protein\":40,\"proteinGoal\":120,\"pct\":0.3,\"kcalText\":\"600 kcal\",\"line\":\"1400 kcal to go\",\"proteinLine\":\"40 / 120 g protein\"},"
                + "\"habits\":[{\"id\":\"h1\",\"line\":\"0 / 3\",\"done\":false}],"
                + "\"note\":{\"tag\":\"\",\"text\":\"\",\"line\":\"\"}}";
        JSONObject snap = new JSONObject(snapJson);
        JSONArray q = WidgetActionQueue.parse(null);
        q = WidgetActionQueue.add(q, tap("a1", 250));
        q = WidgetActionQueue.add(q, tap("old", 500).put("d", "2026-11-13"));
        q = WidgetActionQueue.add(q, new JSONObject("{\"id\":\"f1\",\"action\":\"food\",\"d\":\"2026-11-14\",\"kcal\":300,\"protein\":20}"));
        q = WidgetActionQueue.add(q, new JSONObject("{\"id\":\"h2\",\"action\":\"habit\",\"d\":\"2026-11-14\",\"h\":\"h1\"}"));
        q = WidgetActionQueue.add(q, new JSONObject("{\"id\":\"n1\",\"action\":\"day-note\",\"d\":\"2026-11-14\",\"tag\":\"idea\",\"text\":\"easy day\"}"));

        JSONObject live = WidgetActionQueue.overlay(q, snap);
        JSONObject water = live.getJSONObject("water");
        assertEquals(1550, water.getInt("ml"));
        assertEquals("1.55 L", water.getString("mlText"));
        assertEquals("450 ml to go", water.getString("line"));
        assertEquals(0.775, water.getDouble("pct"), 0.001);
        JSONObject food = live.getJSONObject("food");
        assertEquals(900, food.getInt("kcal"));
        assertEquals("60 / 120 g protein", food.getString("proteinLine"));
        assertEquals("1 / 3", live.getJSONArray("habits").getJSONObject(0).getString("line"));
        assertEquals("Idea · easy day", live.getJSONObject("note").getString("line"));
        assertEquals(1300, snap.getJSONObject("water").getInt("ml")); // the stored snapshot is not touched
    }

    @Test
    public void aBrokenQueueStartsEmptyAndAnOldOneIsCapped() throws Exception {
        assertEquals(0, WidgetActionQueue.events(WidgetActionQueue.parse("{oops")).length());
        JSONArray q = WidgetActionQueue.parse(null);
        for (int i = 0; i < WidgetActionQueue.MAX + 5; i++) q = WidgetActionQueue.add(q, tap("a" + i, 250));
        assertEquals(WidgetActionQueue.MAX, q.length());
        assertEquals("a5", q.optJSONObject(0).optString("id")); // oldest first to go
        assertNull(WidgetActionQueue.add(q, null));
    }
}
