# JURO Legal Intelligence

JURO helps people obtain source-grounded explanations of Uzbekistan law and turn those explanations into practical next steps.

## Language

**Legal Answer**:
A structured, source-grounded response to a legal question, led by the Main Point and followed by What the Law Says and What to Do Next. Supporting sections appear only when they contain relevant information.
_Avoid_: AI response, generated text, chat completion

**Main Point**:
The concise, plain-language conclusion that leads every substantive Legal Answer.
_Avoid_: summary, short answer, abstract

**What the Law Says**:
The part of a Legal Answer that connects each applicable legal proposition to validated official evidence.
_Avoid_: model reasoning, general legal knowledge, references

**What to Do Next**:
The ordered practical guidance that follows from the supported legal analysis.
_Avoid_: action-plan upsell, recommendations panel, suggested prompts

**Supporting Sections**:
Relevant qualifications presented separately as Important Considerations, Deadlines, What to Prepare, or Additional Materials; empty sections are absent.
_Avoid_: additional details, miscellaneous information

**Conditional Answer**:
A Legal Answer that presents separately supported outcomes for unresolved facts and asks only for information that would materially change the result.
_Avoid_: assumption, best guess, generic disclaimer

**Insufficient-Evidence Result**:
A dedicated non-answer stating what was checked, what evidence is missing, and which focused questions or next actions could make a supported Legal Answer possible.
_Avoid_: uncertain answer, likely answer, empty Legal Answer

**Citation**:
The visible connection between a legal proposition and the validated source evidence that supports it.
_Avoid_: source link, bibliography entry, model reference

**Indexed Official Corpus**:
JURO's reviewed and indexed collection of official legal sources that is searched before any online source.
_Avoid_: knowledge base, local data, internal search

**Live Official Search**:
Request-scoped retrieval from validated online Lex.uz pages when the Indexed Official Corpus does not provide sufficient current coverage.
_Avoid_: web search, internet search, Lex fallback

**Secondary Web Research**:
Cited research from the wider internet used only for supporting context when official sources remain insufficient; it cannot establish a legal rule, deadline, calculation, or mandatory action.
_Avoid_: official source, legal authority, general search

**Source Ladder**:
The strict escalation order from Indexed Official Corpus to Live Official Search and only then to Secondary Web Research.
_Avoid_: parallel search, blended search

**Official Coverage**:
The degree to which validated official evidence supports the legal propositions needed for a Legal Answer; coverage may be good, partial, weak, or absent.
_Avoid_: confidence score, source count, retrieval success
