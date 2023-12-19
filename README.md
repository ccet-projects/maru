# maru
Минималистичный фреймворк для корпоративных проектов

```js
import maru from 'maru';

const app = maru(import.meta.url);
await app.start();
// Do something
await app.stop();
```

```js
import APIError from 'maru/ApiError.js';
```