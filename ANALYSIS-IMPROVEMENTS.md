# Analysis speed and evidence reliability

The default and detailed modes use one Gemini pass with high media resolution. The explicit double-review mode can use a second pass if at least 12 seconds remain in the shared 45-second analysis budget. Gemini calls have a 30-second per-attempt limit and at most one retry for transient HTTP failures. Invalid requests, authentication failures and aborted calls are not retried. Cancellation stops waiting locally; Google may still charge for work already started.

The second pass returns a complete replacement diagnosis, so it can retract weak findings. There are no confidence or severity bonuses for extra detector boxes. Provider responses must validate, refer to existing numbered photos, and keep boxes within their image. New outcomes distinguish visible defects, no visible defect, and insufficient evidence. A clean visual result is not a safety certification.

Photo preparation keeps the submitted pixels intact. The app rejects sets above 4,000,000 bytes before upload, leaving room for multipart overhead under Vercel's request limit. Use fewer intentional photos or close-up crops with a context photo for fine defects. Larger original sets need a future authenticated direct-to-storage upload flow. The live quality coach samples a small canvas but records original frame dimensions; saved camera captures retain native resolution.

The optional detector is used only in double-review mode, with an 8-second wait budget and depth inference disabled. Detector candidates are returned separately in the `yolo` response, not treated as established diagnosis evidence. Deploy the updated Python service to preserve `image_index` across batch detections and reuse the loaded SAHI model; older unlabelled multi-photo detector results are discarded. Python's depth model startup behavior is unchanged.

The UI uses an uncropped image plane for evidence boxes, hides unidentifiable legacy multi-photo boxes, and invalidates results when captures change. Unsaved reports show an explicit export warning. Navigation and API caching were adjusted so old app shells and cached inspection responses do not mask current behavior.

## Validation

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run test:e2e`. Playwright now starts a local server on port 3187. Tests cover the default call count, coherent second-pass replacement, malformed responses, cancellation, upload budgets, photo identity, and image-plane geometry.

These changes reduce unnecessary calls and incorrect evidence handling. Actual latency and diagnostic accuracy are not benchmarked without a configured service and labelled construction photographs. Before deployment, compare the old and new versions on the same held-out cases: clean surfaces, cosmetic defects, severe defects, blurry/low-light photos, thermal captures and multiple views. Record false positives on clean images, recall of severe findings, per-image localization, unsuccessful analyses, and p50/p95 end-to-end latency. Keep a separate test set when tuning prompts or thresholds.

## Remaining release work

The earlier review's guest ownership checks, SQL workflow failures, automatic demo fallbacks, real PDF export, installer assignment, spending limits and dependency advisories remain separate release blockers. This patch is a focused speed/evidence improvement, not production approval. No deployment or remote database change is included.

Provider references: [Gemini cancellation configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), [media resolution](https://ai.google.dev/gemini-api/docs/generate-content/media-resolution), [Vercel request limits](https://vercel.com/docs/functions/limitations).
