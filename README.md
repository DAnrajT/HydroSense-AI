# AquaGuard — Premium Dark Smart Water Leakage Detection

AquaGuard is a responsive, Firebase-authenticated web dashboard for the BE final-year IoT + AI water leakage detection project. It reuses the existing Firebase Realtime Database paths:

- `/readings` — historical sensor readings
- `/latest` — newest sensor reading
- `/status` — AI prediction (`normal` or `leak`)
- `/command` — requested valve state (`open` or `close`)

The frontend includes login/registration, password reset, live sensor cards, inlet/outlet chart, history, CSV export, simulator, and valve command controls. The Python detector is deployed as a continuously running Render background worker. The website can be hosted on Netlify. Neither service requires you to keep your computer running after deployment.

> Important: I cannot publish this to your accounts from this package. You must supply your Firebase Web App configuration and approve the Netlify/Render deployments in your own accounts. Do not send passwords, Firebase user credentials, or service-account keys in chat.

## Deployment without Command Prompt

### A. Configure the frontend Firebase settings

1. Open the extracted project folder in File Explorer.
2. Open `site/firebase-config.js` with Notepad.
3. In [Firebase Console](https://console.firebase.google.com/), select project `water-leak-detection-5228d` → **Project settings → General → Your apps**.
4. Create/register a Web app if needed and copy its `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId` into `site/firebase-config.js`. Keep the existing Realtime Database URL if it matches the URL shown in your console.
5. In **Authentication → Sign-in method**, enable **Email/Password**.
6. In **Authentication → Settings → Authorized domains**, add the Netlify domain after Netlify gives you one (for example, `your-site-name.netlify.app`).
7. In **Realtime Database → Rules**, review and publish `database.rules.json` only if its prototype permissions fit your demo. The included rules require login but allow any signed-in account to read/write the database; that is not suitable for a production system with untrusted users. Never use public read/write rules.

### B. Publish the website to Netlify by dragging the folder

1. Sign in to [Netlify](https://app.netlify.com/).
2. Open [Netlify Drop](https://app.netlify.com/drop).
3. Drag the **`site` folder** from the extracted project onto the drop area. The folder must contain `index.html`, `app.js`, `styles.css`, `styles-dark.css`, and `firebase-config.js`.
4. Wait for the deploy to finish and open the Netlify URL.
5. Add the exact Netlify domain under Firebase Authentication → Settings → Authorized domains, then reload the site.
6. Register a demo account on the AquaGuard login page or sign in with an existing Firebase Email/Password account.

The frontend is now hosted. It reads `/readings`, `/latest`, `/status`, and `/command` directly from Firebase after sign-in. The dashboard's simulator writes test data to Firebase.

### C. Publish the Python AI detector to Render without commands

The Render background worker reads `/latest`, uses the scikit-learn model, writes predictions to `/status`, and writes a close command to `/command` after three consecutive leak predictions.

1. Sign in to [GitHub](https://github.com/) and create a **private** repository named `aquaguard-water-leak-detection`.
2. In the new repository, choose **Add file → Upload files**. Upload the backend/deployment files from the extracted project root: `common.py`, `fetch_data.py`, `live_detector.py`, `train_model.py`, `requirements.txt`, and `render.yaml`. Commit the files. You can do this in the browser; do not upload `firebase-config.js` with real configuration values or any credentials to the repository.
3. Sign in to [Render](https://render.com/) and connect GitHub if prompted.
4. Choose **New → Blueprint**, select your private repository, and deploy the blueprint. Render reads `render.yaml` and creates the `aquaguard-ai-detector` background worker.
5. When prompted for environment variables, provide these in Render's private environment settings:
   - `FIREBASE_API_KEY` — Web API key from Firebase Project settings → Your apps
   - `FIREBASE_EMAIL` — a dedicated Firebase demo/operator account email
   - `FIREBASE_PASSWORD` — that account's password
   - `FIREBASE_DATABASE_URL` is prefilled with the project's existing Realtime Database URL; confirm it matches your Firebase console.
6. Keep these credentials only in Render's environment settings. Do not put them in GitHub, frontend JavaScript, screenshots, or chat.
7. Open the Render worker's **Logs** tab. A successful start should show `Detector running. Waiting for readings...`. If authentication fails, verify the three Firebase environment variables and the database rules.

Render background workers may require a paid instance depending on current plan availability. Review the cost shown before confirming deployment. If you do not deploy the worker, the website can still show sensor data and the simulator, but AI status will remain on standby unless another detector writes `/status`.

### D. First end-to-end test

1. Open the deployed Netlify URL and sign in.
2. Open **Valve & simulator**.
3. Select **Load normal example** and send a reading. Confirm the live values/history update.
4. Select **Load leak example** and send several readings, waiting for each new timestamp. Confirm the Render worker logs show predictions and the dashboard's status changes.
5. After three consecutive leak predictions, the detector sends `{ "valve": "close" }` to `/command`.

## Model and validation notes

`render.yaml` trains a demonstration model from 5,000 synthetic examples at build time if there is no `dataset.csv`. This allows the worker to start without manually running Python commands, but synthetic-only metrics are **not evidence of real-world accuracy**. For a defensible final-year evaluation, collect labelled normal/leak readings from your simulator and then real sensors, retrain with those samples, and test on a separate holdout set. The included synthetic model is a bootstrap/demo model only.

The simulator timestamps readings in seconds. Avoid sending multiple readings within the same second while testing because `live_detector.py` checks for a changed timestamp. For a production-quality implementation, use a unique reading ID or millisecond timestamp.

## Physical ESP32 integration

The website's valve buttons write a command to Firebase. They do not operate a physical valve on their own. ESP32 firmware must read `/command`, drive a compatible valve driver, and report actual valve feedback. This is an academic prototype, not a safety-critical leak prevention system.

## Files

- `site/` — frontend files for Netlify drag-and-drop deployment
- `index.html`, `app.js`, `styles.css`, `styles-dark.css` — web app and premium dark styling
- `firebase-config.js` — Firebase Web App configuration placeholders
- `database.rules.json` — authenticated prototype rules; review before use
- `common.py` — shared Firebase REST authentication, database helpers and feature engineering
- `fetch_data.py` — download Firebase readings to `dataset.csv`
- `train_model.py` — compare Decision Tree, Random Forest and SVM and save `model.joblib`
- `live_detector.py` — live prediction loop and valve command
- `render.yaml` — browser-deployed Render background worker blueprint
- `esp32_mimic.html` — original simulator retained for reference; use the authenticated simulator inside the dashboard when database rules require login

## Troubleshooting

- **Firebase configuration warning:** edit `site/firebase-config.js` and verify `apiKey`, `appId`, and `messagingSenderId`.
- **auth/operation-not-allowed:** enable Email/Password in Firebase Authentication.
- **auth/unauthorized-domain:** add the deployed Netlify domain to Firebase Authentication → Settings → Authorized domains.
- **PERMISSION_DENIED:** check that you are signed in and that Firebase Realtime Database rules allow the intended authenticated access.
- **No AI status:** confirm the Render worker is running and check its logs; verify the Firebase environment variables.
- **No readings:** use the dashboard simulator and check `/readings` and `/latest` in Firebase.
- **Security:** never publish service-account JSON, user passwords, refresh tokens, or private credentials. The Firebase Web API key is public app configuration, but database rules and authentication must still protect data.
