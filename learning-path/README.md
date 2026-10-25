# Learning path — module 2

Choose whether to take a five-question diagnostic, then select a background, goal and learning preferences. Recommendations use authored rules and course data, not an AI assessment.

- `index.html`: assessment and profile forms, recommended path.
- `data.js`: question bank, course options and path rules.
- `script.js`: randomised assessment, recommendations and persistence.
- `style.css`: module styles.

The existing full record stays under `skillloop_learning_path_data_v10`. Rendering a path also shares `background`, `goal` and `quizScore` through `SkillLoop.write('profile', ...)`, so new interviews can use the selected experience level. Existing records in other modules are retained.

Run `npm run dev` from the repository root and open `/learning-path/`. Check taking or skipping the assessment, all three backgrounds, both goals, saving, resetting and refreshing a path. Course cards describe recommendations; they do not represent completed lessons or measured mastery.
