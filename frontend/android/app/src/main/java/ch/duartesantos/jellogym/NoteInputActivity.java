package ch.duartesantos.jellogym;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import org.json.JSONObject;

/** The Note widget's typed note: RemoteViews cannot host an EditText, so this is a small dialog. */
public class NoteInputActivity extends Activity {
    static final String EXTRA_D = "d";
    static final String EXTRA_TAG = "tag";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bundle extras = getIntent() == null ? null : getIntent().getExtras();
        String d = extras == null ? JelloGymWidgetProvider.today() : extras.getString(EXTRA_D, JelloGymWidgetProvider.today());
        String tag = extras == null ? "note" : extras.getString(EXTRA_TAG, "note");
        setContentView(R.layout.widget_note_input);
        EditText field = findViewById(R.id.note_input_text);
        findViewById(R.id.note_input_cancel).setOnClickListener(v -> finish());
        Button save = findViewById(R.id.note_input_save);
        save.setOnClickListener(v -> {
            JSONObject action = LifeWidgetActions.action("day-note", d);
            try {
                action.put("tag", tag);
                action.put("text", field.getText().toString().trim());
            } catch (Exception e) {
                finish();
                return;
            }
            WidgetActions.enqueue(this, action);
            JelloGymWidgetProvider.updateAll(this);
            finish();
        });
    }
}
