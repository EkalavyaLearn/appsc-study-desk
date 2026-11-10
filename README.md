# APPSC Study Desk — public website

Free, ad-free, independent study website by EkalavyaLearn. Support: nalamalan@gmail.com.

## Files

- `index.html`, `app.js`, `styles.css`: browser study dashboard.
- `content.json`: reviewed public lesson catalogue; preserve stable IDs and content-version facts.
- `about.html`: project introduction and support links.
- `privacy.html`: browser-edition privacy notice for GitHub Pages hosting.
- `.nojekyll`: serve these static files without Jekyll processing.

## Deploy

Publish this directory's contents at the root of a dedicated repository. In GitHub Settings → Pages, choose **Deploy from a branch**, then the publication branch and **/(root)**. No build or package installation is required. Keep all filenames and relative paths together; a project URL or custom domain is supported. Do not create a CNAME until the domain is confirmed and configured. Review the privacy notice if the hosting provider changes.

Only this directory is intended for public publication. Never include Android signing files, applicant records, OTPR data, certificates, application PDFs, fee receipts, local account records or the private preparation dashboard.

## Update lessons

Prepare and review content through the existing Android project's documented content workflow. Copy the resulting public `app/src/main/assets/content.json` here, keeping IDs stable. Verify schema/version, quiz explanations and source links, then commit and publish the update. Do not change `data_as_of` unless official facts were checked. Native app source and its existing content endpoint are separate; website publication does not update them.

This export contains three prepared lessons, 45 questions, 25 subjects, 62 resources and five notification tracks. Future study weeks are outlines. The JSON content version and original source-check dates are preserved.

## Local review

Serve this directory over HTTP (for example, `python -m http.server 8000`) and open the local URL. Opening index.html directly with file:// may prevent the lesson catalogue from loading. Check the prepared lessons and quizzes, subject/post views, library filters, local progress persistence and backup export/import. `node --check app.js` checks JavaScript syntax.

## Browser storage

Progress is saved only in local storage for the current website address and browser. Export and import it to move browsers or domains. The website needs internet to open/reload and does not guarantee offline reopening. Official resource documents stay on their external source websites.

GitHub documentation: [Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [hosting data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).
