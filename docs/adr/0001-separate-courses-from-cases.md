# Separate courses from case definitions

A Case Definition owns the problem and evaluation contract. A Course owns the teaching sequence and may refer to a versioned case through an optional Case Binding. M4 uses a single Course Unit for `cart-checkout@1 / edge-cases`. The course can have its own publication history without changing the case version or depending on the legacy Knowledge Map graph.

Each owned Course has a private working copy of the existing TeacherDraft. Its draft ID and revision keep their M3 meaning. A teacher reviews a saved revision and explicitly releases a separately numbered, immutable snapshot built from the existing student preview and canonical case context. The snapshot stores only learner-facing material. Supabase Auth and the existing SkillLoop role directory identify teachers and students. M4 gets separate PostgreSQL tables with ownership policies and a server-only runtime role so an account cannot bypass server validation through the Data API.

A signed-in learner can start and submit practice against an exact published version. The teacher sees counts from those persisted attempts. Standalone authoring, multi-unit courses and automatic handoff from the production diagnosis, teaching, repair and verification stages are deferred.
