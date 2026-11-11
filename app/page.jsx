import { readFileSync } from 'node:fs';
import path from 'node:path';
import Viewer from './Viewer';

// The page markup is static HTML shared with the single-file build; the viewer script mounts
// onto it in the browser. Read at build time, so the page is fully static.
const markup = readFileSync(path.join(process.cwd(), 'viewer/markup.html'), 'utf8');

export default function Page() {
  return <Viewer markup={markup} />;
}
