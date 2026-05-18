import { describe, expect, it } from 'vitest';
import { BLAST_TEMPLATES, renderTemplate } from '../src/lib/blast-templates';

// Pure render contract for the /admin/blast preset picker. These tests
// exist to prevent two specific regressions:
//   1. Adding a template to BLAST_TEMPLATES without wiring renderTemplate
//      (the switch falls through to {subject:'',body:''}, the UI would
//      silently clear the fields when picked).
//   2. Drift in the templates' user-visible content — the RSVP nudge has
//      to name the event month, the Venmo template has to actually link
//      to @Jafisher88. Either failing in prod = a bad send.

const LOCKED_CTX = {
  monthLong: 'November',
  longDisplay: 'Saturday, November 7, 2026',
  isLocked: true,
};

const UNLOCKED_CTX = {
  monthLong: 'November',
  longDisplay: 'November 2026',
  isLocked: false,
};

describe('renderTemplate', () => {
  it('blast-templates.custom: returns empty subject and body', () => {
    const r = renderTemplate('custom', UNLOCKED_CTX);
    expect(r).toEqual({ subject: '', body: '' });
  });

  it('blast-templates.unknown: unknown id falls through to empty render', () => {
    const r = renderTemplate('this-does-not-exist', UNLOCKED_CTX);
    expect(r).toEqual({ subject: '', body: '' });
  });

  it('blast-templates.rsvp-nudge.subject-month: subject names the event month when no date is locked', () => {
    const r = renderTemplate('rsvp-nudge', UNLOCKED_CTX);
    expect(r.subject).toContain('this November');
  });

  it('blast-templates.rsvp-nudge.subject-locked: subject uses the long date display when a date is locked', () => {
    const r = renderTemplate('rsvp-nudge', LOCKED_CTX);
    expect(r.subject).toContain('Saturday, November 7, 2026');
  });

  it('blast-templates.rsvp-nudge.body-firstName: body contains the {firstName} merge tag', () => {
    const r = renderTemplate('rsvp-nudge', UNLOCKED_CTX);
    expect(r.body).toContain('{firstName}');
  });

  it('blast-templates.rsvp-nudge.body-link: body links to the /rsvp page', () => {
    const r = renderTemplate('rsvp-nudge', UNLOCKED_CTX);
    expect(r.body).toContain('https://cliohsreunion.com/rsvp');
  });

  it('blast-templates.venmo-donate.subject-nonempty: returns a non-empty subject', () => {
    const r = renderTemplate('venmo-donate', UNLOCKED_CTX);
    expect(r.subject.length > 0).toBe(true);
  });

  it('blast-templates.venmo-donate.body-link: body contains the Venmo URL', () => {
    const r = renderTemplate('venmo-donate', UNLOCKED_CTX);
    expect(r.body).toContain('https://venmo.com/u/Jafisher88');
  });

  it('blast-templates.venmo-donate.body-firstName: body contains the {firstName} merge tag', () => {
    const r = renderTemplate('venmo-donate', UNLOCKED_CTX);
    expect(r.body).toContain('{firstName}');
  });
});

describe('BLAST_TEMPLATES', () => {
  it('blast-templates.catalog.custom-first: first entry is the custom blank option', () => {
    expect(BLAST_TEMPLATES[0]?.id).toBe('custom');
  });

  it('blast-templates.catalog.unique-ids: every template id is unique', () => {
    const ids = BLAST_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('blast-templates.catalog.every-id-renders-nonempty-except-custom: every non-custom id renders a non-empty body', () => {
    const empties = BLAST_TEMPLATES
      .filter((t) => t.id !== 'custom')
      .filter((t) => renderTemplate(t.id, UNLOCKED_CTX).body.trim() === '')
      .map((t) => t.id);
    expect(empties).toEqual([]);
  });
});
