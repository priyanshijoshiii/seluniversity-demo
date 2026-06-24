# Bug #1: XSS Vulnerability in renderContent

**how to reproduce:**
1. log in to Self University
2. create a new post containing a markdown trigger character (e.g. a backtick) alongside a malicious HTML tag 
e.g: `code` <img src = x onerror = "alert('XSS')">
3. submit the post
4. any user who views the post will have the onerror JavaScript execute in their browser

**why is this problem:**
`dangerouslySetInnerHTML` renders content as real, executable HTML/DOM elements instead of plain text. since post contents comes directly from users, a malicious user can type something like <img src=x onerror="alert('hacked')"> alongside any markdown trigger character and the browser would actually execute that code for every other user who views the post

```ts
// User typed: `code` <img src=x onerror="alert('hacked')">
const html = content.replace(/`(.*?)`/g, '<code>$1</code>')
// html is now: <code>code</code> <img src=x onerror="alert('hacked')">

return <span dangerouslySetInnerHTML={{ __html: html }} />
// Browser renders the img tag and executes onerror
```
The user's malicious <img> tag rides through completely untouched.

**Suggested fix:**

*first approach:* we can sanitize our html before, using a library called DOMPurify, it will remove any dangerous tags like <script>, <img>, event handlers like `onerror`, etc.

```ts
import DOMPurify from 'dompurify'

const html = content
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>)
    //other replacements

///DOMPurify strips ALL dangerous tags before rendering
const safeHtml = DOMPurify.sanitize(html)
return <span dangerouslySetInnerHTML = {{__html: safeHtml}}/>   
```
DOmpurify scans the HTML and removes anything dangerous e.g. <script>, <img onerror>, onclick, all of it. Only safe formatting tags like <b>, <i>, <code> survive.

*second approach:* you could avoid the `dangerouslySetInnerHTML` entirely and instead parse the markdown yourself and return React elements directly

```ts
// instead of building an html string and injecting it
// build react elements directly , react handles escaping automatically

const parts = content.split()
return (
    <span>
        {parts.map((part, i) => {
            if (part.startsWith('**')) return <b key = {i}>{part.slice(2,-2)}</b>
            if (part.startsWith('`')) return <code key = {i}>{part.slice(1,-1)}</code>
            if (part.startsWith('~~')) return <s key = {i}>{part.slice(2,-2)}</s>
            return <span key={i}>{part}</span> //plain text -> react escapes
        })}
    </span>
)

```
Here, <img src=x onerror="..."> in the user's plain text would just render as the literal text <img src=x onerror="..."> on screen - completely harmless because React escapes it

**Recommended fix:** Fix 2 (React elements) - no external library needed, 
React's own escaping handles security automatically, and the markdown 
patterns here are simple enough to parse manually.

**tests to add:**
- when a user types `<img src=x onerror="alert('hacked')">` in a post, it should render as literal text on screen, not execute any JavaScript
- when a user types `**hello**`, it should render as bold text
- when a user types `~~hello~~`, it should render as strikethrough text
- when a user types a backtick around a word, it should render as code text
- when a user types `@username`, it should render as a clickable link to that profile
- when content contains both markdown and a malicious HTML tag, the HTML tag should show as plain text and the markdown should still format correctly

# Bug #2: the editor and the state keep triggering each other in a loop.

**how to reproduce:**
1. user types in the editor
2. `handleEditorInput` runs -> saves content state
3. state change triggers use effect
4. `useEffect` sets ` editorRef.current.innerHTML = ...`
5. setting innerHTML fires the `onInput` event
6. `handleEditorInput` runs again ->back at step 2

**why is this problem:**
When the user types, handleEditorInput saves the text to state. This triggers the useEffect, which updates the editor's HTML. But updating the editor's HTML fires onInput again, which triggers handleEditorInput again. This creates a loop that caused unnecessary re-renders, potential cursor jumping(the cursor resets when the innerHTML is set) and performance issues.

**suggested fix** 
The code already has this check:
```ts
if (!editorRef.current.isSameNode(document.activeElement))
```
So it only syncs when not focused. The real problem is that this check alone isn't reliable enough. the condition should also verify the content actually changed before setting innerHTML:
```ts
useEffect(() => {
  if (content && editorRef.current && !editorRef.current.isSameNode(document.activeElement)) {
    const html = content
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/_(.*?)_/g, '<i>$1</i>')
      .replace(/~~(.*?)~~/g, '<s>$1</s>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>')
    // only update if content actually changed - prevents triggering onInput again
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html
    }
  }
}, [content])
```
the `innerHTML !== html` check means we only touch the DOM when something actually changed, so even if the effect runs, it won't fire onInput unless the content is genuinely different.

# Bug #3: the editor component defined inside PostComposer
**how to reproduce:**
1. Open the post composer
2. Type any character
3. Notice the editor loses focus after each keystroke
**why is it a problem**
so on every keystroke
- react sees the old editorContent -> destroys it
- react sees the new editorContent -> builds it from scratch
- the editor dev gets unmounted and remounted
- editorref briefly becomes null
- the editor loosed focus mid typing

**suggested fix**
move EditorContent outside of PostComposer

```ts
// Outside PostComposer - created once, stable for-ever
const EditorContent = ({ editorRef, onInput, onFocus, onBlur, onKeyDown, isRu }) => (
  <div
    ref={editorRef}
    contentEditable
    onInput={onInput}
    ...
  />
)

export function PostComposer({ onPost, inModal, onRateLimit }) {
  // EditorContent is now stable - React never remounts it
  return (
    <>
      <EditorContent editorRef={editorRef} ... />
    </>
  )
}
```
now react sees the same function every render -> no unmounted -> no focus loss

**tests to add:**
- when a user types in the composer, the editor should not lose focus between keystrokes
- editorRef should never be null while the user is actively typing
- the editor should not remount when PostComposer re-renders

# Bug #4: the formatbar is defined inside postcomposer
**how to reproduce**
1. open post composer
2. type some text and select it
3. click the bold button
4. notice the bold button doesn't stay highlighted

**why it's a problem**
formatbar is defined inside the PostComposer, so it remounts constantly and the closure over selectionState can be stale

**suggested fix**
move formatbar outside, pass selectionstate and applyformat as props

**tests to add:**
- when text is selected and bold is applied, the bold button should remain highlighted
- when the user clicks a format button, the selection state should reflect the current formatting
- FormatBar should not remount when PostComposer re-renders

# Bug #5: in handlePost, the character count limit is inconsistent
**how to reproduce**
1. user starts typing
2. in normal mode see 500 as the limit
3. switches to full screen, the limit changes to 1500

**why is it a problem**
the regular editor shows 500 as the limit and the fullscreen shows 1500 as the limit, but they use the same content state and the same handlePost function, there is no actual maxLen limit anywhere in the code

**Suggested fix:**
Define the limit as a constant once at the top of the file:
```ts
const MAX_POST_LENGTH = 500
```
Use it in both counters:
```ts
{content.length} / {MAX_POST_LENGTH}
```
And enforce it in `handlePost` before sending:
```ts
if (content.length > MAX_POST_LENGTH) return
```
This way the limit is defined once, shown consistently, and actually enforced.

**tests to add:**
- when a user types exactly 500 characters, the post button should be enabled and post should submit
- when a user types 501 characters, the post button should be disabled and handlePost should return early
- both the normal editor and fullscreen editor should show the same limit number

# Bug #6: formatTimestamp defined twice with broken logic

**how to reproduce**
1. user adds time at 11 50 pm 
2. the next day, the app still shows yesterday because oft he hours<24 logic
3. if a user ads any gibberish sting in lang, there is no way to protect that

**why is the problem**
- user adds time at 11 50 pm ,the next day, the app still shows yesterday because oft he hours<24 logic
- lang type is too loose
- the function is duplicated, defined inside both commentItem and PostCard

**suggested fix**
```ts
// Formatters are created once and reused on every call 
const formatters = {
    enTime: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    ruTime: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    enDate: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
    ruDate: new Intl.DateTimeFormat('ru-RU', { month: 'short', day: 'numeric' }),
}

function formatTimestamp(ts: number, lang: 'ru' | 'en'): string {

    // Defensive runtime validation in case the function is called from untyped JavaScript or external data 
    const safeLang: 'ru' | 'en' = (lang === 'ru' || lang === 'en') ? lang : 'en'

    // validate input type -> catches NaN, Infinity, -Infinity (Bug 3 fix)
    if (!Number.isFinite(ts)) {
        return ''
    }

    // validate resulting Date object (Bug 4 fix)
    const date = new Date(ts);
    if (isNaN(date.getTime())) {
        return ''
    }

    const now = new Date()

    // Compare calendar dates, not hours elapsed 
    try {
        const isToday = date.getDate() === now.getDate() &&
                        date.getMonth() === now.getMonth() &&
                        date.getFullYear() === now.getFullYear();

        const timeStr = safeLang === 'ru'
          ? formatters.ruTime.format(date)
          : formatters.enTime.format(date)

        if (isToday) return timeStr;

        const dateStr = safeLang === 'ru'
          ? formatters.ruDate.format(date)
          : formatters.enDate.format(date)

        return dateStr + ' · ' + timeStr
    } catch {
        //  never throw, regardless of environment
        return ''
    }
}
```
**tests to add:**
- a post made at 11:50 PM should show the date (not just time) when viewed the next day at 11:00 AM
- a post made today should show only the time, not the date
- if an invalid timestamp is passed, the function should return an empty string instead of crashing
- both CommentItem and PostCard should show the same formatted timestamp for the same input

# Bug #7: alert operator precedence bug in error handling
**how to reproduce**
1. trigger a post creation error as a Russian language user
2. the alert shows only "Не удалось создать пост: ", with no error detail

**why is this a problem**
```ts
alert(isRu ? 'Не удалось создать пост: ' : 'Failed to create post: ' + (error.message || 'Unknown error'))
```
JavaScript evaluates `+` before `?:`. So this actually reads as:
```ts
alert(isRu ? 'Не удалось создать пост: ' : ('Failed to create post: ' + (error.message || 'Unknown error')))
```
Russian users always see just `'Не удалось создать пост: '` with no error detail. The error message is only appended to the English string.

**suggested fix**
```ts
const errorMessage = error.message || 'Unknown error'
alert(isRu ? `Не удалось создать пост: ${errorMessage}` : `Failed to create post: ${errorMessage}`)
```
Use template literals and extract the error message first so both languages get the detail.

**tests to add:**
- When isRu is true and post creation fails with an error message, the alert should show "Не удалось создать пост: Server timeout"
- when isRU is false  and the post creation fails with error message the alert should show " failed to create post: Server timeout"
- when post creation fails but error.message is empty or undefined, the alert should show "Failed to create post: Unknown error" - not "Failed to create post: undefined"

# Bug #8: no rate limiting in handleRepost and button never disables
**how to reproduce**
1. user clicks the repost button multiple times
2. user clicks again while still posting

**why is it a problem**
a user can click repost multiple times with no confirmation, no check if they already reposted, no rate limiting. handleRepost is an async function but has no loading state shown on the button itself. so if the user clicks it while it's still posting, it fires again

**suggested fix**
```ts
const [isReposting, setIsReposting] = useState(false)

const handleRepost = async () => {
  if (!user || isReposting) return  // guard
  setIsReposting(true)
  try {
    await createPost({ ... })
    setShowRepostToast(true)
  } finally {
    setIsReposting(false)
  }
}

// and disable the button:
<button 
  disabled={isReposting}
  onClick={(e) => { e.stopPropagation(); handleRepost() }}
>
  <Repeat2 className="h-4 w-4" />
</button>
```

We add an `isReposting` state that starts as `false`. When the user clicks Repost, we immediately set it to true - this disables the button so it can't be clicked again. After the request finishes (whether it succeeded or failed), we set it back to false inside finally - finally runs no matter what, so the button always gets re-enabled.

**tests to add:**
- clicking the repost button twice quickly should only create one repost
- the repost button should be visually disabled while the request is in progress
- if createPost throws, the button should re-enable and not leave the UI stuck
# Bug #9: N+1 query problem in CommentItem

**how to reproduce**
1. open a post with many comments

**why is it a problem**
every CommentItem component calls this:

```ts
const reactions = useQuery(api.reactions.getPostCommentReactions, {commentId: comment._id})
```
this fires a separate convex query for every single comment rendered on the screen

so if a post has 50 comments, its 50 separate database queries firing at the same time, just to load reactions. every time the page renders, 50 requests go out

this is called a N+1 query problem, instead of one query that fetches all comments at once, we are making N queries for N comments

**suggested fix** 
fetch all reactions for all the comments in one query at the postCard level, then pass them down to each commentItem as a prop, similar to how reactionsMap is already being passed in for post reactions

**Note:** This requires a new Convex query e.g. `getReactionsByCommentIds` 
that accepts an array of comment IDs and returns all reactions in one call, 
rather than the current per-comment query pattern. the frontend change below is blocked on this backend query existing first.

```ts
// step 1: add this query on the backend first
// api.reactions.getReactionsByCommentIds({ commentIds: string[] })

// step 2: then in PostCard, replace the per-comment queries with one call
const commentReactionsMap = useQuery(api.reactions.getReactionsByCommentIds,
  comments ? { commentIds: comments.map(c => c._id) } : 'skip'
)

// step 3: pass reactions down to each CommentItem as a prop
<CommentItem
  comment={c}
  reactions={commentReactionsMap?.get(c._id) ?? []}
  ...
/>
```

**tests to add:**
- when a post has 50 comments, only 1 database query should fire for reactions, not 50
- reactions should still display correctly for each comment after the refactor
- if getReactionsByCommentIds returns no data for a comment, that comment should show zero reactions rather than crashing

# Bug #10: there is no length check on repost content
**how to reproduce**
1. user writes a content of 500 character and it gets rejected even though it is the in the limit

**why is it a problem**
if post.content is 500 characters, the repost adds the prefix on top, making it potentially 520+ characters, which would exceed the server's limit and either silently fail or error

**suggested fix** 
before sending the repost, check if the combined content would be too long. if it is, either truncate the original content or show an error message to the user
```ts
const prefix = `🔄 ${isRu ? 'Репост от' : 'Repost from'} @${post.authorUsername}:\n\n`
const maxLength = 500
const trimmedContent = post.content.slice(0, maxLength - prefix.length)

content: prefix + trimmedContent
```
**tests to add:**
- when original post is 500 characters, the reposted content should be trimmed so that prefix + content never exceeds 500 characters total
- when original post is short (e.g. 10 characters), the full content should appear untrimmed in the repost
- the English prefix and Russian prefix are different lengths, so trimming should be calculated separately for each language.

# Bug #11: navigator.clipboard only works in secure contexts (HTTPS)
**how to reproduce**
1. if someone is on HTTP (local dev environment or some deployments)

**why is it a problem**
navigator.clipboard only works in secure contexts (HTTPS). if someone is on HTTP, this silently fails with no feedback to the user. also there's no .catch() -> if it fails, user has no idea

**suggested fix**
First we check if `navigator.clipboard` even exists; if it doesn't, we immediately tell the user instead of silently failing. Then we chain .then() and .catch() onto the clipboard call so the user always gets feedback; either "link copied" or "failed to copy". No more silent failures.
```ts
const handleShare = () => {
  if (!navigator.clipboard) {
    alert(isRu ? 'Буфер обмена недоступен' : 'Clipboard not available')
    return
  }
  navigator.clipboard
    .writeText(`${window.location.origin}/${lang}/posts/${post._id}`)
    .then(() => alert(isRu ? 'Ссылка скопирована' : 'Link copied!'))
    .catch(() => alert(isRu ? 'Не удалось скопировать' : 'Failed to copy link'))
}
```
**tests to add:**
- when navigator.clipboard is not available, the user should see "Clipboard not available" alert
- when copying succeeds, the user should see "Link copied!" alert
- when copying fails, the user should see "Failed to copy link" alert

# Bug #12: no fallback if comment.authorAvatar is empty string
**how to reproduce**
1. pass nothing in image of avatar

**why is it a problem**
there is no fallback if comment.authorAvatar is an empty string, or null. the img tag renders with an empty src, which causes a broken image icon to show

**suggested fix**
We add an onError handler to the img tag. If the image URL is broken or empty, the browser fires onError and we hide the image entirely. Then we show a plain gray circle div as a fallback - so the user always sees something in the avatar spot instead of a broken image icon.
```ts
{comment.authorAvatar && comment.authorAvatar.length > 4 ? (
  <img 
    src={comment.authorAvatar} 
    className="h-6 w-6 rounded-full mt-0.5 object-cover" 
    alt=""
    onError={(e) => { e.currentTarget.style.display = 'none' }}
  />
) : (
  <div className="h-6 w-6 rounded-full mt-0.5 bg-gray-200 dark:bg-white/10 flex-shrink-0" />
)}
```
**tests to add:**
- when comment.authorAvatar is an empty string, a gray circle should show instead of a broken image
- when comment.authorAvatar is a valid URL, the image should show normally
- when the image URL fails to load, onError should hide the broken image icon
- same three cases apply for post.authorAvatar in PostCard
# maintainability concern #13: document.execCommand is deprecated
**the concern**
`document.execCommand` was officially marked as deprecated by all the major browsers: that means
- browser makers have stopped improving it
- it could be removed in future browser updates
- it already behaves inconsistently across browsers, chrome, firefox, and safari sometimes produce different HTML from same command
- it is not broken today, but if chrome removes it in the future updates, the entire formatting toolbar stops working overnight with no warning

**suggested fix**
the fix is to replace it with the modern Selection API; manually reading what text the user has selected and wrapping it in the appropriate tags yourself
```ts
// instead of:
document.execCommand('bold')

// use Selection API:
const selection = window.getSelection()
if (!selection || selection.rangeCount === 0) return
const range = selection.getRangeAt(0)
const selectedText = range.toString()
const boldNode = document.createElement('b')
boldNode.textContent = selectedText
range.deleteContents()
range.insertNode(boldNode)
```
this manually checks what user selected and then wrap in appropriate tags

**tests to add:**
- applying bold, italic, and strikethrough formatting should produce correct output in Chrome, Firefox, and Safari
- formatting an empty selection should not modify the editor content
- formatting should work correctly when the cursor is placed inside already-formatted text

# Bug #14 mention regex breaks non-standard usernames
**how to reproduce**
- user types a username e.g @john-sina, the app only create a mention for john 

**why is this a problem**
So if a user types @john-doe, the app only creates a mention for john, not john-doe. The link goes to the wrong profile.

**suggested fix**
*primary fix:*update the regex to include any extra characters your username rules allow
```ts
//before
/@(\w+)/g

// after(allows hyphen)
/@([\w-]+)/g
```
*secondary fix:*enforce username character rules strictly at account creation so the regex and the allowed characters always stay in sync

**tests to add:** 
- when a user types @john-doe in a post, the mention should link to the john-doe profile, not john
- when a user types @john (no hyphen), it should still work correctly as before
- when a user types @john_doe (underscore), it should still work correctly as before
- when handlePost extracts mentions from content containing @john-doe, the mentions array should contain john-doe, not john
# Bug #15 post.authorAvatar in PostCard has no fallback
this one is similar to bug#12
**how to reproduce**
1. post an empty URL 

**why is this a problem**
If post.authorAvatar is empty or the URL is broken, a broken image icon shows.

**suggested fix**
we need an onError handler
```ts
// before:
<img src={post.authorAvatar} className="h-10 w-10 rounded-full" alt="" />

// after:
<img 
  src={post.authorAvatar} 
  className="h-10 w-10 rounded-full object-cover"
  alt=""
  onError={(e) => { e.currentTarget.style.display = 'none' }}
/>
```
If the image URL fails to load, onError hides the broken image icon. A gray circle fallback div should be shown in its place, same as the fix in Bug #12.

**tests to add:** (same as bug #12)
- when post.authorAvatar is an empty string, a gray circle should show instead of a broken image
- when post.authorAvatar is a valid URL, the image should show normally
- when the image URL fails to load, onError should hide the broken image icon
# Bug #16: unused query - allItems

**the issue**
```ts
const allItems = useQuery(api.shop.getItems)
```
this Convex query is called on every render of `PostComposer` but the result is never read anywhere in the component. it fires a network request every time the composer mounts, for no benefit.

**suggested fix**
remove the line entirely. if `allItems` is needed in the future, it can be added back when it is actually used.

**tests to add:**
- on mount, PostComposer should not fire a getItems query

# Bug #17: trailing spaces added to every text segment in renderContent

**the issue**
```ts

return <span key={i}>{part} </span>   //trailing space after {part}
```
and for mentions:
```ts
{part}{' '}
```
every plain text segment and every @mention gets a space unconditionally appended. this causes double-spacing after mentions and adds unexpected whitespace when the content is copied and pasted.

**suggested fix**
remove the trailing spaces and let the content's own whitespace control spacing.
```ts
// before
return <span key={i}>{part} </span>

// after
return <span key={i}>{part}</span>
```

**tests to add:**
- copying the text content of a rendered post should not contain extra spaces after mentions
- a post with `@alice and @bob` should render with a single space between words, not double spaces
