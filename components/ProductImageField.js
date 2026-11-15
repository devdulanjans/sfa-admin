import { useEffect, useRef, useState } from 'react';

// Optional product picture for the public website (V123). The file is only picked here; the
// product page uploads it when the product is saved. Not shown in the sales rep app.
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 3 * 1024 * 1024;

export default function ProductImageField({ currentUrl, file, removed, onPick, onRemove, onUndo }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!TYPES.includes(f.type)) { setError('Use a JPG, PNG, WebP or GIF image.'); return; }
    if (f.size > MAX_BYTES) { setError('The picture must be 3 MB or smaller.'); return; }
    setError('');
    onPick(f);
  }

  const shown = preview || (!removed ? currentUrl : null);

  return (
    <div>
      <label className="label">Product picture <span className="font-normal text-gray-400">(optional — shown on the website)</span></label>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Product" className="h-full w-full object-cover" />
          ) : (
            <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.6-4.6a2 2 0 012.8 0L16 16m-2-2l1.6-1.6a2 2 0 012.8 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
        <div className="space-y-1.5 text-sm">
          <input ref={input} type="file" accept={TYPES.join(',')} className="hidden" onChange={choose} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => input.current?.click()}>
              {shown ? 'Change picture' : 'Add picture'}
            </button>
            {file && (
              <button type="button" className="text-xs text-gray-500 underline" onClick={() => onPick(null)}>
                Cancel
              </button>
            )}
            {!file && currentUrl && !removed && (
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={onRemove}>
                Remove
              </button>
            )}
            {removed && !file && (
              <button type="button" className="text-xs text-gray-500 underline" onClick={onUndo}>
                Undo remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {file ? `${file.name} — saved when you save the product.`
              : removed ? 'The picture will be removed when you save.'
              : 'JPG, PNG, WebP or GIF, up to 3 MB. A square picture looks best.'}
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
