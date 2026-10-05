# Athlete video analysis

## Implemented workflow

`/video-analysis` accepts an MP4, WebM or MOV clip, or camera recording when supported by an HTTPS browser. Clips are limited to 120 seconds and 100 MB. Athletes specify sport, exercise, date and an optional existing workout.

MediaPipe Pose Landmarker lite runs on the device in a Web Worker. Model and WASM assets are served from `/pose`, not a third-party video-analysis API. Decoded frames are sampled at 10 Hz. The worker returns normalized body landmarks; image-plane knee angles (or elbow angles for push-ups) use the video aspect ratio. No frame is sent to an AI vendor.

The athlete can replay the recording with a pose overlay, inspect angle trends, and save a report together with its video. Browser IndexedDB archives use a compound key containing the authenticated Firebase UID and report UUID. Account changes clear the mounted workspace. Reports are accessible from Home, Training history and the related session details.

## Measurement boundaries

- **Squats/push-ups:** estimated complete repetitions require extension, flexion and return, with hysteresis, a minimum cycle duration, at least 70% tracked samples and at least ten tracked frames. Tracking gaps reset partial cycles. The athlete must review and can correct the count.
- **Sprint:** measured course distance is entered by the athlete. Start and finish image markers can be placed by tapping or entering their horizontal positions. AI suggests crossing times from a visible hip midpoint moving across both markers in one unambiguous pass. Gaps, missing visibility and multiple crossings are rejected. Athletes can instead mark video timestamps manually. Speed is distance divided by elapsed time, an average over that distance. It is not peak speed or timing-gate accuracy. Both crossings, camera geometry and the physical course distance need review.
- **Other sports/exercises:** the report shows visible joint-angle trends and notes, without an automatic technique rating or rep count for unsupported movements.
- **Fatigue:** at least six reliably detected repetitions allow an early/late mean-rep-duration comparison. Slowing is an observation and can reflect pauses, pacing or camera/tracking effects; it does not diagnose fatigue. A readiness check-in from the recording date supplies separately labelled self-reported energy and soreness context. No video-derived medical or readiness score is generated.
- **Performance integration:** only an explicitly reviewed positive repetition count or sprint duration can become a performance test. The report's UUID provides an idempotent test ID. Protocols distinguish reviewed video results from other testing methods. Existing performance graphs and PR calculation consume the confirmed test. A video report never adds session volume or training load.

Use one fully visible athlete, a stable camera, adequate lighting and a clear side view. Validation against labelled real exercise videos and timing gates is still needed before making accuracy claims. Camera recording depends on browser codec/camera support; unsupported browsers can upload a compatible MP4.

## Persistence and deployment

Local save works with the existing Firebase sign-in and does not require a new cloud database. Videos and reports remain in the same browser; clearing site storage removes them. Export downloads report JSON, including measurements and metadata, rather than a portable video backup. Private cloud upload is a separate opt-in action and uploads the original video only; report cross-device synchronization is not implemented.

Private uploads use Firebase Storage at `athletes/{UID}/videos/{report UUID}/source`. `storage.rules` limits access to the authenticated path owner, accepts video MIME types only and caps files at 100 MB. The app does not generate or expose public download URLs. Rules cannot inspect file bytes; uploads are not public or executed. Deleting an uploaded report deletes its cloud video before the local archive. The separately saved performance test is retained, as stated in the delete confirmation.

Enable/configure Firebase Storage for `loadfactor-c2e73` as appropriate to the project's billing/setup. Review the candidate rules against any rules already deployed, then deploy them:

```powershell
firebase deploy --only storage --project loadfactor-c2e73
```

The existing Phase 1 Firestore setup is required to add a reviewed result to performance testing. Deploying code to Vercel does not deploy Firebase rules. Failed cloud actions display errors and keep the local recording. No service credentials are included in the client code.

## Validation

- Calculation tests cover aspect-ratio-aware angles, missing/multiple/occluded subjects, rep completion, gaps, sprint direction/crossings, review requirements, dates, file size/type and clip bounds.
- IndexedDB tests verify that the same report UUID in two accounts does not mix their archives, blobs survive reads, and deletion is scoped to its owner.
- `node scripts/check-video-storage-rules.cjs` tests mocked Storage ownership, unauthenticated access, content types and size limits without deploying or writing real records. It uses a signed-in Firebase CLI; `FIREBASE_TOOLS_LIB` can point to its `lib` directory.
- Assets are pinned to MediaPipe Tasks Vision 1.0.1 and the model hash documented in `public/pose/NOTICE.md`. Keep package/runtime files aligned when upgrading.

References: [Google MediaPipe web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [Firebase Storage upload guide](https://firebase.google.com/docs/storage/web/upload-files), [Firebase Storage rules](https://firebase.google.com/docs/storage/security/rules-conditions).
