/* glanceless's programmatic API is now ShipProbe's. runPage takes the targets and options of the
 * page command; see the shipprobe README. */
export { runPage } from 'shipprobe/page';
export { PASS, FAIL, UNCHECKED, combine, CannotCheck, printResult } from 'shipprobe';
export { GLANCELESS_RULES } from './forward.mjs';
