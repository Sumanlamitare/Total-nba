import { handler } from '../lib/http.js';
import { meta } from '../lib/store.js';

export default handler(() => meta());
