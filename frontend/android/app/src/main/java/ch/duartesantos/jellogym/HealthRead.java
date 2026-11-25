package ch.duartesantos.jellogym;

import androidx.health.connect.client.records.HeartRateRecord;
import androidx.health.connect.client.records.SleepSessionRecord;
import androidx.health.connect.client.records.WeightRecord;
import androidx.health.connect.client.records.metadata.Metadata;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * What HealthConnectPlugin hands to JS when it reads (v1.4.3): plain values, no Android classes,
 * so it is tested on the JVM (HealthReadTest). Heart rate as [ms, bpm] pairs inside the window
 * asked for; weigh-ins as { t, kg, id, origin, clientId }. Which of them JelloGym takes, and how,
 * is decided in JS (lib/health-read.js), which also skips JelloGym's own records.
 */
final class HealthRead {
    private HealthRead() {}

    // Beyond this no reading is plausible; lib/heart-rate.js applies the same bounds again.
    static final long BPM_MIN = 25;
    static final long BPM_MAX = 250;
    // A workout of a few hours at one sample a second is well under this.
    static final int MAX_SAMPLES = 50000;

    /** The samples of these records that lie in [from, to], oldest first. */
    static List<long[]> samples(List<HeartRateRecord> records, long from, long to) {
        List<long[]> out = new ArrayList<>();
        for (HeartRateRecord r : records) {
            for (HeartRateRecord.Sample s : r.getSamples()) {
                long t = s.getTime().toEpochMilli();
                long bpm = s.getBeatsPerMinute();
                if (t < from || t > to || bpm < BPM_MIN || bpm > BPM_MAX) continue;
                out.add(new long[] { t, bpm });
                if (out.size() >= MAX_SAMPLES) break;
            }
            if (out.size() >= MAX_SAMPLES) break;
        }
        out.sort((a, b) -> Long.compare(a[0], b[0]));
        return out;
    }

    /** One weigh-in as JS gets it. */
    static final class Weight {
        final long t;
        final double kg;
        final String id, origin, clientId;

        Weight(long t, double kg, String id, String origin, String clientId) {
            this.t = t; this.kg = kg; this.id = id; this.origin = origin; this.clientId = clientId;
        }
    }

    /** One day's steps as JS gets it: the local midnight, the total and a stable day id. */
    static final class Step {
        final long t, n;
        final String id, d;

        Step(long t, long n, String id, String d) {
            this.t = t; this.n = n; this.id = id; this.d = d;
        }
    }

    /** A local-midnight window for one aggregate call. */
    static final class StepDay {
        final long from, to;
        final String d;

        StepDay(long from, long to, String d) {
            this.from = from; this.to = to; this.d = d;
        }
    }

    /** Local days to aggregate, each split at midnight so DST and travel never split a count. */
    static List<StepDay> stepDays(long since, long now, ZoneId zone) {
        List<StepDay> out = new ArrayList<>();
        if (!(since > 0) || !(now > 0)) return out;
        LocalDate first = Instant.ofEpochMilli(since).atZone(zone).toLocalDate();
        LocalDate last = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
            long from = d.atStartOfDay(zone).toInstant().toEpochMilli();
            long to = d.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
            out.add(new StepDay(from, to, d.toString()));
        }
        return out;
    }

    /** One day's deduped total, in the shape the JS merge expects. */
    static Step dailyStep(StepDay day, long n) {
        if (n < 0 || n > 100000) return null;
        return new Step(day.from, n, "hc-day-" + day.d, day.d);
    }

    /** One sleep session as JS gets it: the window start to end. v1 keeps the window only;
     *  stage rows (deep, REM, awake) ride with the stage chart, later. */
    static final class Sleep {
        final long s, e;
        final String id, origin, clientId;

        Sleep(long s, long e, String id, String origin, String clientId) {
            this.s = s; this.e = e; this.id = id; this.origin = origin; this.clientId = clientId;
        }
    }

    static List<Sleep> sleeps(List<SleepSessionRecord> records) {
        List<Sleep> out = new ArrayList<>();
        for (SleepSessionRecord r : records) {
            long s = r.getStartTime().toEpochMilli(), e = r.getEndTime().toEpochMilli();
            if (e - s < 5 * 60000L || e - s > 900 * 60000L) continue;
            Metadata m = r.getMetadata();
            out.add(new Sleep(s, e, m.getId(), m.getDataOrigin().getPackageName(), m.getClientRecordId()));
        }
        return out;
    }

    static List<Weight> weights(List<WeightRecord> records) {
        List<Weight> out = new ArrayList<>();
        for (WeightRecord r : records) {
            Metadata m = r.getMetadata();
            double kg = r.getWeight().getKilograms();
            if (!(kg > 0)) continue;
            out.add(new Weight(r.getTime().toEpochMilli(), kg, m.getId(),
                    m.getDataOrigin().getPackageName(), m.getClientRecordId()));
        }
        return out;
    }

    /** The JS names of the read permissions, as the manifest declares them. */
    static String readPermission(String name) {
        // Null is what JS can send in an array element; a switch on it would throw inside the
        // plugin call. asked() turns the null into a clear rejection instead.
        if (name == null) return null;
        switch (name) {
            case "heartRate": return "android.permission.health.READ_HEART_RATE";
            case "weight": return "android.permission.health.READ_WEIGHT";
            case "steps": return "android.permission.health.READ_STEPS";
            case "sleep": return "android.permission.health.READ_SLEEP";
            // Not a data type: data older than 30 days before the first grant (#801).
            case "history": return "android.permission.health.READ_HEALTH_DATA_HISTORY";
            default: return null;
        }
    }

    static String writePermission(String name) {
        if (name == null) return null;
        switch (name) {
            case "exercise": return "android.permission.health.WRITE_EXERCISE";
            case "weight": return "android.permission.health.WRITE_WEIGHT";
            case "hydration": return "android.permission.health.WRITE_HYDRATION";
            default: return null;
        }
    }
}
