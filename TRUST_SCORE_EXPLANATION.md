# Trust Score Calculation & Information Flow

## How Trust Score is Calculated

The trust score (0-100) is calculated using a weighted formula that combines multiple factors:

### Formula

```
Trust Score = 
  45% × Source Quality (when sources available)
+ 30% × Model Consensus (LLM confidence)
+ 10% × Recency (how recent are sources)
+ 10% × Agreement (fraction of high-quality sources)
- 5% × Bias Penalty

When NO sources are available:
  20% × Source Quality (default 0.3)
+ 50% × Model Consensus (higher weight)
+ 5% × Recency
+ 5% × Agreement
- 5% × Bias Penalty
```

### Components Explained

1. **Source Quality (45% weight, or 20% if no sources)**
   - Average credibility score of all sources (0-1)
   - Each source has a `credibilityScore` based on domain reputation
   - Default: 0.3 if no sources available

2. **Model Consensus (30% weight, or 50% if no sources)**
   - The `confidence` value from Backboard's analysis (0-1)
   - Represents how confident the AI is in the verdict
   - Higher weight when no web sources are available

3. **Recency (10% weight, or 5% if no sources)**
   - How recent the sources are:
     - < 1 week: 1.0
     - < 1 month: 0.9
     - < 1 year: 0.7
     - Older: 0.4

4. **Agreement (10% weight, or 5% if no sources)**
   - Fraction of sources with credibility ≥ 0.7
   - Measures independent agreement from high-quality sources

5. **Bias Penalty (-5% weight)**
   - Penalty based on detected bias:
     - `(abs(politicalBias) × 0.5) + (sensationalism × 0.5)`
   - Reduces trust score for biased content

### Trust Score Labels

- **75-100**: "Likely True" (green)
- **40-74**: "Unverified / Mixed" (yellow)
- **0-39**: "Likely Misleading" (red)

## Information Flow

### 1. Image Upload → OCR
- User uploads screenshot
- Gemini Vision API extracts all visible text
- Text is logged and passed to next step

### 2. Source Search
- First ~200 chars of OCR text used as search query
- Google Custom Search API finds 5 relevant sources
- Each source gets a credibility score based on domain

### 3. Backboard Analysis
- OCR text + sources sent to Backboard assistant
- Assistant analyzes and returns JSON with:
  - **Claims**: 1-3 factual claims with verdicts
  - **Bias Assessment**: Political bias, sensationalism, overall bias
  - **Summary**: 2-3 sentence summary
  - **Model Consensus**: How 3 AI models would judge the claim

### 4. Trust Score Calculation
- For each claim:
  - Extract `confidence` from Backboard (0-1)
  - Calculate bias penalty from bias assessment
  - Apply weighted formula with sources
  - Result: 0-100 trust score

### 5. Aggregation
- If multiple claims: average their trust scores
- If single claim: use that claim's score
- Generate trust label based on aggregate score

### 6. Display in iOS App
- **Trust Score Gauge**: Large semi-circular gauge showing score
- **Trust Label**: "Likely True" / "Unverified / Mixed" / "Likely Misleading"
- **Summary Card**: Quick 2-3 sentence summary
- **Claims Breakdown**: Each claim with its own score and explanation
- **Sources**: List of verified sources with credibility indicators
- **Bias Slider**: Visual representation of political bias
- **Model Consensus**: Shows how 3 AI models judged the claim

## Common Issues & Fixes

### Issue: Score Always 14%
**Cause**: 
- Backboard returning default confidence (0.5)
- No sources found
- JSON parsing failing

**Fix**:
- Improved Backboard prompt to be more explicit
- Better JSON parsing with logging
- Adjusted formula to handle no-sources case

### Issue: "Likely Misleading" for Everything
**Cause**:
- Low confidence from Backboard
- No sources
- High bias penalty

**Fix**:
- Check Backboard response in logs
- Verify sources are being found
- Check if bias assessment is too harsh

### Issue: Summary/Claims Not Accurate
**Cause**:
- Backboard prompt not clear enough
- JSON parsing extracting wrong fields
- Fallback values being used

**Fix**:
- Improved prompt with explicit examples
- Better JSON extraction
- More detailed logging to see actual responses

## Debugging

Check Vercel function logs for:
1. `[Backboard] Raw response preview` - See what Backboard actually returned
2. `[Backboard] Parsed JSON successfully` - Confirm JSON was parsed
3. `[Analyzer] Claim X:` - See calculated scores for each claim
4. `[Analyzer] Aggregate trust score` - Final score calculation
