"""The local server behind the MOJi browser extension.

Each module is one job, with its own FastAPI router:
    speech     voices, speech synthesis (edge-tts) and the audio cache
    words      splitting Japanese into words: readings, dictionary forms, grammar patterns
    translate  Japanese to English through the free Google and Bing web translators
    grammar    finding grammar patterns (〜ている ...) in a list of words; no web parts
config holds the paths and limits shared by all of them. app.py puts it all together.
"""
