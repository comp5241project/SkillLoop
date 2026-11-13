# SkillLoop project page

Static project introduction, independent of the application and its AI services.

- Project page: https://comp5241project.github.io/SkillLoop/
- Live application: https://skillloop-sigma.vercel.app/
- Source repository: https://github.com/comp5241project/SkillLoop

Edit `index.html`, `style.css` and `script.js`. Assets are local and links are relative, so the page works under the repository's GitHub Pages path. The interactive examples are labelled illustrations, not live AI responses. The dialogue screenshot comes from the actual prototype.

Source lives under `project-page/` on `feature/project-page`. The `gh-pages` branch contains only this directory's published contents. GitHub Pages publishes from that branch's root. Application branches and Vercel configuration are not modified.

To publish from the source branch after editing:

```sh
git subtree split --prefix=project-page -b project-page-release
git push origin project-page-release:gh-pages
```

Use a new temporary release branch name if it already exists. Never force-push the application branch to publish this page.

Visual structure inspired by https://meta-interactiveworld.github.io/. All project copy and interactions are original to SkillLoop; no affiliation is implied.
