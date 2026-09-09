-- Parental screen-time control is removed (was FR-TIME-01..05). Nothing bounds
-- how long or when a child uses the app; learning time is still measured
-- server-side for the parent dashboard and the weekly report (FR-TIME-06).
--
-- Irreversible: the daily limits and access windows parents set are dropped,
-- not archived. Nothing has read them since the endpoints went, so no data
-- migration precedes this.
DROP TABLE "ScreenTimeSetting";
