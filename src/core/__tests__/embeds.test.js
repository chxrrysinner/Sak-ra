import { describe, it, expect } from 'vitest';
import { HALLOWS_ORANGE, trimTo, isImageAttachment } from '../embeds.js';

describe('embeds', () => {
  it('exports HALLOWS_ORANGE constant', () => {
    expect(HALLOWS_ORANGE).toBe(0xc67a3a);
  });

  it('trimTo truncates long text', () => {
    expect(trimTo('hello world', 5)).toBe('he...');
    expect(trimTo('hello', 10)).toBe('hello');
    expect(trimTo('', 10)).toBe('');
    expect(trimTo(null, 10)).toBe('');
  });

  it('isImageAttachment detects images by contentType', () => {
    expect(isImageAttachment({ contentType: 'image/png' })).toBe(true);
    expect(isImageAttachment({ contentType: 'text/plain' })).toBe(false);
  });

  it('isImageAttachment detects images by URL', () => {
    expect(isImageAttachment({ url: 'https://example.com/photo.png', name: '' })).toBe(true);
    expect(isImageAttachment({ url: 'https://example.com/file.pdf', name: '' })).toBe(false);
  });
});
