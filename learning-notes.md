## dangerouslySetInnerHTML
**What it is:** A React prop that injects raw HTML directly into the page instead of treating it as plain text.
**Why it matters:** React normally escapes everything for safety. This prop disables that — if the HTML contains malicious code (like an `<img onerror>`), the browser will actually run it. This is how XSS attacks happen.
**Real example:**
```ts
return <span dangerouslySetInnerHTML={{ __html: html }} />

dangerouslySetInnerHTML renders content as real, executable HTML/DOM elements instead of plain text. Since post content comes directly from users, a malicious user could type something like <img src=x onerror="alert('hacked')"> alongside any markdown trigger character, and the browser would actually execute that code for every other user who views the post."

```