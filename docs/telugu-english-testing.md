# Telugu-English receptionist test

Implemented and tested locally on 24 October 2026. Number purchases remain disabled. The test agent is `d533231b-4db0-4656-8f08-de4319f3bd68` (VocollAI Receptionist).

## Selected pipeline

- STT: Deepgram `nova-3`, `language=multi`. Current language-prompting documentation lists Telugu and English and describes within-sentence switching. Both REST and live streaming recognized the synthetic Telugu test. English loanwords were sometimes transcribed into Telugu script, and VocollAI was transcribed phonetically; these are not evidence of perfect entity recognition.
- LLM: existing organization-resolved Gemini `gemini-3.1-flash-lite` key. The model receives a conversational Telugu-English policy, Telugu-script/Latin-English examples, caller-preference handling and action-truthfulness instructions through `effectiveInstructions()`. Text tests and compiled voice bundles use that same policy.
- TTS: Cartesia `sonic-3.6`, native Telugu voice **Sindhu — Conversational Partner**, ID `07bc462a-c644-49f1-baf7-82d5599131be`. The account voice catalog lists native Telangana Telugu and additional English accents. Set `language=te` for the whole mixed sentence, preserving the voice; change to `en` for fully English turns.
- Transport: the existing media worker and signed control-plane routes. Native speech-to-speech is not used.

This is the best practical starting point tested with the existing credentials, not a benchmark claiming superiority over every alternative. Sarvam Saaras (`codemix` mode) and Bulbul are relevant India-focused candidates, but no Sarvam key is configured, so they were researched rather than benchmarked. ElevenLabs Scribe v2 also documents Telugu/code-mixed recognition; its Flash v2.5 TTS language list does not include Telugu, so the app's existing Flash selection is not an appropriate Telugu voice replacement.

## Behavior and safety

The studio has a **Natural Telugu-English** speaking style under **Voice and AI**. Selecting it configures the separate pipeline and native Telugu voice. Existing ordinary agents retain their prior instruction behavior. Bundle compilation rejects incompatible model/language settings for this preset.

Mixed sentences use familiar words such as demo, platform, callback, team and save instead of forcing formal translations. The policy asks for brief replies, one question at a time, and fully English or simple Telugu responses when requested. Naturalness and exact reply length still depend on model behavior.

Callback details now accept `te`. Telugu readback and strict explicit assent/denial recognition are supported. Corrections, ambiguous answers and low-confidence confirmations do not authorize writes. The callback tool gets a new immutable revision for the expanded language schema; existing published revisions are preserved. Saving a request does not send notifications or guarantee a return call.

Only the test agent's saved draft and its draft callback-tool binding were updated. Existing published deployments were not promoted or overwritten.

## Validation completed

- Console TypeScript check passed; runtime TypeScript check/build passed.
- All **59 tests** passed, including new checks for Telugu-English instruction compilation, TTS language propagation and Telugu confirmation ambiguity/denial.
- Console production build passed.
- Actual media session with synthetic caller audio: `7624328f-7305-4f90-9c51-32a81311f991`.
- Recognized a spoken Telugu product/demo enquiry, generated and streamed a mixed Telugu-English response, then recognized an English-only request and streamed an English response using the same voice ID.
- Captured 7,884 output audio frames, saved transcripts and completed session teardown. No real person was called and no telephone number was purchased.
- Initial test exposed a Telugu callback promise; instructions were tightened, and the repeated test offered only inbox saving without promising staff contact.

Local evidence: `.telugu-call-results.local.json`, `.telugu-agent-output.local.wav`, `.telugu-probe-results.local.json`, `.telugu-studio.local.png`, `.telugu-tests.local`, `.telugu-build.local`. Join grants stay in a private ignored local file and are not documentation or application credentials.

This is a synthetic functional audio test, not a native-speaker quality benchmark or a verified PSTN call. Before production, evaluate Telugu-English with native speakers, noisy telephone audio, interruptions, dates, names and phone numbers; exercise the complete Telugu callback confirmation/save flow over live audio.

## Try it

1. Open the local VocollAI Receptionist agent.
2. Under **Voice and AI**, verify **Natural Telugu-English** and the separate STT → LLM → TTS pipeline.
3. Open **Test** and click **Start test call**. Allow microphone access when prompted.
4. Say “VocollAI platform గురించి చెప్పండి. నాకు ఒక demo కావాలి.”
5. Ask “Please speak only in English,” then return to Telugu-English.
6. End the call when finished. No publication or number purchase is needed for a draft browser test.

The local console and separate runtime worker must both be running (`npm run dev` at the repository root and in `runtime/`). Existing server-side credentials are used through the provider registry.

## Primary sources checked

- [Deepgram Nova-3 language prompting](https://developers.deepgram.com/docs/nova-3-language-prompting)
- [Cartesia Sonic 3.6 languages](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)
- [Cartesia multilingual voice selection and accent behavior](https://docs.cartesia.ai/build-with-cartesia/capability-guides/multilingual-voices)
- [Sarvam streaming STT and code-mix modes](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api)
- [Sarvam TTS language support](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/how-to/set-the-language)
- [ElevenLabs mixed-language transcription](https://elevenlabs.io/blog/scribe-v2-just-got-an-upgrade)
- [ElevenLabs Flash TTS language coverage](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support)
